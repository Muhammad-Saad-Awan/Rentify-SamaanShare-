import { describe, expect, it } from "vitest";

import { COMMISSION_RATE_BPS } from "@/config/commission";
import {
  BASIS_POINTS_DIVISOR,
  computeCommission,
  MAX_RATE_BPS,
  totalOwnerPayout,
} from "@/lib/payments/commission";

/**
 * The commission split.
 *
 * The invariant is the point of this file. Every other assertion here is a worked example; the
 * one that would actually cost money if it broke is that the two output figures still add up to
 * the input. A settlement that pays out more or less than was collected is not a rounding
 * nuisance, it is a hole in the ledger.
 */

describe("computeCommission", () => {
  it("takes nothing at a zero rate, which is the launch configuration", () => {
    const result = computeCommission({ rentalAmount: 5_000, rateBps: 0 });

    expect(result.commissionAmount).toBe(0);
    expect(result.ownerRentalAmount).toBe(5_000);
  });

  it("splits an exactly divisible amount", () => {
    // 10% of 5,000.
    const result = computeCommission({ rentalAmount: 5_000, rateBps: 1_000 });

    expect(result.commissionAmount).toBe(500);
    expect(result.ownerRentalAmount).toBe(4_500);
  });

  /**
   * The worked example from the plan: 7.5% of PKR 333 is 24.975, and the remainder rupee is the
   * whole reason a rounding rule had to be chosen rather than assumed.
   */
  it("rounds down and gives the remainder to the owner", () => {
    const result = computeCommission({ rentalAmount: 333, rateBps: 750 });

    expect(result.commissionAmount).toBe(24);
    expect(result.ownerRentalAmount).toBe(309);
    expect(result.commissionAmount + result.ownerRentalAmount).toBe(333);
  });

  it("never rounds a partial rupee up into the platform's column", () => {
    // 99.99% of PKR 1 is 0.9999, which floors to nothing.
    const result = computeCommission({ rentalAmount: 1, rateBps: 9_999 });

    expect(result.commissionAmount).toBe(0);
    expect(result.ownerRentalAmount).toBe(1);
  });

  it("handles the boundaries: zero rental, and a rate of 100%", () => {
    expect(
      computeCommission({ rentalAmount: 0, rateBps: 1_500 })
    ).toMatchObject({ commissionAmount: 0, ownerRentalAmount: 0 });

    expect(
      computeCommission({ rentalAmount: 5_000, rateBps: MAX_RATE_BPS })
    ).toMatchObject({ commissionAmount: 5_000, ownerRentalAmount: 0 });
  });

  /**
   * THE ONE THAT MATTERS. Swept rather than sampled, because a rounding bug does not announce
   * itself at round numbers - it hides at 333 and 1,667 and every other amount where the rate
   * does not divide cleanly.
   */
  it("always splits the rental exactly, across rates and amounts", () => {
    const rates = [
      0, 1, 250, 500, 750, 999, 1_000, 1_234, 5_000, 9_999, 10_000,
    ];

    for (const rateBps of rates) {
      for (let rentalAmount = 0; rentalAmount <= 2_000; rentalAmount += 7) {
        const { commissionAmount, ownerRentalAmount } = computeCommission({
          rentalAmount,
          rateBps,
        });

        expect(
          commissionAmount + ownerRentalAmount,
          `rental ${rentalAmount} at ${rateBps}bps did not split exactly`
        ).toBe(rentalAmount);

        // Both sides are whole rupees, and neither is negative.
        expect(Number.isInteger(commissionAmount)).toBe(true);
        expect(Number.isInteger(ownerRentalAmount)).toBe(true);
        expect(commissionAmount).toBeGreaterThanOrEqual(0);
        expect(ownerRentalAmount).toBeGreaterThanOrEqual(0);

        // Rounding down means the platform never takes more than the exact share.
        expect(commissionAmount).toBeLessThanOrEqual(
          (rentalAmount * rateBps) / BASIS_POINTS_DIVISOR
        );
      }
    }
  });

  it("echoes its inputs, so a settlement row records what it charged against", () => {
    const result = computeCommission({ rentalAmount: 1_200, rateBps: 850 });

    expect(result.rentalAmount).toBe(1_200);
    expect(result.rateBps).toBe(850);
  });

  /**
   * Fails loudly rather than correcting quietly. Every argument comes from an `Int` column or a
   * checked config value, so anything else is a bug upstream - and silently clamping it would
   * turn that bug into a wrong payout nobody goes looking for.
   */
  it("refuses input that could only arrive through a bug", () => {
    expect(() =>
      computeCommission({ rentalAmount: 100.5, rateBps: 500 })
    ).toThrow(TypeError);

    expect(() =>
      computeCommission({ rentalAmount: 100, rateBps: 5.5 })
    ).toThrow(TypeError);

    expect(() => computeCommission({ rentalAmount: -1, rateBps: 500 })).toThrow(
      RangeError
    );

    expect(() => computeCommission({ rentalAmount: 100, rateBps: -1 })).toThrow(
      RangeError
    );

    // Above 100% the owner would be owed a negative amount.
    expect(() =>
      computeCommission({ rentalAmount: 100, rateBps: MAX_RATE_BPS + 1 })
    ).toThrow(RangeError);
  });
});

