import { describe, expect, it } from "vitest";

import {
  BookingStatus,
  ClaimStatus,
  PaymentStatus,
} from "@/generated/prisma/enums";
import {
  computeSettlement,
  depositReturnedAtOf,
  settlementReadiness,
  settlementTransfers,
  type SettlementSubject,
} from "@/lib/payments/settlement";

/**
 * Settlement: the arithmetic and the eligibility policy.
 *
 * The arithmetic is asserted for the property that matters when a bank statement is held up
 * against this table - nothing is created and nothing disappears - rather than for a handful of
 * worked examples. The policy is asserted branch by branch, including the branches that are
 * awkward to reach through real rows, which is the reason it is a pure function at all.
 */

describe("computeSettlement", () => {
  it("gives the owner the whole rental at a zero rate", () => {
    const result = computeSettlement({
      rentalAmount: 5_000,
      rateBps: 0,
      securityDeposit: 10_000,
      damageCompensationAmount: 0,
    });

    expect(result.commissionAmount).toBe(0);
    expect(result.ownerRentalAmount).toBe(5_000);
    expect(result.depositReturnedAmount).toBe(10_000);
    expect(result.totalOwnerPayout).toBe(5_000);
  });

  it("rounds the commission down and leaves the remainder with the owner", () => {
    // 7.5% of 3,333 is 249.975.
    const result = computeSettlement({
      rentalAmount: 3_333,
      rateBps: 750,
      securityDeposit: 0,
      damageCompensationAmount: 0,
    });

    expect(result.commissionAmount).toBe(249);
    expect(result.ownerRentalAmount).toBe(3_084);
  });

  /**
   * The conservation rules, over a spread of rates and amounts chosen to land on and either side
   * of exact division. If these hold, the platform cannot disburse more or less than it took.
   */
  it("conserves every rupee collected", () => {
    const rates = [0, 1, 250, 750, 1_000, 3_333, 9_999, 10_000];
    const rentals = [0, 1, 7, 999, 1_000, 3_333, 250_000];
    const deposits = [0, 1, 5_000, 100_000];

    for (const rateBps of rates) {
      for (const rentalAmount of rentals) {
        for (const securityDeposit of deposits) {
          for (const damageCompensationAmount of [
            0,
            Math.floor(securityDeposit / 3),
            securityDeposit,
          ]) {
            const s = computeSettlement({
              rentalAmount,
              rateBps,
              securityDeposit,
              damageCompensationAmount,
            });

            expect(s.commissionAmount + s.ownerRentalAmount).toBe(rentalAmount);
            expect(s.damageCompensationAmount + s.depositReturnedAmount).toBe(
              securityDeposit
            );
            expect(
              s.commissionAmount + s.totalOwnerPayout + s.depositReturnedAmount
            ).toBe(rentalAmount + securityDeposit);
          }
        }
      }
    }
  });

  /**
   * D3, stated as a test rather than as a comment: a settlement with no rental and a large
   * deposit produces no commission at all, whatever the rate.
   */
  it("never takes a commission on the deposit", () => {
    const result = computeSettlement({
      rentalAmount: 0,
      rateBps: 10_000,
      securityDeposit: 100_000,
      damageCompensationAmount: 40_000,
    });

    expect(result.commissionAmount).toBe(0);
    expect(result.depositReturnedAmount).toBe(60_000);
    expect(result.totalOwnerPayout).toBe(40_000);
  });

  it("returns nothing to the renter when damage consumes the deposit", () => {
    const result = computeSettlement({
      rentalAmount: 2_000,
      rateBps: 1_000,
      securityDeposit: 25_000,
      damageCompensationAmount: 25_000,
    });

    expect(result.depositReturnedAmount).toBe(0);
    expect(result.totalOwnerPayout).toBe(1_800 + 25_000);
  });

  it("refuses damage compensation above the deposit", () => {
    expect(() =>
      computeSettlement({
        rentalAmount: 1_000,
        rateBps: 0,
        securityDeposit: 5_000,
        damageCompensationAmount: 5_001,
      })
    ).toThrow(RangeError);
  });

  it("refuses fractional and negative amounts", () => {
    expect(() =>
      computeSettlement({
        rentalAmount: 1_000,
        rateBps: 0,
        securityDeposit: 100.5,
        damageCompensationAmount: 0,
      })
    ).toThrow(TypeError);

    expect(() =>
      computeSettlement({
        rentalAmount: 1_000,
        rateBps: 0,
        securityDeposit: 100,
        damageCompensationAmount: -1,
      })
    ).toThrow(RangeError);
  });
});

