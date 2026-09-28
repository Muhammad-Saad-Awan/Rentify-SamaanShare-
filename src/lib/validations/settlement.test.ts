import { describe, expect, it } from "vitest";

import { TRANSACTION_REF_MAX } from "@/lib/validations/payment";
import {
  recordDepositReturnSchema,
  recordOwnerPayoutSchema,
  SETTLEMENT_NOTES_MAX,
  settleBookingSchema,
} from "@/lib/validations/settlement";

/**
 * The settlement inputs.
 *
 * The first test is the important one. Everything else here is the usual trimming and capping;
 * that one asserts the design claim these schemas exist to make - that no amount reaches the
 * action from outside, whatever a caller sends. A Server Action is a public endpoint, so the
 * guarantee has to hold against a handcrafted request, not just against the form.
 */

const BOOKING_ID = "cmf0000000000000000000000";

describe("settleBooking input", () => {
  it("discards any amount a caller tries to supply", () => {
    const result = settleBookingSchema.safeParse({
      bookingId: BOOKING_ID,
      ownerRentalAmount: 999_999,
      commissionAmount: 0,
      depositReturnedAmount: 999_999,
      totalOwnerPayout: 999_999,
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({ bookingId: BOOKING_ID });
  });

  it("accepts an optional note and trims it", () => {
    const result = settleBookingSchema.safeParse({
      bookingId: BOOKING_ID,
      notes: "  Transfer delayed by a bank holiday.  ",
    });

    expect(result.success && result.data.notes).toBe(
      "Transfer delayed by a bank holiday."
    );
  });

  it("caps the note", () => {
    expect(
      settleBookingSchema.safeParse({
        bookingId: BOOKING_ID,
        notes: "x".repeat(SETTLEMENT_NOTES_MAX + 1),
      }).success
    ).toBe(false);
  });

  it("requires a booking", () => {
    expect(settleBookingSchema.safeParse({ notes: "hello" }).success).toBe(
      false
    );
  });
});

describe("recordOwnerPayout input", () => {
  it("requires a transfer reference", () => {
    expect(
      recordOwnerPayoutSchema.safeParse({ bookingId: BOOKING_ID }).success
    ).toBe(false);

    expect(
      recordOwnerPayoutSchema.safeParse({
        bookingId: BOOKING_ID,
        payoutRef: "   ",
      }).success
    ).toBe(false);
  });

  it("accepts a reference and trims it", () => {
    const result = recordOwnerPayoutSchema.safeParse({
      bookingId: BOOKING_ID,
      payoutRef: "  IBFT-99120034  ",
    });

    expect(result.success && result.data.payoutRef).toBe("IBFT-99120034");
  });

  it("caps the reference at the same length as a payment reference", () => {
    expect(
      recordOwnerPayoutSchema.safeParse({
        bookingId: BOOKING_ID,
        payoutRef: "x".repeat(TRANSACTION_REF_MAX + 1),
      }).success
    ).toBe(false);
  });

  it("discards an amount here too", () => {
    const result = recordOwnerPayoutSchema.safeParse({
      bookingId: BOOKING_ID,
      payoutRef: "IBFT-1",
      amount: 500_000,
    });

    expect(result.success && result.data).toEqual({
      bookingId: BOOKING_ID,
      payoutRef: "IBFT-1",
    });
  });
});

describe("recordDepositReturn input", () => {
  it("requires a transfer reference", () => {
    expect(
      recordDepositReturnSchema.safeParse({ bookingId: BOOKING_ID }).success
    ).toBe(false);
  });

  it("accepts a reference and trims it", () => {
    const result = recordDepositReturnSchema.safeParse({
      bookingId: BOOKING_ID,
      returnRef: "  IBFT-77001  ",
    });

    expect(result.success && result.data.returnRef).toBe("IBFT-77001");
  });

  /** No amount here either: how much goes back was decided at settlement, off the deposit. */
  it("discards an amount", () => {
    const result = recordDepositReturnSchema.safeParse({
      bookingId: BOOKING_ID,
      returnRef: "IBFT-1",
      depositReturnedAmount: 1,
    });

    expect(result.success && result.data).toEqual({
      bookingId: BOOKING_ID,
      returnRef: "IBFT-1",
    });
  });
});