/**
 * The configured rate, checked against the calculator that will receive it.
 *
 * `computeCommission` throws on a rate outside 0-10,000 bps, and the rate is a hand-edited
 * constant that no type can constrain to a range. Without this, a typo - 15000 for 15% - would
 * type-check, deploy, and surface as an exception in the middle of somebody's settlement. Here it
 * fails in CI instead.
 */
describe("the configured rate", () => {
  it("is a whole number the calculator will accept", () => {
    expect(Number.isInteger(COMMISSION_RATE_BPS)).toBe(true);
    expect(COMMISSION_RATE_BPS).toBeGreaterThanOrEqual(0);
    expect(COMMISSION_RATE_BPS).toBeLessThanOrEqual(MAX_RATE_BPS);

    expect(() =>
      computeCommission({ rentalAmount: 5_000, rateBps: COMMISSION_RATE_BPS })
    ).not.toThrow();
  });

  it("splits exactly at whatever it is currently set to", () => {
    const { commissionAmount, ownerRentalAmount } = computeCommission({
      rentalAmount: 4_999,
      rateBps: COMMISSION_RATE_BPS,
    });

    expect(commissionAmount + ownerRentalAmount).toBe(4_999);
  });
});

describe("totalOwnerPayout", () => {
  /**
   * Damage compensation is money the renter owes the owner, not revenue the platform generated,
   * so no commission is taken from it. This is the assertion that would fail if someone later
   * "simplified" the two figures into one commissioned total.
   */
  it("adds damage compensation without commissioning it", () => {
    const { ownerRentalAmount, commissionAmount } = computeCommission({
      rentalAmount: 5_000,
      rateBps: 1_000,
    });

    const total = totalOwnerPayout({
      ownerRentalAmount,
      damageCompensationAmount: 8_000,
    });

    expect(commissionAmount).toBe(500);
    // 4,500 rental + the full 8,000 claim, with nothing taken from the claim.
    expect(total).toBe(12_500);
  });

  it("is just the rental when there is no claim", () => {
    expect(
      totalOwnerPayout({
        ownerRentalAmount: 4_500,
        damageCompensationAmount: 0,
      })
    ).toBe(4_500);
  });

  it("refuses fractional or negative components", () => {
    expect(() =>
      totalOwnerPayout({
        ownerRentalAmount: 4_500.5,
        damageCompensationAmount: 0,
      })
    ).toThrow(TypeError);

    expect(() =>
      totalOwnerPayout({
        ownerRentalAmount: 4_500,
        damageCompensationAmount: -1,
      })
    ).toThrow(RangeError);
  });
});
