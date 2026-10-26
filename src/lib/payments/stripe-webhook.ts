import { COMMISSION_RATE_BPS } from "@/config/commission";
import {
  BookingStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
} from "@/generated/prisma/enums";
import { postBookingThreadLine } from "@/lib/chat/booking-events";
import { createNotifications } from "@/lib/notifications/create";
import { buildPaymentNotifications } from "@/lib/notifications/payment-messages";
import {
  decideCheckoutOutcome,
  parseCheckoutMetadata,
  readStripeMetadata,
  STRIPE_COMPLETABLE_FROM,
  writeStripeMetadata,
} from "@/lib/payments/stripe";
import { prisma } from "@/lib/prisma";
import { publishAfterCommit } from "@/lib/realtime/publish";

import type { Prisma } from "@/generated/prisma/client";
import type { CheckoutEventType, CheckoutOutcome } from "@/lib/payments/stripe";
import type Stripe from "stripe";

/**
 * Applies a verified Checkout event to the database.
 *
 * Called only after the route handler has checked the signature. The decision is made by the pure
 * `decideCheckoutOutcome`; this file is the I/O around it.
 *
 * IDEMPOTENT BY CONSTRUCTION, because Stripe delivers at least once and may deliver concurrently.
 * The completing write is a compare-and-swap on the statuses a payment may be completed from, so a
 * second delivery matches zero rows and changes nothing - and a redelivery after the first commit is
 * recognised as `duplicate` before any write is attempted.
 *
 * WHAT COMPLETION MEANS IS EXACTLY WHAT `verifyPayment` MEANS. The same status, the same frozen
 * commission rate, the same thread line and the same two notifications - so `canStartBooking()`,
 * settlement and refunds cannot tell a card payment from a verified transfer, and do not need to.
 * The difference is recorded where it is true: `confirmedById` stays null (no administrator decided
 * this; Stripe did), `provider` is `STRIPE`, and `transactionRef` is the PaymentIntent a refund in
 * the Dashboard is made against.
 */
export async function applyCheckoutEvent(
  event: { id: string; type: CheckoutEventType },
  session: Stripe.Checkout.Session
): Promise<CheckoutOutcome> {
  const ids = parseCheckoutMetadata(session.metadata);

  const payment = ids
    ? await prisma.payment.findUnique({
        where: { id: ids.paymentId },
        select: {
          id: true,
          status: true,
          provider: true,
          amount: true,
          securityDeposit: true,
          transactionRef: true,
          metadata: true,
          booking: {
            select: {
              id: true,
              status: true,
              renterId: true,
              ownerId: true,
              listing: { select: { title: true } },
            },
          },
        },
      })
    : null;

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  const outcome = decideCheckoutOutcome(
    event.type,
    {
      id: session.id,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
      metadata: session.metadata,
      paymentIntentId,
    },
    payment
      ? {
          id: payment.id,
          bookingId: payment.booking?.id ?? null,
          status: payment.status,
          provider: payment.provider,
          amount: payment.amount,
          securityDeposit: payment.securityDeposit,
          transactionRef: payment.transactionRef,
        }
      : null
  );

  switch (outcome.kind) {
    case "duplicate":
    case "ignore":
      return outcome;

    /**
     * Logged, not thrown. A 500 would make Stripe retry an event that will never become valid; the
     * session is in the Dashboard and the log says why it was refused.
     */
    case "reject":
      console.error(
        `Stripe ${event.type} ${event.id} refused:`,
        outcome.reason
      );

      return outcome;

    // The renter can start again; the booking still waits on its own expiry schedule.
    case "fail":
      if (payment) {
        await prisma.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PROCESSING },
          data: { status: PaymentStatus.FAILED },
        });
      }

      return outcome;

    /**
     * Money Stripe took that this payment can no longer accept. Kept on the row - once per session -
     * so the administrator looking at this booking sees a refund is owed.
     */
    case "unapplied": {
      console.error(
        `Stripe ${event.type} ${event.id} not applied to payment ${payment?.id}:`,
        outcome.reason
      );

      if (payment) {
        const existing = readStripeMetadata(payment.metadata).unapplied ?? [];

        if (!existing.some((entry) => entry.checkoutSessionId === session.id)) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              metadata: writeStripeMetadata(payment.metadata, {
                unapplied: [
                  ...existing,
                  {
                    checkoutSessionId: session.id,
                    reason: outcome.reason,
                    at: new Date().toISOString(),
                  },
                ],
              }) as Prisma.InputJsonValue,
            },
          });
        }
      }

      return outcome;
    }

    case "complete":
      if (!payment?.booking) {
        // Unreachable: the decision rejects a payment without a matching booking.
        return outcome;
      }

      await completePayment({
        payment,
        booking: payment.booking,
        sessionId: session.id,
        paymentIntentId: outcome.paymentIntentId,
        eventId: event.id,
      });

      return outcome;
  }
}

async function completePayment({
  payment,
  booking,
  sessionId,
  paymentIntentId,
  eventId,
}: {
  payment: {
    id: string;
    amount: number;
    securityDeposit: number;
    metadata: unknown;
  };
  booking: {
    id: string;
    status: BookingStatus;
    renterId: string;
    ownerId: string;
    listing: { title: string };
  };
  sessionId: string;
  paymentIntentId: string;
  eventId: string;
}): Promise<void> {
  const completedAt = new Date();

  const created = await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({
      where: { id: payment.id, status: { in: [...STRIPE_COMPLETABLE_FROM] } },
      data: {
        status: PaymentStatus.COMPLETED,
        provider: PaymentProvider.STRIPE,
        method: PaymentMethod.CREDIT_CARD,
        transactionRef: paymentIntentId,
        submittedAt: completedAt,
        confirmedAt: completedAt,
        // No administrator decided this - Stripe did. See the note at the top of this file.
        confirmedById: null,
        // FROZEN HERE, as `verifyPayment` freezes it. Settlement reads this, never the config.
        commissionRateBps: COMMISSION_RATE_BPS,
        rejectedAt: null,
        rejectionReason: null,
        metadata: writeStripeMetadata(payment.metadata, {
          checkoutSessionId: sessionId,
          paymentIntentId,
          completedByEventId: eventId,
        }) as Prisma.InputJsonValue,
      },
    });

    // A concurrent delivery got there first. Its transaction did everything below.
    if (updated.count !== 1) {
      return null;
    }

    /**
     * The handover message is only true while the booking is waiting on payment.
     *
     * A booking cancelled while its Checkout tab was open can still be paid; the money is real and
     * is recorded, so the refund flow - which requires a COMPLETED payment and deliberately ignores
     * booking status - can return it. Telling the owner to hand over an item for a cancelled
     * booking would not be.
     */
    if (booking.status !== BookingStatus.PAYMENT_PENDING) {
      console.error(
        `Card payment ${payment.id} completed for booking ${booking.id}, which is ${booking.status}. It needs a refund.`
      );

      return [];
    }

    await postBookingThreadLine(tx, {
      bookingId: booking.id,
      event: { event: "payment-verified" },
      actorId: null,
    });

    return createNotifications(
      tx,
      buildPaymentNotifications({
        bookingId: booking.id,
        listingTitle: booking.listing.title,
        parties: { renterId: booking.renterId, ownerId: booking.ownerId },
        event: {
          event: "verified",
          amount: payment.amount,
          securityDeposit: payment.securityDeposit,
        },
      })
    );
  });

  if (created) {
    publishAfterCommit(created);
  }
}
