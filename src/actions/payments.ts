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
} from "@/lib/bookings/guard";
import { canTransition } from "@/lib/bookings/lifecycle";
import { attachPaymentToBooking } from "@/lib/payments/attach";
import { CARD_CHECKOUT_FROM } from "@/lib/payments/stripe";
import { expireOpenCheckout } from "@/lib/payments/stripe-client";
import { publishAfterCommit } from "@/lib/realtime/publish";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { selectPaymentMethodSchema } from "@/lib/validations/booking";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ActionResult } from "@/types";

/**
 * Choosing how to pay. What remains of a file that used to be the whole payment flow.
 *
 * BOTH OF THE OTHER TWO ACTIONS ARE GONE, and the file is kept for the one that survives the
 * change of model. `confirmPaymentReceived` went when the money started coming to SamaanShare -
 * an owner cannot vouch for a transfer they never see. `markDepositReturned` went once an
 * administrator could record the return instead, which is the honest order: the replacement
 * first, the deletion after, so there was never a moment with no path at all.
 *
 * `selectPaymentMethod` still creates the `Payment` row and moves the booking to
 * PAYMENT_PENDING. Only `BANK_TRANSFER` is offered - cash was a way to pay a person standing in
 * front of you, not a platform.
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

      /**
       * Back from card to bank transfer: the payment becomes an offline one again.
       *
       * Guarded on the statuses card checkout may be in, so a webhook that completes the payment at
       * the same moment wins rather than being overwritten. The open Checkout Session is closed
       * after the commit, best effort - if the renter still pays it, the webhook applies it anyway.
       */
      if (booking.payment.provider === PaymentProvider.STRIPE) {
        const switched = await prisma.payment.updateMany({
          where: {
            id: booking.payment.id,
            provider: PaymentProvider.STRIPE,
            status: { in: [...CARD_CHECKOUT_FROM] },
          },
          data: {
            provider: PaymentProvider.OFFLINE,
            method,
            status: PaymentStatus.AWAITING_CONFIRMATION,
            transactionRef: null,
          },
        });

        if (switched.count !== 1) {
          return { success: false, error: CONCURRENT_CHANGE_ERROR };
        }

        await expireOpenCheckout(booking.payment.id);
      } else {
        await prisma.payment.update({
          where: { id: booking.payment.id },
          data: { method },
        });
      }

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

    /**
     * The payment row and the status change are one transaction.
     *
     * Separately, a crash between them leaves either a PAYMENT_PENDING booking with no payment to
     * verify, or an orphaned payment row attached to nothing. Both would need manual repair. The
     * lock and terms check live in `attachPaymentToBooking`, shared with card checkout.
     */
    const created = await prisma.$transaction((tx) =>
      attachPaymentToBooking(
        tx,
        booking,
        {
          provider: PaymentProvider.OFFLINE,
          method,
          status: PaymentStatus.AWAITING_CONFIRMATION,
        },
        renter.id
      )
    );

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
