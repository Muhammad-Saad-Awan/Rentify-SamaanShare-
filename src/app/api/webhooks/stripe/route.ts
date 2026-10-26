import { revalidatePath } from "next/cache";

import { env, isStripeEnabled } from "@/config/env";
import { isCheckoutPaymentEvent } from "@/lib/payments/stripe";
import { getStripe } from "@/lib/payments/stripe-client";
import { applyCheckoutEvent } from "@/lib/payments/stripe-webhook";

import type Stripe from "stripe";

/**
 * Stripe webhook endpoint. TEST MODE ONLY.
 *
 * THE ONLY PLACE A CARD PAYMENT BECOMES PAID. Not the success page, not the action that created the
 * session: a renter may pay and never return, and a success URL can be typed by hand.
 *
 * THE SIGNATURE IS CHECKED AGAINST THE RAW BODY, which is why this reads `request.text()` and never
 * `request.json()`. The signature covers the exact bytes Stripe sent; re-serialising parsed JSON
 * changes them and every event would fail verification. Nothing in the payload is read before the
 * check passes.
 *
 * STATUS CODES ARE INSTRUCTIONS TO STRIPE. 2xx means "do not send this again", so it is returned
 * for anything that will never succeed on retry - an event we ignore, or one we refuse on its
 * merits. 400 is a forged or mangled request. 500 is reserved for a failure that a retry could fix,
 * such as the database being briefly unreachable, so Stripe's backoff does the recovery for us.
 *
 * Excluded from the auth middleware's matcher: Stripe has no session, and a redirect to /login
 * would be a 3xx Stripe treats as failure.
 */
export async function POST(request: Request): Promise<Response> {
  // Not configured: refuse rather than accept, so a misconfigured deployment shows up as failing
  // deliveries in the Dashboard instead of silently swallowing them.
  if (!isStripeEnabled() || !env.STRIPE_WEBHOOK_SECRET) {
    return Response.json(
      { error: "Stripe is not configured." },
      { status: 503 }
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json(
      { error: "Missing Stripe-Signature header." },
      { status: 400 }
    );
  }

  const payload = await request.text();

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      payload,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    // No detail in the response: a prober learns nothing about why.
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  /**
   * Belt and braces for test mode. A live event cannot be signed with a test endpoint's secret, so
   * this should be unreachable - but if a live endpoint were ever pointed here, nothing it says is
   * acted on.
   */
  if (event.livemode) {
    console.error(
      `Stripe live-mode event ${event.id} ignored: test mode only.`
    );

    return Response.json({ received: true, ignored: "livemode" });
  }

  if (!isCheckoutPaymentEvent(event.type)) {
    // `checkout.session.expired` lands here too: nothing to do, the renter can start again.
    return Response.json({ received: true, ignored: event.type });
  }

  try {
    const outcome = await applyCheckoutEvent(
      { id: event.id, type: event.type },
      event.data.object as Stripe.Checkout.Session
    );

    if (outcome.kind === "complete" || outcome.kind === "fail") {
      for (const path of [
        "/dashboard/bookings",
        "/dashboard/requests",
        "/admin/payments",
        "/admin/bookings",
      ]) {
        revalidatePath(path, "page");
      }

      revalidatePath("/dashboard", "layout");
    }

    return Response.json({ received: true, outcome: outcome.kind });
  } catch (error) {
    console.error(`Stripe ${event.type} ${event.id} failed`, error);

    return Response.json({ error: "Processing failed." }, { status: 500 });
  }
}
