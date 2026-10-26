import { describe, expect, it } from "vitest";

import { PaymentProvider, PaymentStatus } from "@/generated/prisma/enums";
import {
  buildCheckoutLineItems,
  buildCheckoutMetadata,
  canStartCardCheckout,
  chargeTotal,
  checkoutIdempotencyKey,
  checkoutReturnUrls,
  decideCheckoutOutcome,
  isCheckoutPaymentEvent,
  parseCheckoutMetadata,
  readStripeMetadata,
  toStripeAmount,
  writeStripeMetadata,
} from "@/lib/payments/stripe";

import type { CheckoutSessionFacts, PaymentFacts } from "@/lib/payments/stripe";

/**
 * Stripe Checkout, the pure half.
 *
 * The webhook decision is where a card payment becomes a fact in this database, so most of what
 * follows is that function's branches: the one path that completes a payment, and every reason it
 * must not. The route handler only wires signature verification and a compare-and-swap around it.
 */

const PAYMENT: PaymentFacts = {
  id: "pay_1",
  bookingId: "book_1",
  status: PaymentStatus.PROCESSING,
  provider: PaymentProvider.STRIPE,
  amount: 4_999,
  securityDeposit: 25_000,
  transactionRef: null,
};

const PAID: CheckoutSessionFacts = {
  id: "cs_test_1",
  paymentStatus: "paid",
  // (4,999 + 25,000) rupees in paisa.
  amountTotal: 2_999_900,
  currency: "pkr",
  metadata: { bookingId: "book_1", paymentId: "pay_1", renterId: "user_r" },
  paymentIntentId: "pi_1",
};

describe("toStripeAmount", () => {
  it("converts whole rupees to paisa", () => {
    expect(toStripeAmount(1_500)).toBe(150_000);
    expect(toStripeAmount(0)).toBe(0);
  });

  it("refuses amounts that are not whole, non-negative rupees", () => {
    expect(() => toStripeAmount(10.5)).toThrow(RangeError);
    expect(() => toStripeAmount(-1)).toThrow(RangeError);
    expect(() => toStripeAmount(Number.NaN)).toThrow(RangeError);
  });
});

describe("chargeTotal", () => {
  /** Rent and deposit are both collected - the deposit is held, not skipped. */
  it("charges the rental plus the deposit", () => {
    expect(chargeTotal({ amount: 4_999, securityDeposit: 25_000 })).toBe(
      2_999_900
    );
  });
});

