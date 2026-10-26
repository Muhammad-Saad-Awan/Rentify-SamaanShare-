import { PaymentProvider, PaymentStatus } from "@/generated/prisma/enums";

/**
 * Card payment through Stripe Checkout, as pure rules. TEST MODE ONLY.
 *
 * WHAT STRIPE DOES HERE, AND WHAT IT DOES NOT. Stripe replaces exactly one step of the custodial
 * flow: the administrator looking at a bank statement and agreeing the money arrived. A paid
 * Checkout Session is that agreement, made by the processor instead of a person. Everything after
 * it - the frozen commission rate, the handover gate, settlement, the deposit return, claims and
 * refunds - reads the same `Payment` row it always did and does not know which way the money came.
 * There is no Connect, no transfer and no payout: SamaanShare is the only Stripe account involved.
 *
 * WHY A PURE MODULE. The webhook is where money becomes a fact in this database, and the decision
 * it makes - complete, ignore, or refuse - depends only on the event and the row. Keeping that
 * decision free of Prisma and of the SDK means every branch can be asserted without a network, a
 * database or a signed payload. `actions/card-checkout.ts` and the route handler do the I/O.
 */

/** The currency every SamaanShare price is in, as Stripe spells it. */
export const STRIPE_CURRENCY = "pkr";

/**
 * Whole rupees to Stripe's minor unit.
 *
 * PKR IS A TWO-DECIMAL CURRENCY TO STRIPE, so ₨1,500 is sent as 150000. Every price here is a whole
 * number of rupees (D2), which is why this multiplies rather than rounds: a fractional input would
 * mean a price that should not exist, and it is refused rather than silently rounded into a charge
 * nobody agreed to.
 */
export function toStripeAmount(rupees: number): number {
  if (!Number.isSafeInteger(rupees) || rupees < 0) {
    throw new RangeError(
      `Expected a whole, non-negative rupee amount, got ${rupees}.`
    );
  }

  return rupees * 100;
}

/**
 * What a booking's payment charges, in Stripe's minor unit.
 *
 * THE ONLY AMOUNT A CHECKOUT SESSION IS EVER CREATED WITH, and it is computed from the `Payment`
 * row - which the `bookings` trigger guarantees matches the booking's terms - never from anything
 * the browser sent. The webhook re-derives it the same way to check the session it is told about.
 */
export function chargeTotal(payment: {
  amount: number;
  securityDeposit: number;
}): number {
  return toStripeAmount(payment.amount + payment.securityDeposit);
}

/**
 * The lines a renter sees on the Checkout page.
 *
 * RENT AND DEPOSIT STAY SEPARATE HERE TOO, as on every other payment screen. One is the owner's
 * income, the other is the renter's own money held until the item comes back, and a single
 * "Total" line would describe them as the same thing to the person paying both. A zero deposit is
 * omitted rather than shown as a ₨0 line - Stripe refuses zero-amount line items anyway.
 */
export function buildCheckoutLineItems({
  listingTitle,
  amount,
  securityDeposit,
}: {
  listingTitle: string;
  amount: number;
  securityDeposit: number;
}) {
  const line = (name: string, description: string, rupees: number) => ({
    quantity: 1,
    price_data: {
      currency: STRIPE_CURRENCY,
      unit_amount: toStripeAmount(rupees),
      product_data: { name, description },
    },
  });

  // Stripe caps a product name at 250 characters; a listing title is far shorter, but clip anyway
  // so a future longer title cannot turn into a refused session.
  const title = listingTitle.slice(0, 200);

  return [
    line(`Rent: ${title}`, "Rental for the agreed dates.", amount),
    ...(securityDeposit > 0
      ? [
          line(
            `Refundable deposit: ${title}`,
            "Held by SamaanShare and returned after the item is back, less any upheld damage claim.",
            securityDeposit
          ),
        ]
      : []),
  ];
}

// -------------------------------------------------------------------------------- metadata

/**
 * The identifiers carried on the Checkout Session and its PaymentIntent.
 *
 * Written by our server when the session is created, and returned to us inside an event whose
 * signature has been verified - so on the way back they are trustworthy. `paymentId` is how the
 * webhook finds the row; `bookingId` is cross-checked against it; `renterId` is for a person
 * reading the payment in the Stripe Dashboard.
 */
export interface CheckoutMetadata {
  bookingId: string;
  paymentId: string;
  renterId: string;
}

export function buildCheckoutMetadata(ids: CheckoutMetadata) {
  return {
    bookingId: ids.bookingId,
    paymentId: ids.paymentId,
    renterId: ids.renterId,
  };
}

