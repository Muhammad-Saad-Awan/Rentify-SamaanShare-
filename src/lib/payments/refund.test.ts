import { describe, expect, it } from "vitest";

import { PaymentStatus } from "@/generated/prisma/enums";
import { computeRefund, refundReadiness } from "@/lib/payments/refund";

import type { RefundSubject } from "@/lib/payments/refund";

/**
 * Refunds.
 *
 * The assertion that matters most is the one about settlement: a booking must reach exactly one
 * terminal money outcome, and the two halves of that rule live in different files. Settlement's
 * half is tested in `settlement.test.ts`; this is the other, and if either goes the invariant
 * goes silently.
 */

const REFUNDABLE: RefundSubject = {
  paymentStatus: PaymentStatus.COMPLETED,
  amount: 4_999,
  securityDeposit: 25_000,
  refunded: false,
  settled: false,
};

describe("computeRefund", () => {
  /** Rental AND deposit: if the rental is not happening, neither is anybody's to keep. */
  it("returns everything the platform is holding", () => {
    expect(computeRefund({ amount: 4_999, securityDeposit: 25_000 })).toBe(
      29_999
    );
  });

  it("handles a booking with no deposit", () => {
    expect(computeRefund({ amount: 1_000, securityDeposit: 0 })).toBe(1_000);
  });

  it("refuses fractional and negative components", () => {
    expect(() => computeRefund({ amount: 100.5, securityDeposit: 0 })).toThrow(
      TypeError
    );

    expect(() => computeRefund({ amount: -1, securityDeposit: 0 })).toThrow(
      RangeError
    );
  });
});

describe("refundReadiness", () => {
  it("clears a verified, unsettled payment for the full amount", () => {
    expect(refundReadiness(REFUNDABLE)).toEqual({
      ready: true,
      refundAmount: 29_999,
    });
  });

  it("refuses a payment already refunded", () => {
    const result = refundReadiness({ ...REFUNDABLE, refunded: true });

    expect(result.ready).toBe(false);
    expect(!result.ready && result.reason).toMatch(/already been refunded/i);
  });

  /**
   * THE INVARIANT, from this side. Settlement refuses a refunded payment; this refuses a settled
   * booking. Remove either and a booking can pay the owner and the renter for the same money.
   */
  it("refuses a booking that has already been settled", () => {
    const result = refundReadiness({ ...REFUNDABLE, settled: true });

    expect(result.ready).toBe(false);
    expect(!result.ready && result.reason).toMatch(/settled/i);
  });

  /**
   * Unverified money is held by nobody. A renter whose evidence was rejected is owed another
   * attempt, not a refund of something that never arrived.
   */
  it("refuses anything that was never verified", () => {
    for (const paymentStatus of [
      PaymentStatus.PENDING,
      PaymentStatus.AWAITING_CONFIRMATION,
      PaymentStatus.PENDING_VERIFICATION,
      PaymentStatus.REJECTED,
      PaymentStatus.FAILED,
    ]) {
      const result = refundReadiness({ ...REFUNDABLE, paymentStatus });

      expect(result.ready).toBe(false);
      expect(!result.ready && result.reason).toMatch(/not verified/i);
    }
  });

  it("refuses when there is nothing to give back", () => {
    const result = refundReadiness({
      ...REFUNDABLE,
      amount: 0,
      securityDeposit: 0,
    });

    expect(!result.ready && result.reason).toMatch(/nothing to refund/i);
  });

  /**
   * Booking status is deliberately absent from the subject entirely - see the note on the
   * function. This asserts the shape rather than a behaviour, which is the point: there is no
   * status field to gate on, so no future edit can quietly start gating on one without changing
   * the signature and meeting the reasoning.
   */
  it("does not consider the booking's status at all", () => {
    expect(Object.keys(REFUNDABLE).sort()).toEqual([
      "amount",
      "paymentStatus",
      "refunded",
      "securityDeposit",
      "settled",
    ]);
  });

  /** Already-refunded outranks everything, so a repeat press reads as the truth. */
  it("reports the refund before the settlement when both are true", () => {
    const result = refundReadiness({
      ...REFUNDABLE,
      refunded: true,
      settled: true,
    });

    expect(!result.ready && result.reason).toMatch(/already been refunded/i);
  });
});
