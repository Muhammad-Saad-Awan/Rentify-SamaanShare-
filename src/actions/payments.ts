"use server";

import { revalidatePath } from "next/cache";

import {
  BookingStatus,
  PaymentProvider,
  PaymentStatus,
} from "@/generated/prisma/enums";
import { getActiveUser } from "@/lib/auth/session";
import { expireStalePendingBookings } from "@/lib/bookings/expire";
import {
  LIFECYCLE_RATE_LIMIT,
  loadBookingForParty,
  transitionBooking,
} from "@/lib/bookings/guard";
import { canTransition } from "@/lib/bookings/lifecycle";
import { emitBookingNotifications } from "@/lib/notifications/create";
import { publishAfterCommit } from "@/lib/realtime/publish";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  bookingActionSchema,
  selectPaymentMethodSchema,
} from "@/lib/validations/booking";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ActionResult } from "@/types";

/**
 * What is left of the offline payment flow.
 *
 * THIS FILE IS BEING DISMANTLED, and the shape it is in says where that got to.
 *
 * `confirmPaymentReceived` is gone. Under the custodial flow the money comes to SamaanShare, so
 * the owner is not in a position to say it arrived - they never see it - and a button asking
 * them to vouch for something they cannot observe was worse than no button. Verification now
 * belongs to `payment-verification.ts`.
 *
 * `selectPaymentMethod` remains, and still does the useful half of its job: it creates the
 * `Payment` row and moves the booking to PAYMENT_PENDING. Only `BANK_TRANSFER` is offered now -
 * cash was a way to pay a person standing in front of you, not a platform.
 *
 * `markDepositReturned` remains too, and should not. The owner does not hold the deposit any
 * more, so recording its return is not theirs to do; it stays only because the administrator
 * screen that replaces it is the next phase, and deleting the one path a finished rental has
 * before building its replacement would leave a gap rather than close one.
 *
 * RENTAL AND DEPOSIT STAY SEPARATE, which outlives the change of model. `Payment.amount` is the
 * rental; `Payment.securityDeposit` is the renter's money, now held by the platform and owed
 * back. Summing them into one figure would erase the distinction the whole return obligation
 * rests on.
 */

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

const CONCURRENT_CHANGE_ERROR =
  "This booking was just updated somewhere else. Please refresh and try again.";

/**
 * The renter chooses how they will pay, moving the booking to PAYMENT_PENDING.
 *
 * Creates the `Payment` row. It starts at `AWAITING_CONFIRMATION` rather than `PENDING`, because
 * `PENDING` describes a payment with no method chosen and choosing the method is what this action
 * does - the row never exists in that state.
 *
 * RE-SELECTION IS ALLOWED while the payment is unconfirmed. A renter who picked cash and then
 * decided to transfer would otherwise be stuck with an instruction panel they cannot act on. Once
 * the owner has confirmed receipt the method is a record of something that happened and is frozen.
 */
