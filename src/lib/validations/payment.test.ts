import { describe, expect, it } from "vitest";

import {
  PAYMENT_REASON_MAX,
  recordRefundSchema,
  rejectPaymentSchema,
  reverseVerificationSchema,
  submitPaymentEvidenceSchema,
  TRANSACTION_REF_MAX,
  verifyPaymentSchema,
} from "@/lib/validations/payment";

/**
 * The payment verification inputs.
 *
 * These schemas are the only thing standing between a Server Action and whatever a caller felt
 * like sending, because an action is a public HTTP endpoint and the client-side check can simply
 * be skipped. What is asserted here is mostly the refusals.
 */

const BOOKING_ID = "cmf0000000000000000000000";
const HASH = "a".repeat(64);

describe("submitPaymentEvidence input", () => {
  it("accepts a reference on its own", () => {
    const result = submitPaymentEvidenceSchema.safeParse({
      bookingId: BOOKING_ID,
      transactionRef: "TID-4482991",
    });

    expect(result.success).toBe(true);
  });

  it("requires a transaction reference", () => {
    expect(
      submitPaymentEvidenceSchema.safeParse({
        bookingId: BOOKING_ID,
        transactionRef: "   ",
      }).success
    ).toBe(false);
  });

  it("trims the reference, so whitespace is not stored as a distinct value", () => {
    const result = submitPaymentEvidenceSchema.safeParse({
      bookingId: BOOKING_ID,
      transactionRef: "  TID-4482991  ",
    });

    expect(result.success && result.data.transactionRef).toBe("TID-4482991");
  });

  it("caps the reference length", () => {
    expect(
      submitPaymentEvidenceSchema.safeParse({
        bookingId: BOOKING_ID,
        transactionRef: "x".repeat(TRANSACTION_REF_MAX + 1),
      }).success
    ).toBe(false);
  });

  /**
   * THE PROOF IS A PUBLIC ID AND NOTHING ELSE, and that is the point of these three.
   *
   * The URL and the SHA-256 used to arrive alongside it, and the hash is what the
   * duplicate-receipt constraint rests on - so a caller could send any 64 hex characters and
   * walk past the one control that catches a screenshot reused across two bookings. Both are
   * now derived from Cloudinary server-side. A schema that still accepted them would leave the
   * hole open whatever the action did with them.
   */
  it("accepts a receipt as a public id", () => {
    const result = submitPaymentEvidenceSchema.safeParse({
      bookingId: BOOKING_ID,
      transactionRef: "TID-1",
      proofPublicId: "samaanshare/pending/user-1/receipt",
    });

    expect(result.success && result.data.proofPublicId).toBe(
      "samaanshare/pending/user-1/receipt"
    );
  });

  it("discards a URL or a hash a caller sends alongside it", () => {
    const result = submitPaymentEvidenceSchema.safeParse({
      bookingId: BOOKING_ID,
      transactionRef: "TID-1",
      proofPublicId: "samaanshare/pending/user-1/receipt",
      proofUrl: "https://res.cloudinary.com/demo/image/upload/x.jpg",
      proofHash: HASH,
    });

    expect(result.success && result.data).toEqual({
      bookingId: BOOKING_ID,
      transactionRef: "TID-1",
      proofPublicId: "samaanshare/pending/user-1/receipt",
    });
  });

  it("still accepts a submission with no receipt at all", () => {
    expect(
      submitPaymentEvidenceSchema.safeParse({
        bookingId: BOOKING_ID,
        transactionRef: "TID-1",
      }).success
    ).toBe(true);
  });
});

describe("administrator decisions", () => {
  /**
   * The asymmetry is the point: verifying is the expected outcome and its justification is in the
   * data, while refusing somebody's money or undoing a decision they were told about is neither.
   */
  it("lets a verification carry no note", () => {
    expect(
      verifyPaymentSchema.safeParse({ bookingId: BOOKING_ID }).success
    ).toBe(true);
  });

  it("requires a reason to reject", () => {
    expect(
      rejectPaymentSchema.safeParse({ bookingId: BOOKING_ID }).success
    ).toBe(false);

    expect(
      rejectPaymentSchema.safeParse({ bookingId: BOOKING_ID, reason: "  " })
        .success
    ).toBe(false);

    expect(
      rejectPaymentSchema.safeParse({
        bookingId: BOOKING_ID,
        reason: "No transfer matching this reference in the account.",
      }).success
    ).toBe(true);
  });

  it("requires a reason to reverse a verification", () => {
    expect(
      reverseVerificationSchema.safeParse({ bookingId: BOOKING_ID }).success
    ).toBe(false);

    expect(
      reverseVerificationSchema.safeParse({
        bookingId: BOOKING_ID,
        reason: "Verified against the wrong booking.",
      }).success
    ).toBe(true);
  });

  it("caps reason length on both", () => {
    const tooLong = "x".repeat(PAYMENT_REASON_MAX + 1);

    expect(
      rejectPaymentSchema.safeParse({ bookingId: BOOKING_ID, reason: tooLong })
        .success
    ).toBe(false);

    expect(
      reverseVerificationSchema.safeParse({
        bookingId: BOOKING_ID,
        reason: tooLong,
      }).success
    ).toBe(false);
  });
});

describe("recordRefund input", () => {
  it("requires both a reference and a reason", () => {
    expect(
      recordRefundSchema.safeParse({ bookingId: BOOKING_ID }).success
    ).toBe(false);

    expect(
      recordRefundSchema.safeParse({ bookingId: BOOKING_ID, refundRef: "R-1" })
        .success
    ).toBe(false);

    expect(
      recordRefundSchema.safeParse({
        bookingId: BOOKING_ID,
        refundRef: "R-1",
        reason: "Listing was removed after the payment cleared.",
      }).success
    ).toBe(true);
  });

  /** No partial refunds, so no amount - the figure is derived, never typed. */
  it("discards an amount", () => {
    const result = recordRefundSchema.safeParse({
      bookingId: BOOKING_ID,
      refundRef: "R-1",
      reason: "Duplicate payment.",
      refundAmount: 1,
    });

    expect(result.success && result.data).toEqual({
      bookingId: BOOKING_ID,
      refundRef: "R-1",
      reason: "Duplicate payment.",
    });
  });
});
