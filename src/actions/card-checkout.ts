"use server";

import { revalidatePath } from "next/cache";
import Stripe from "stripe";

import { isStripeEnabled } from "@/config/env";
import { publicEnv } from "@/config/env.public";
import {
  BookingStatus,
  PaymentMethod,
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
import {
  buildCheckoutLineItems,
  buildCheckoutMetadata,
  CARD_CHECKOUT_FROM,
  canStartCardCheckout,
  chargeTotal,
  CHECKOUT_INTEGRATION_IDENTIFIER,
  checkoutIdempotencyKey,
  checkoutReturnUrls,
  readStripeMetadata,
  writeStripeMetadata,
} from "@/lib/payments/stripe";
import { getStripe } from "@/lib/payments/stripe-client";
import { prisma } from "@/lib/prisma";
import { publishAfterCommit } from "@/lib/realtime/publish";
import { checkRateLimit } from "@/lib/rate-limit";
import { startCardCheckoutSchema } from "@/lib/validations/payment";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { Prisma } from "@/generated/prisma/client";
import type { ActionResult } from "@/types";

/**
 * Card payment through Stripe Checkout. TEST MODE ONLY.
 *
 * The renter is sent to a Stripe-hosted page and comes back to their bookings. NOTHING HERE MARKS
 * ANYTHING PAID. This action creates the payment and the session; the money becomes a fact only
 * when the signed webhook says so (`app/api/webhooks/stripe/route.ts`). A renter can close the tab
 * after paying and never see the success page, and a success URL can be typed by hand - so neither
 * is evidence of anything.
 *
 * RETURNS THE URL RATHER THAN REDIRECTING, per the house rule: actions invoked from a button return
 * an `ActionResult`, so a refusal arrives as a message the button can show.
 */

const NOT_FOUND_ERROR = "That booking was not found.";

const UNAVAILABLE_ERROR =
  "Card payment is not available right now. You can pay by bank transfer instead.";

const CONCURRENT_CHANGE_ERROR =
  "This booking was just updated somewhere else. Please refresh and try again.";

export async function startCardCheckout(
  input: unknown
): Promise<ActionResult<{ url: string }>> {
  const parsed = startCardCheckoutSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  // Not offered without both keys - see `isStripeEnabled`. Re-checked here because the button is
  // an affordance and this is the rule.
  if (!isStripeEnabled()) {
    return { success: false, error: UNAVAILABLE_ERROR };
  }

  const renter = await getActiveUser();

  if (!renter) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(
    `card-checkout:${renter.id}`,
    LIFECYCLE_RATE_LIMIT
  );

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many attempts. Please wait a moment and try again.",
    };
  }

  const { bookingId } = parsed.data;

  try {
    // A request that expired while the renter had the page open must not be payable.
    await expireStalePendingBookings();

    /**
     * Loaded as the RENTER: somebody else's booking is indistinguishable from a missing one, and
     * the authorisation is the query predicate rather than a comparison afterwards.
     */
    const booking = await loadBookingForParty({
      bookingId,
      userId: renter.id,
      side: "renter",
    });

    if (!booking) {
      return { success: false, error: NOT_FOUND_ERROR };
    }

    let paymentId: string;

    if (booking.status === BookingStatus.APPROVED) {
      if (!canTransition(booking.status, BookingStatus.PAYMENT_PENDING)) {
        return {
          success: false,
          error: "This booking is not awaiting payment.",
        };
      }

      // The same transaction, lock and terms check as choosing bank transfer.
      const created = await prisma.$transaction((tx) =>
        attachPaymentToBooking(
          tx,
          booking,
          {
            provider: PaymentProvider.STRIPE,
            method: PaymentMethod.CREDIT_CARD,
            status: PaymentStatus.PROCESSING,
          },
          renter.id
        )
      );

      if (!created) {
        return { success: false, error: CONCURRENT_CHANGE_ERROR };
      }

      publishAfterCommit(created);

      const attached = await prisma.booking.findUnique({
        where: { id: booking.id },
        select: { paymentId: true },
      });

      if (!attached?.paymentId) {
        return { success: false, error: CONCURRENT_CHANGE_ERROR };
      }

      paymentId = attached.paymentId;
    } else if (booking.status === BookingStatus.PAYMENT_PENDING) {
      if (!booking.payment) {
        console.error("PAYMENT_PENDING booking has no payment row", booking.id);

        return { success: false, error: UNAVAILABLE_ERROR };
      }

      if (!canStartCardCheckout(booking.payment.status)) {
        return {
          success: false,
          error:
            booking.payment.status === PaymentStatus.PENDING_VERIFICATION
              ? "You have recorded a bank transfer and we are checking it. Wait for our answer before paying another way."
              : "This booking has already been paid.",
        };
      }

      /**
       * Switch the existing payment to card, or reopen a failed card attempt.
       *
       * Compare-and-swap on the statuses card checkout may start from, so an administrator
       * verifying a bank transfer at this moment wins. A rejected bank reference is cleared with the
       * refusal: it describes a transfer that is no longer how this is being paid.
       */
      const switched = await prisma.payment.updateMany({
        where: {
          id: booking.payment.id,
          status: { in: [...CARD_CHECKOUT_FROM] },
        },
        data: {
          provider: PaymentProvider.STRIPE,
          method: PaymentMethod.CREDIT_CARD,
          status: PaymentStatus.PROCESSING,
          ...(booking.payment.provider === PaymentProvider.STRIPE
            ? {}
            : { transactionRef: null }),
          rejectedAt: null,
          rejectionReason: null,
        },
      });

      if (switched.count !== 1) {
        return { success: false, error: CONCURRENT_CHANGE_ERROR };
      }

      paymentId = booking.payment.id;
    } else {
      return {
        success: false,
        error:
          booking.status === BookingStatus.PENDING
            ? "The owner has not approved this request yet."
            : "This booking is no longer awaiting payment.",
      };
    }

    const url = await checkoutUrlFor({
      paymentId,
      bookingId: booking.id,
      renterId: renter.id,
      listingTitle: booking.listing.title,
    });

    // The owner's requests page too: starting checkout moves the booking to PAYMENT_PENDING, and
    // the bank-transfer path already refreshes it - see `revalidateBookingPaths` in `payments.ts`.
    revalidatePath("/dashboard/bookings", "page");
    revalidatePath("/dashboard/requests", "page");
    revalidatePath("/admin/payments", "page");
    revalidatePath("/dashboard", "layout");

    return url;
  } catch (error) {
    console.error("startCardCheckout failed", error);

    return { success: false, error: UNAVAILABLE_ERROR };
  }
}