const READY: SettlementSubject = {
  bookingStatus: BookingStatus.COMPLETED,
  paymentStatus: PaymentStatus.COMPLETED,
  commissionRateBps: 0,
  refunded: false,
  settled: false,
};

describe("settlementReadiness", () => {
  it("clears a finished rental with a verified payment and no claim", () => {
    expect(settlementReadiness(READY)).toEqual({
      ready: true,
      commissionRateBps: 0,
      damageCompensationAmount: 0,
    });
  });

  it("clears a reviewed rental too", () => {
    expect(
      settlementReadiness({
        ...READY,
        bookingStatus: BookingStatus.REVIEWED,
      }).ready
    ).toBe(true);
  });

  /**
   * The rate travels with the verdict rather than being re-read off the payment, so the caller
   * cannot reach `computeSettlement` with a rate this function never approved.
   */
  it("hands back the frozen rate it approved", () => {
    const result = settlementReadiness({ ...READY, commissionRateBps: 750 });

    expect(result.ready && result.commissionRateBps).toBe(750);
  });

  it("refuses a booking that is already settled", () => {
    expect(settlementReadiness({ ...READY, settled: true }).ready).toBe(false);
  });

  it("refuses a refunded payment, so a booking cannot both settle and refund", () => {
    const result = settlementReadiness({ ...READY, refunded: true });

    expect(result.ready).toBe(false);
    expect(!result.ready && result.reason).toMatch(/refunded/i);
  });

  it("refuses while the item is still out", () => {
    const result = settlementReadiness({
      ...READY,
      bookingStatus: BookingStatus.ACTIVE,
    });

    expect(!result.ready && result.reason).toMatch(/not come back/i);
  });

  it("points a cancelled booking at a refund", () => {
    const result = settlementReadiness({
      ...READY,
      bookingStatus: BookingStatus.CANCELLED,
    });

    expect(!result.ready && result.reason).toMatch(/refund/i);
  });

  /**
   * The order of the checks is itself the behaviour: this booking fails two of them, and the one
   * reported is the one an administrator can act on.
   */
  it("reports the booking before the payment when both are wrong", () => {
    const result = settlementReadiness({
      ...READY,
      bookingStatus: BookingStatus.CANCELLED,
      paymentStatus: PaymentStatus.PENDING_VERIFICATION,
    });

    expect(!result.ready && result.reason).toMatch(/refund/i);
  });

  it("refuses an unverified payment", () => {
    const result = settlementReadiness({
      ...READY,
      paymentStatus: PaymentStatus.PENDING_VERIFICATION,
    });

    expect(!result.ready && result.reason).toMatch(/not verified/i);
  });

  it("refuses a payment with no frozen commission rate", () => {
    const result = settlementReadiness({ ...READY, commissionRateBps: null });

    expect(!result.ready && result.reason).toMatch(/commission rate/i);
  });

  it("refuses while a claim is open or disputed", () => {
    for (const status of [ClaimStatus.OPEN, ClaimStatus.DISPUTED]) {
      const result = settlementReadiness({
        ...READY,
        claim: { status, amountUpheld: null },
      });

      expect(!result.ready && result.reason).toMatch(/still being decided/i);
    }
  });

  it("treats a withdrawn claim as no compensation", () => {
    expect(
      settlementReadiness({
        ...READY,
        claim: { status: ClaimStatus.WITHDRAWN, amountUpheld: null },
      })
    ).toEqual({
      ready: true,
      commissionRateBps: 0,
      damageCompensationAmount: 0,
    });
  });

  it("carries the upheld amount through from a settled claim", () => {
    for (const status of [ClaimStatus.ACCEPTED, ClaimStatus.RESOLVED]) {
      expect(
        settlementReadiness({
          ...READY,
          claim: { status, amountUpheld: 4_500 },
        })
      ).toEqual({
        ready: true,
        commissionRateBps: 0,
        damageCompensationAmount: 4_500,
      });
    }
  });

  /** Zero upheld is a decision and must not be confused with the broken row below it. */
  it("accepts a claim resolved at zero", () => {
    expect(
      settlementReadiness({
        ...READY,
        claim: { status: ClaimStatus.RESOLVED, amountUpheld: 0 },
      })
    ).toEqual({
      ready: true,
      commissionRateBps: 0,
      damageCompensationAmount: 0,
    });
  });

  it("refuses a settled claim with no upheld figure", () => {
    const result = settlementReadiness({
      ...READY,
      claim: { status: ClaimStatus.ACCEPTED, amountUpheld: null },
    });

    expect(!result.ready && result.reason).toMatch(/no upheld amount/i);
  });
});