/** Reads the identifiers back, or `null` when any is missing - a session we did not create. */
export function parseCheckoutMetadata(
  metadata: Record<string, string> | null | undefined
): CheckoutMetadata | null {
  const bookingId = metadata?.bookingId;
  const paymentId = metadata?.paymentId;
  const renterId = metadata?.renterId;

  if (!bookingId || !paymentId || !renterId) {
    return null;
  }

  return { bookingId, paymentId, renterId };
}

/**
 * What this integration keeps in `Payment.metadata`.
 *
 * `transactionRef` cannot hold the session id: it is the renter's own reference under the bank
 * flow, and unique per provider - so it is given the PaymentIntent id once Stripe has the money,
 * which is the identifier a refund in the Dashboard is made against. The session lives here.
 *
 * `unapplied` records a paid session the webhook could not apply: money Stripe took for a payment
 * that was already settled some other way, or had been withdrawn. Kept on the row an
 * administrator is already looking at, because it is a refund someone owes.
 */
export interface StripePaymentMetadata {
  checkoutSessionId?: string;
  paymentIntentId?: string;
  completedByEventId?: string;
  unapplied?: { checkoutSessionId: string; reason: string; at: string }[];
}

export function readStripeMetadata(value: unknown): StripePaymentMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const stripe = (value as { stripe?: unknown }).stripe;

  if (!stripe || typeof stripe !== "object" || Array.isArray(stripe)) {
    return {};
  }

  return stripe as StripePaymentMetadata;
}

/**
 * Merges this integration's fields into the row's metadata without dropping anyone else's.
 *
 * Returns a plain JSON object for Prisma to write.
 */
export function writeStripeMetadata(
  existing: unknown,
  patch: Partial<StripePaymentMetadata>
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};

  return {
    ...base,
    stripe: { ...readStripeMetadata(existing), ...patch },
  };
}

/**
 * A stable key per checkout attempt, so a double click cannot create two sessions.
 *
 * Keyed on the session it replaces: the first attempt is `initial`, and each later one names the
 * session that had expired. Two concurrent clicks therefore send the same key and Stripe returns
 * the same session to both - which requires the request body to be identical too, so nothing that
 * varies per request (a timestamp, a random suffix) may go into the create call.
 */
export function checkoutIdempotencyKey(
  paymentId: string,
  previousSessionId: string | undefined
): string {
  return `samaanshare:checkout:${paymentId}:${previousSessionId ?? "initial"}`;
}

/**
 * Tags every session from this flow in the Stripe Dashboard.
 *
 * Stripe asks for a label with a suffix of eight random letters. It is random once, here, rather
 * than per request: a per-request value would make two identical retries different requests and
 * break the idempotency key above.
 */
export const CHECKOUT_INTEGRATION_IDENTIFIER = "samaanshare-booking-qkvmtrzh";

// -------------------------------------------------------------------------------- statuses

/**
 * Payment statuses from which a renter may start (or restart) card checkout.
 *
 * `PENDING_VERIFICATION` IS ABSENT ON PURPOSE. The renter has told us they sent a bank transfer and
 * an administrator is checking it; offering a card now invites paying twice. `COMPLETED` and the
 * terminal statuses are absent because there is nothing left to pay.
 */
export const CARD_CHECKOUT_FROM: readonly PaymentStatus[] = [
  PaymentStatus.AWAITING_CONFIRMATION,
  PaymentStatus.REJECTED,
  PaymentStatus.PROCESSING,
  PaymentStatus.FAILED,
];

/**
 * Payment statuses a paid session may complete.
 *
 * The same list, for the same reason: a paid session against any of these is the payment arriving.
 * It includes `AWAITING_CONFIRMATION` and `REJECTED` because a renter may switch to bank transfer
 * after opening Checkout; if the old session is then paid, Stripe holds the money and the payment
 * is genuinely made. Anything else - already verified, under review, refunded, cancelled - is not
 * overwritten: see `unapplied`.
 */
export const STRIPE_COMPLETABLE_FROM = CARD_CHECKOUT_FROM;

export function canStartCardCheckout(status: PaymentStatus): boolean {
  return CARD_CHECKOUT_FROM.includes(status);
}

// -------------------------------------------------------------------------------- the decision

/** The parts of a Checkout Session the webhook decision reads. */
export interface CheckoutSessionFacts {
  id: string;
  paymentStatus: string;
  amountTotal: number | null;
  currency: string | null;
  metadata: Record<string, string> | null;
  paymentIntentId: string | null;
}

/** The parts of the `Payment` row it reads, with the booking it is attached to. */
export interface PaymentFacts {
  id: string;
  bookingId: string | null;
  status: PaymentStatus;
  provider: PaymentProvider;
  amount: number;
  securityDeposit: number;
  transactionRef: string | null;
}

export type CheckoutEventType =
  | "checkout.session.completed"
  | "checkout.session.async_payment_succeeded"
  | "checkout.session.async_payment_failed";

