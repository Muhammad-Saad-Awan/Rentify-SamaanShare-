import Stripe from "stripe";

import { env, isStripeEnabled } from "@/config/env";
import { readStripeMetadata } from "@/lib/payments/stripe";
import { prisma } from "@/lib/prisma";

/**
 * The Stripe client, server-only. TEST MODE ONLY - `env.schema.ts` refuses a live key at boot.
 *
 * ONE INSTANCE, CREATED LAZILY. Lazily because most requests never touch Stripe and an unconfigured
 * deployment must not fail on import; one instance because the SDK keeps an HTTP agent worth
 * reusing. Instantiated as a client rather than through the deprecated module-level key.
 *
 * The API version is pinned to the one this SDK was built against, so an account-level version
 * change in the Dashboard cannot alter the shape of what the webhook receives.
 */

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!isStripeEnabled() || !env.STRIPE_SECRET_KEY) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (test mode) - see .env.example."
    );
  }

  client ??= new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-09-30.endive",
    appInfo: { name: "SamaanShare", url: "https://samaanshare.me" },
    maxNetworkRetries: 2,
  });

  return client;
}

/**
 * Closes the open Checkout Session of a payment, if it has one.
 *
 * Called when the renter switches to bank transfer and when a booking is cancelled, so a Checkout
 * tab left open cannot take money for a payment that is no longer being made by card. BEST
 * EFFORT, deliberately: the caller's own change has already committed and must not be undone by
 * a Stripe outage. If this fails and the old session is paid anyway, the webhook records it as
 * `unapplied` - money owed back - rather than losing it.
 */
export async function expireOpenCheckout(paymentId: string): Promise<void> {
  if (!isStripeEnabled()) {
    return;
  }

  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { metadata: true },
    });

    const sessionId = readStripeMetadata(payment?.metadata).checkoutSessionId;

    if (!sessionId) {
      return;
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.status === "open") {
      await stripe.checkout.sessions.expire(sessionId);
    }
  } catch (error) {
    console.error("expireOpenCheckout failed", paymentId, error);
  }
}