const AT = new Date("2026-09-20T10:00:00.000Z");

describe("settlementTransfers", () => {
  it("reports both as owed before anything is sent", () => {
    const t = settlementTransfers({
      ownerRentalAmount: 4_625,
      damageCompensationAmount: 0,
      ownerPaidAt: null,
      depositReturnedAmount: 25_000,
      depositReturnedAt: null,
    });

    expect(t.ownerPayout).toEqual({ kind: "owed", amount: 4_625 });
    expect(t.depositReturn).toEqual({ kind: "owed", amount: 25_000 });
    expect(t.complete).toBe(false);
  });

  /** The two are independent: paying one side must not make the settlement look finished. */
  it("stays incomplete when only the owner has been paid", () => {
    const t = settlementTransfers({
      ownerRentalAmount: 4_625,
      damageCompensationAmount: 0,
      ownerPaidAt: AT,
      depositReturnedAmount: 25_000,
      depositReturnedAt: null,
    });

    expect(t.ownerPayout).toEqual({ kind: "sent", amount: 4_625, at: AT });
    expect(t.complete).toBe(false);
  });

  it("adds damage compensation into the owner's transfer", () => {
    const t = settlementTransfers({
      ownerRentalAmount: 1_850,
      damageCompensationAmount: 6_000,
      ownerPaidAt: null,
      depositReturnedAmount: 19_000,
      depositReturnedAt: null,
    });

    expect(t.ownerPayout).toEqual({ kind: "owed", amount: 7_850 });
  });

  /**
   * The case this function exists for. A claim that takes the whole deposit leaves no transfer to
   * make, and reporting it as outstanding would leave the settlement permanently unfinishable.
   */
  it("has nothing to send when damage consumed the deposit", () => {
    const t = settlementTransfers({
      ownerRentalAmount: 1_850,
      damageCompensationAmount: 25_000,
      ownerPaidAt: AT,
      depositReturnedAmount: 0,
      depositReturnedAt: null,
    });

    expect(t.depositReturn).toEqual({ kind: "nothing-to-send" });
    expect(t.complete).toBe(true);
  });

  it("is complete once both have been sent", () => {
    const t = settlementTransfers({
      ownerRentalAmount: 4_625,
      damageCompensationAmount: 0,
      ownerPaidAt: AT,
      depositReturnedAmount: 25_000,
      depositReturnedAt: AT,
    });

    expect(t.complete).toBe(true);
  });
});

describe("depositReturnedAtOf", () => {
  it("prefers the settlement, which is the custodial record", () => {
    const settled = new Date("2026-09-21T10:00:00.000Z");

    expect(
      depositReturnedAtOf({
        settlement: { depositReturnedAt: settled },
        payment: { depositReturnedAt: AT },
      })
    ).toBe(settled);
  });

  /** An offline booking has no settlement, and its record is the one that must still be found. */
  it("falls back to the payment while the offline flow is live", () => {
    expect(
      depositReturnedAtOf({
        settlement: null,
        payment: { depositReturnedAt: AT },
      })
    ).toBe(AT);
  });

  it("reports nothing when neither has a record", () => {
    expect(
      depositReturnedAtOf({
        settlement: { depositReturnedAt: null },
        payment: { depositReturnedAt: null },
      })
    ).toBeNull();

    expect(depositReturnedAtOf({})).toBeNull();
  });
});