/**
 * The URL of a payable Checkout Session for this payment - reused while one is open, created
 * otherwise.
 *
 * THE AMOUNT IS READ FROM THE ROW HERE, after every status change above has committed, and never
 * from the request. The row's figures are held to the booking's terms by the `bookings` trigger.
 *
 * AT MOST ONE OPEN SESSION PER PAYMENT. An open one is returned as it is; a stale one is expired
 * before a replacement is made. Two payable sessions would let a renter pay twice in two tabs.
 */
async function checkoutUrlFor({
  paymentId,
  bookingId,
  renterId,
  listingTitle,
}: {
  paymentId: string;
  bookingId: string;
  renterId: string;
  listingTitle: string;
}): Promise<ActionResult<{ url: string }>> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      status: true,
      amount: true,
      securityDeposit: true,
      metadata: true,
    },
  });

  if (!payment || payment.status !== PaymentStatus.PROCESSING) {
    return { success: false, error: CONCURRENT_CHANGE_ERROR };
  }

  const stripe = getStripe();
  const total = chargeTotal(payment);
  const previousSessionId = readStripeMetadata(
    payment.metadata
  ).checkoutSessionId;

  if (previousSessionId) {
    const previous = await stripe.checkout.sessions.retrieve(previousSessionId);

    if (previous.status === "open" && previous.amount_total === total) {
      if (previous.url) {
        return { success: true, data: { url: previous.url } };
      }
    }

    // Paid, and the webhook has not landed yet. Sending the renter back to pay would charge twice.
    if (previous.status === "complete") {
      return {
        success: false,
        error:
          "Your card payment has gone through and we are confirming it. This booking updates within a minute.",
      };
    }

    if (previous.status === "open") {
      await stripe.checkout.sessions.expire(previousSessionId);
    }
  }

  const metadata = buildCheckoutMetadata({ bookingId, paymentId, renterId });

  let session: Stripe.Checkout.Session;

  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: buildCheckoutLineItems({
          listingTitle,
          amount: payment.amount,
          securityDeposit: payment.securityDeposit,
        }),
        // No `payment_method_types`: Stripe offers the methods enabled in the Dashboard.
        //
        // Adaptive pricing off: the renter is charged in rupees, the currency the owner was
        // promised and the commission is computed in. A converted presentment amount would make
        // the figure on the renter's statement differ from every figure in this database.
        adaptive_pricing: { enabled: false },
        client_reference_id: paymentId,
        metadata,
        // On the PaymentIntent as well, so a refund made in the Dashboard - which starts from the
        // PaymentIntent, not the session - still says which booking it belongs to.
        payment_intent_data: {
          metadata,
          description: `SamaanShare booking ${bookingId}`,
        },
        integration_identifier: CHECKOUT_INTEGRATION_IDENTIFIER,
        ...checkoutReturnUrls(publicEnv.NEXT_PUBLIC_APP_URL, bookingId),
      },
      { idempotencyKey: checkoutIdempotencyKey(paymentId, previousSessionId) }
    );
  } catch (error) {
    if (
      error instanceof Stripe.errors.StripeError &&
      error.code === "amount_too_small"
    ) {
      return {
        success: false,
        error:
          "This booking is below the smallest amount Stripe can charge by card. Please pay by bank transfer.",
      };
    }

    throw error;
  }

  if (!session.url) {
    throw new Error(`Checkout Session ${session.id} has no URL.`);
  }

  /**
   * Remember the session, guarded on PROCESSING so a payment the webhook has already completed - or
   * the renter has switched to bank transfer - is not handed a session id it no longer belongs to.
   */
  const recorded = await prisma.payment.updateMany({
    where: { id: paymentId, status: PaymentStatus.PROCESSING },
    data: {
      metadata: writeStripeMetadata(payment.metadata, {
        checkoutSessionId: session.id,
      }) as Prisma.InputJsonValue,
    },
  });

  if (recorded.count !== 1) {
    await stripe.checkout.sessions.expire(session.id).catch(() => undefined);

    return { success: false, error: CONCURRENT_CHANGE_ERROR };
  }

  return { success: true, data: { url: session.url } };
}
