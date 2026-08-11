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
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  bookingActionSchema,
  selectPaymentMethodSchema,
} from "@/lib/validations/booking";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ActionResult } from "@/types";

/**
 * Offline payment: the renter says how they will pay, the owner confirms it arrived, and later
 * confirms the deposit went back.
 *
 * WHAT "PAYMENT" MEANS HERE. Nothing in this file moves money. Payment is cash or a bank transfer
 * between two people; SamaanShare records what they say happened and when, and that is the whole
 * of it. `Payment.confirmedById` exists precisely so the record says *who* vouched for the money
 * arriving, which is the only thing worth storing about an offline transaction.
 *
 * Consequently there is no refund path, and there cannot be one. `canRenterCancel` refuses a
 * cancellation once payment is confirmed for exactly that reason - see the note there.
 *
 * RENTAL AND DEPOSIT STAY SEPARATE. `Payment.amount` is the rental; `Payment.securityDeposit` is
 * the deposit, which is the renter's money held by the owner and owed back. Summing them into one
 * figure would erase the distinction between what the owner has earned and what they are holding,
 * and the deposit-return obligation is derived from that distinction.
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

    const applied = await prisma.$transaction(async (tx) => {
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
        return false;
      }

      await emitBookingNotifications(tx, {
        event: "payment-selected",
        bookingId: booking.id,
        listingTitle: booking.listing.title,
        parties: { renterId: booking.renterId, ownerId: booking.ownerId },
        method,
        amount: booking.totalPrice,
      });

      return true;
    });

    if (!applied) {
      return { success: false, error: CONCURRENT_CHANGE_ERROR };
    }

    revalidateBookingPaths(booking.listingId);

    return { success: true, data: { status: BookingStatus.PAYMENT_PENDING } };
  } catch (error) {
    console.error("selectPaymentMethod failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * The owner confirms the rental payment reached them.
 *
 * DELIBERATELY DOES NOT START THE RENTAL. Confirming money and handing over an item are two
 * events, often hours or days apart for a bank transfer, and conflating them would mean an owner
 * who confirms a transfer on Monday has a booking that claims the camera left their hands on
 * Monday. `startBooking` is the separate step, and keeping it separate is also what gives the
 * Trust & Safety handover record somewhere to attach.
 *
 * The booking stays in `PAYMENT_PENDING`; only `Payment.status` moves.
 */
export async function confirmPaymentReceived(
  input: unknown
): Promise<ActionResult<{ paymentStatus: PaymentStatus }>> {
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

    if (booking.status !== BookingStatus.PAYMENT_PENDING || !booking.payment) {
      return {
        success: false,
        error: "This booking is not awaiting a payment confirmation.",
      };
    }

    // Bound to a local so the narrowing survives into the transaction closure below, where
    // TypeScript can no longer prove `booking.payment` is non-null.
    const payment = booking.payment;

    // Idempotent: already confirmed is the outcome the caller wanted, and re-confirming must not
    // move `confirmedAt` - it is the record of when the owner said the money arrived.
    if (payment.status === PaymentStatus.COMPLETED) {
      return {
        success: true,
        data: { paymentStatus: PaymentStatus.COMPLETED },
      };
    }

    if (payment.status !== PaymentStatus.AWAITING_CONFIRMATION) {
      return { success: false, error: "This payment cannot be confirmed." };
    }

    const applied = await prisma.$transaction(async (tx) => {
      /**
       * Guarded on the payment's current status, for the same reason the booking transitions are.
       * Two confirmations racing would otherwise both write, and the second would overwrite the
       * first's timestamp.
       */
      const updated = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: PaymentStatus.AWAITING_CONFIRMATION,
        },
        data: {
          status: PaymentStatus.COMPLETED,
          confirmedAt: new Date(),
          // Who vouched for the money arriving. The point of the column.
          confirmedById: owner.id,
        },
      });

      if (updated.count !== 1) {
        return false;
      }

      await emitBookingNotifications(tx, {
        event: "payment-confirmed",
        bookingId: booking.id,
        listingTitle: booking.listing.title,
        parties: { renterId: booking.renterId, ownerId: booking.ownerId },
        amount: payment.amount,
      });

      return true;
    });

    if (!applied) {
      return { success: false, error: CONCURRENT_CHANGE_ERROR };
    }

    revalidateBookingPaths(booking.listingId);

    return { success: true, data: { paymentStatus: PaymentStatus.COMPLETED } };
  } catch (error) {
    console.error("confirmPaymentReceived failed", error);

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

    const applied = await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, depositReturnedAt: null },
        data: { depositReturnedAt: returnedAt },
      });

      if (updated.count !== 1) {
        return false;
      }

      await emitBookingNotifications(tx, {
        event: "deposit-returned",
        bookingId: booking.id,
        listingTitle: booking.listing.title,
        parties: { renterId: booking.renterId, ownerId: booking.ownerId },
        amount: payment.securityDeposit,
      });

      return true;
    });

    if (!applied) {
      return { success: false, error: CONCURRENT_CHANGE_ERROR };
    }

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