describe("buildCheckoutLineItems", () => {
  it("shows rent and deposit as separate lines that sum to the charge", () => {
    const items = buildCheckoutLineItems({
      listingTitle: "Canon EOS R6",
      amount: 4_999,
      securityDeposit: 25_000,
    });

    expect(items).toHaveLength(2);
    expect(items[0]?.price_data.product_data.name).toBe("Rent: Canon EOS R6");
    expect(items[1]?.price_data.product_data.name).toBe(
      "Refundable deposit: Canon EOS R6"
    );
    expect(items.every((item) => item.price_data.currency === "pkr")).toBe(
      true
    );

    const sum = items.reduce(
      (total, item) => total + item.price_data.unit_amount * item.quantity,
      0
    );

    expect(sum).toBe(chargeTotal({ amount: 4_999, securityDeposit: 25_000 }));
  });

  /** Stripe refuses zero-amount lines, and a ₨0 deposit line would only confuse. */
  it("omits a zero deposit", () => {
    const items = buildCheckoutLineItems({
      listingTitle: "Drill",
      amount: 800,
      securityDeposit: 0,
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.price_data.unit_amount).toBe(80_000);
  });
});

describe("checkout metadata", () => {
  it("round-trips the identifiers", () => {
    const ids = { bookingId: "b", paymentId: "p", renterId: "r" };

    expect(parseCheckoutMetadata(buildCheckoutMetadata(ids))).toEqual(ids);
  });

  it("treats a session missing any identifier as not ours", () => {
    expect(parseCheckoutMetadata(null)).toBeNull();
    expect(
      parseCheckoutMetadata({ bookingId: "b", paymentId: "p" })
    ).toBeNull();
    expect(
      parseCheckoutMetadata({ bookingId: "", paymentId: "p", renterId: "r" })
    ).toBeNull();
  });
});

describe("Payment.metadata helpers", () => {
  it("reads nothing from rows that have no Stripe data", () => {
    expect(readStripeMetadata(null)).toEqual({});
    expect(readStripeMetadata([1, 2])).toEqual({});
    expect(readStripeMetadata({ other: true })).toEqual({});
  });

  it("merges without dropping other providers' fields or earlier Stripe fields", () => {
    const first = writeStripeMetadata(
      { other: "kept" },
      { checkoutSessionId: "cs_1" }
    );
    const second = writeStripeMetadata(first, { paymentIntentId: "pi_1" });

    expect(second).toEqual({
      other: "kept",
      stripe: { checkoutSessionId: "cs_1", paymentIntentId: "pi_1" },
    });
  });
});

describe("checkoutIdempotencyKey", () => {
  /** Two clicks on the same attempt must collapse into one session. */
  it("is stable for the same attempt and changes when a session is replaced", () => {
    expect(checkoutIdempotencyKey("pay_1", undefined)).toBe(
      checkoutIdempotencyKey("pay_1", undefined)
    );
    expect(checkoutIdempotencyKey("pay_1", "cs_old")).not.toBe(
      checkoutIdempotencyKey("pay_1", undefined)
    );
  });
});

describe("canStartCardCheckout", () => {
  it("allows a payment nobody has confirmed or claimed", () => {
    for (const status of [
      PaymentStatus.AWAITING_CONFIRMATION,
      PaymentStatus.REJECTED,
      PaymentStatus.PROCESSING,
      PaymentStatus.FAILED,
    ]) {
      expect(canStartCardCheckout(status)).toBe(true);
    }
  });

  /** A declared bank transfer under review: a card now invites paying twice. */
  it("refuses while a bank transfer is being checked, and once paid", () => {
    for (const status of [
      PaymentStatus.PENDING_VERIFICATION,
      PaymentStatus.COMPLETED,
      PaymentStatus.REFUNDED,
      PaymentStatus.CANCELLED,
    ]) {
      expect(canStartCardCheckout(status)).toBe(false);
    }
  });
});

describe("decideCheckoutOutcome", () => {
  it("completes a paid session that matches its payment", () => {
    expect(
      decideCheckoutOutcome("checkout.session.completed", PAID, PAYMENT)
    ).toEqual({ kind: "complete", paymentIntentId: "pi_1" });
  });

  it("completes on async_payment_succeeded the same way", () => {
    expect(
      decideCheckoutOutcome(
        "checkout.session.async_payment_succeeded",
        PAID,
        PAYMENT
      )
    ).toEqual({ kind: "complete", paymentIntentId: "pi_1" });
  });

  /** A delayed method completes the session before the money exists. */
  it("does not fulfil a completed session that is still unpaid", () => {
    expect(
      decideCheckoutOutcome(
        "checkout.session.completed",
        { ...PAID, paymentStatus: "unpaid", paymentIntentId: null },
        PAYMENT
      ).kind
    ).toBe("ignore");
  });

  /** Redelivery is normal: Stripe retries until it sees a 2xx. */
  it("treats a redelivered event as a no-op", () => {
    expect(
      decideCheckoutOutcome("checkout.session.completed", PAID, {
        ...PAYMENT,
        status: PaymentStatus.COMPLETED,
        transactionRef: "pi_1",
      })
    ).toEqual({ kind: "duplicate" });
  });

  it("rejects a session whose amount differs from the payment", () => {
    const outcome = decideCheckoutOutcome(
      "checkout.session.completed",
      { ...PAID, amountTotal: 100 },
      PAYMENT
    );

    expect(outcome.kind).toBe("reject");
  });

  it("rejects a session in another currency", () => {
    expect(
      decideCheckoutOutcome(
        "checkout.session.completed",
        { ...PAID, currency: "usd" },
        PAYMENT
      ).kind
    ).toBe("reject");
  });

  it("rejects a session without our identifiers", () => {
    expect(
      decideCheckoutOutcome(
        "checkout.session.completed",
        { ...PAID, metadata: {} },
        PAYMENT
      ).kind
    ).toBe("reject");
  });

  it("rejects a session naming a payment that does not exist", () => {
    expect(
      decideCheckoutOutcome("checkout.session.completed", PAID, null).kind
    ).toBe("reject");
  });

  it("rejects a session whose booking is not the payment's booking", () => {
    expect(
      decideCheckoutOutcome("checkout.session.completed", PAID, {
        ...PAYMENT,
        bookingId: "book_other",
      }).kind
    ).toBe("reject");
  });

  /** The renter may have switched to bank transfer, then paid the old session anyway. */
  it("completes a payment the renter had switched back to bank transfer", () => {
    expect(
      decideCheckoutOutcome("checkout.session.completed", PAID, {
        ...PAYMENT,
        status: PaymentStatus.AWAITING_CONFIRMATION,
        provider: PaymentProvider.OFFLINE,
      }).kind
    ).toBe("complete");
  });

  /** Money taken twice is a refund someone owes, not a row to overwrite. */
  it("does not overwrite a payment verified another way", () => {
    expect(
      decideCheckoutOutcome("checkout.session.completed", PAID, {
        ...PAYMENT,
        status: PaymentStatus.COMPLETED,
        provider: PaymentProvider.OFFLINE,
        transactionRef: "BANK-REF-123",
      }).kind
    ).toBe("unapplied");
  });

  it("does not apply a card payment to a bank transfer under review", () => {
    expect(
      decideCheckoutOutcome("checkout.session.completed", PAID, {
        ...PAYMENT,
        status: PaymentStatus.PENDING_VERIFICATION,
      }).kind
    ).toBe("unapplied");
  });

  it("does not apply a card payment to a refunded payment", () => {
    expect(
      decideCheckoutOutcome("checkout.session.completed", PAID, {
        ...PAYMENT,
        status: PaymentStatus.REFUNDED,
      }).kind
    ).toBe("unapplied");
  });

  it("marks a processing payment failed when the async method fails", () => {
    expect(
      decideCheckoutOutcome(
        "checkout.session.async_payment_failed",
        { ...PAID, paymentStatus: "unpaid" },
        PAYMENT
      )
    ).toEqual({ kind: "fail" });
  });

  it("ignores an async failure for a payment no longer waiting on it", () => {
    expect(
      decideCheckoutOutcome(
        "checkout.session.async_payment_failed",
        { ...PAID, paymentStatus: "unpaid" },
        { ...PAYMENT, status: PaymentStatus.COMPLETED, transactionRef: "pi_9" }
      ).kind
    ).toBe("ignore");
  });
});

describe("isCheckoutPaymentEvent", () => {
  it("accepts only the three events that move money state", () => {
    expect(isCheckoutPaymentEvent("checkout.session.completed")).toBe(true);
    expect(
      isCheckoutPaymentEvent("checkout.session.async_payment_succeeded")
    ).toBe(true);
    expect(
      isCheckoutPaymentEvent("checkout.session.async_payment_failed")
    ).toBe(true);
    expect(isCheckoutPaymentEvent("checkout.session.expired")).toBe(false);
    expect(isCheckoutPaymentEvent("payment_intent.succeeded")).toBe(false);
  });
});

describe("checkoutReturnUrls", () => {
  it("returns to the renter's bookings with the outcome and Stripe's placeholder", () => {
    const urls = checkoutReturnUrls("https://samaanshare.me", "book 1");

    expect(urls.success_url).toBe(
      "https://samaanshare.me/dashboard/bookings?checkout=success&booking=book%201&session_id={CHECKOUT_SESSION_ID}"
    );
    expect(urls.cancel_url).toBe(
      "https://samaanshare.me/dashboard/bookings?checkout=cancelled&booking=book%201"
    );
  });
});