export async function selectPaymentMethod(
  input: unknown
): Promise<ActionResult<{ status: BookingStatus }>> {
  const parsed = selectPaymentMethodSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: "Please choose a payment method." };
  }

  const renter = await getActiveUser();

  if (!renter) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(
    `booking-payment:${renter.id}`,
    LIFECYCLE_RATE_LIMIT
  );

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many changes just now. Please try again shortly.",
    };
  }

  const { bookingId, method } = parsed.data;

  try {
    // A request that expired while the renter had the page open must not be payable.
    await expireStalePendingBookings();

    const booking = await loadBookingForParty({
      bookingId,
      userId: renter.id,
      side: "renter",
    });

    if (!booking) {
      return { success: false, error: "That booking was not found." };
    }

    // Changing the method on an already-arranged payment: no status change, just the method.
    if (booking.status === BookingStatus.PAYMENT_PENDING) {
      if (!booking.payment) {
        // PAYMENT_PENDING without a Payment row should be unreachable - the two are written in
        // one transaction below. Reported rather than repaired, because silently creating the
        // missing row would hide whatever produced the inconsistency.
        console.error("PAYMENT_PENDING booking has no payment row", bookingId);

        return { success: false, error: UNEXPECTED_ERROR };
      }

      if (booking.payment.status === PaymentStatus.COMPLETED) {
        return {
          success: false,
          error:
            "The owner has already confirmed this payment, so the method cannot be changed.",
        };
      }

      if (booking.payment.method === method) {
        return { success: true, data: { status: booking.status } };
      }

      await prisma.payment.update({
        where: { id: booking.payment.id },
        data: { method },
      });

      revalidateBookingPaths(booking.listingId);

      return { success: true, data: { status: booking.status } };
    }

    if (!canTransition(booking.status, BookingStatus.PAYMENT_PENDING)) {
      return {
        success: false,
        error:
          booking.status === BookingStatus.PENDING
            ? "The owner has not approved this request yet."
            : "This booking is no longer awaiting payment.",
      };
    }

    const created = await prisma.$transaction(async (tx) => {
      /**
       * The payment row and the status change are one transaction.
       *
       * Separately, a crash between them leaves either a PAYMENT_PENDING booking the owner cannot
       * confirm because there is no payment to confirm, or an orphaned payment row attached to
       * nothing. Both would need manual repair.
       */
      const payment = await tx.payment.create({
        data: {
          provider: PaymentProvider.OFFLINE,
          method,
          status: PaymentStatus.AWAITING_CONFIRMATION,
          // Copied from the booking, which captured them at request time - not re-read from the
          // listing, whose prices may have changed since.
          amount: booking.totalPrice,
          securityDeposit: booking.securityDeposit,
        },
        select: { id: true },
      });

      const moved = await transitionBooking(tx, {
        bookingId: booking.id,
        from: booking.status,
        to: BookingStatus.PAYMENT_PENDING,
        relations: { payment: { connect: { id: payment.id } } },
      });

      if (!moved) {
        return null;
      }

      return emitBookingNotifications(tx, {
        event: "payment-selected",
        bookingId: booking.id,
        listingTitle: booking.listing.title,
        parties: { renterId: booking.renterId, ownerId: booking.ownerId },
        method,
        amount: booking.totalPrice,
      });
    });

    if (!created) {
      return { success: false, error: CONCURRENT_CHANGE_ERROR };
    }

    publishAfterCommit(created);

    revalidateBookingPaths(booking.listingId);

    return { success: true, data: { status: BookingStatus.PAYMENT_PENDING } };
  } catch (error) {
    console.error("selectPaymentMethod failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * The owner records that they have returned the security deposit.
 *
 * A CLAIM, NOT A TRANSFER. The platform is not in the money path, so this stamps
 * `Payment.depositReturnedAt` and tells the renter what the owner said. The renter's notification
 * says so explicitly and points them at the owner if it has not arrived - that is the only honest
 * recourse an offline flow has, and pretending otherwise is what a protection promise the platform
 * cannot keep would look like.
 *
 * Permitted from COMPLETED and REVIEWED. Reviews and the deposit are independent: an owner should
 * not have to wait for a review to hand money back, and a renter who reviewed promptly must not
 * lose the record that their deposit is still outstanding.
 */
export async function markDepositReturned(
  input: unknown
): Promise<ActionResult<{ returnedAt: Date }>> {
  const parsed = bookingActionSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: "That booking was not found." };
  }

  const owner = await getActiveUser();

  if (!owner) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(
    `booking-payment:${owner.id}`,
    LIFECYCLE_RATE_LIMIT
  );

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many changes just now. Please try again shortly.",
    };
  }

  try {
    const booking = await loadBookingForParty({
      bookingId: parsed.data.bookingId,
      userId: owner.id,
      side: "owner",
    });

    if (!booking) {
      return { success: false, error: "That booking was not found." };
    }

    const finished =
      booking.status === BookingStatus.COMPLETED ||
      booking.status === BookingStatus.REVIEWED;

    if (!finished) {
      return {
        success: false,
        error: "Mark the item as returned before recording the deposit.",
      };
    }

    if (!booking.payment) {
      return { success: false, error: "This booking has no payment record." };
    }

    // Local binding so the narrowing survives into the transaction closure.
    const payment = booking.payment;

    if (payment.securityDeposit <= 0) {
      return {
        success: false,
        error: "There was no security deposit on this booking.",
      };
    }

    // Idempotent, and the timestamp must not move: it is the record of when the owner said they
    // handed the money back.
    if (payment.depositReturnedAt) {
      return {
        success: true,
        data: { returnedAt: payment.depositReturnedAt },
      };
    }

    const returnedAt = new Date();

    const created = await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, depositReturnedAt: null },
        data: { depositReturnedAt: returnedAt },
      });

      if (updated.count !== 1) {
        return null;
      }

      return emitBookingNotifications(tx, {
        event: "deposit-returned",
        bookingId: booking.id,
        listingTitle: booking.listing.title,
        parties: { renterId: booking.renterId, ownerId: booking.ownerId },
        amount: payment.securityDeposit,
      });
    });

    if (!created) {
      return { success: false, error: CONCURRENT_CHANGE_ERROR };
    }

    publishAfterCommit(created);

    revalidateBookingPaths(booking.listingId);

    return { success: true, data: { returnedAt } };
  } catch (error) {
    console.error("markDepositReturned failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * Refreshes the surfaces a payment change touches.
 *
 * Mirrors the booking version, including the layout revalidation for the unread badge - which
 * lives in the dashboard header rather than on any of these pages.
 */
function revalidateBookingPaths(listingId: string): void {
  for (const path of [
    "/dashboard/requests",
    "/dashboard/bookings",
    "/dashboard/notifications",
    `/dashboard/listings/${listingId}/availability`,
  ]) {
    revalidatePath(path, "page");
  }

  revalidatePath("/dashboard", "layout");
}