export type CheckoutOutcome =
  /** Mark the payment COMPLETED, recording this PaymentIntent. */
  | { kind: "complete"; paymentIntentId: string }
  /** Already applied - a redelivery. Acknowledge and change nothing. */
  | { kind: "duplicate" }
  /** An async method failed before paying. Mark FAILED so the renter can try again. */
  | { kind: "fail" }
  /** Paid, but the payment is no longer one this may complete. Record it for a refund. */
  | { kind: "unapplied"; reason: string }
  /** Nothing to do yet - e.g. a completed session still awaiting a delayed payment. */
  | { kind: "ignore"; reason: string }
  /** The event does not describe the payment it names. Change nothing, and say so loudly. */
  | { kind: "reject"; reason: string };

/**
 * What a Checkout event means for the payment it names.
 *
 * FULFILMENT IS GATED ON `payment_status`, NOT ON THE EVENT NAME. A session can complete while
 * still unpaid when the renter chose a delayed method; that arrives again later as
 * `async_payment_succeeded` or `_failed`. Completing on the first event alone would release the
 * handover for money that might never arrive.
 *
 * EVERY FIGURE IS RE-CHECKED AGAINST THE ROW. The metadata is ours and its signature is verified,
 * but the session's amount is checked anyway: it is the one number this whole flow exists to get
 * right, and a mismatch means something is wrong that a person must look at - never something to
 * complete and hope.
 */
export function decideCheckoutOutcome(
  eventType: CheckoutEventType,
  session: CheckoutSessionFacts,
  payment: PaymentFacts | null
): CheckoutOutcome {
  const ids = parseCheckoutMetadata(session.metadata);

  if (!ids) {
    return {
      kind: "reject",
      reason: `Session ${session.id} carries no SamaanShare identifiers.`,
    };
  }

  if (!payment || payment.id !== ids.paymentId) {
    return {
      kind: "reject",
      reason: `Session ${session.id} names payment ${ids.paymentId}, which does not exist.`,
    };
  }

  if (payment.bookingId !== ids.bookingId) {
    return {
      kind: "reject",
      reason: `Session ${session.id} names booking ${ids.bookingId}, but payment ${payment.id} belongs to ${payment.bookingId ?? "no booking"}.`,
    };
  }

  if (eventType === "checkout.session.async_payment_failed") {
    return payment.status === PaymentStatus.PROCESSING
      ? { kind: "fail" }
      : {
          kind: "ignore",
          reason: `Payment ${payment.id} is ${payment.status}, not waiting on this session.`,
        };
  }

  // `no_payment_required` cannot happen for a positive-total session, and is not money arriving.
  if (session.paymentStatus !== "paid") {
    return {
      kind: "ignore",
      reason: `Session ${session.id} is ${session.paymentStatus}; waiting for the payment to settle.`,
    };
  }

  if (
    session.currency?.toLowerCase() !== STRIPE_CURRENCY ||
    session.amountTotal !== chargeTotal(payment)
  ) {
    return {
      kind: "reject",
      reason: `Session ${session.id} charged ${session.amountTotal} ${session.currency}, but payment ${payment.id} is for ${chargeTotal(payment)} ${STRIPE_CURRENCY}.`,
    };
  }

  if (!session.paymentIntentId) {
    return {
      kind: "reject",
      reason: `Session ${session.id} is paid but has no PaymentIntent.`,
    };
  }

  if (payment.status === PaymentStatus.COMPLETED) {
    return payment.provider === PaymentProvider.STRIPE &&
      payment.transactionRef === session.paymentIntentId
      ? { kind: "duplicate" }
      : {
          kind: "unapplied",
          reason:
            "The payment was already verified by another route, so this card payment is a second collection and must be refunded.",
        };
  }

  if (!STRIPE_COMPLETABLE_FROM.includes(payment.status)) {
    return {
      kind: "unapplied",
      reason: `The payment is ${payment.status}, so this card payment was not applied and must be refunded.`,
    };
  }

  return { kind: "complete", paymentIntentId: session.paymentIntentId };
}

/** Narrows an event type to the three this integration acts on. */
export function isCheckoutPaymentEvent(
  type: string
): type is CheckoutEventType {
  return (
    type === "checkout.session.completed" ||
    type === "checkout.session.async_payment_succeeded" ||
    type === "checkout.session.async_payment_failed"
  );
}

/** Where Stripe sends the renter back to. `{CHECKOUT_SESSION_ID}` is filled in by Stripe. */
export function checkoutReturnUrls(appUrl: string, bookingId: string) {
  const base = `${appUrl}/dashboard/bookings`;
  const booking = encodeURIComponent(bookingId);

  return {
    success_url: `${base}?checkout=success&booking=${booking}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}?checkout=cancelled&booking=${booking}`,
  };
}
