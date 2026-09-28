import { describe, expect, it } from "vitest";

import {
  PAYMENT_REASON_MAX,
  rejectPaymentSchema,
  reverseVerificationSchema,
  submitPaymentEvidenceRefined,
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
    const result = submitPaymentEvidenceRefined.safeParse({
      bookingId: BOOKING_ID,
      transactionRef: "TID-4482991",
    });

    expect(result.success).toBe(true);
  });

  it("requires a transaction reference", () => {
    expect(
      submitPaymentEvidenceRefined.safeParse({
        bookingId: BOOKING_ID,
        transactionRef: "   ",
      }).success
    ).toBe(false);
  });

  it("trims the reference, so whitespace is not stored as a distinct value", () => {
    const result = submitPaymentEvidenceRefined.safeParse({
      bookingId: BOOKING_ID,
      transactionRef: "  TID-4482991  ",
    });

    expect(result.success && result.data.transactionRef).toBe("TID-4482991");
  });

  it("caps the reference length", () => {
    expect(
      submitPaymentEvidenceRefined.safeParse({
        bookingId: BOOKING_ID,
        transactionRef: "x".repeat(TRANSACTION_REF_MAX + 1),
      }).success
    ).toBe(false);
  });

  /**
   * Proof travels as a set or not at all. A URL with no hash would store a receipt that the
   * duplicate-screenshot constraint cannot see - the control would look present and do nothing.
   */
  it("accepts a complete proof", () => {
    expect(
      submitPaymentEvidenceRefined.safeParse({
        bookingId: BOOKING_ID,
        transactionRef: "TID-1",
        proofUrl: "https://res.cloudinary.com/demo/image/upload/x.jpg",
        proofPublicId: "payments/x",
        proofHash: HASH,
      }).success
    ).toBe(true);
  });

  it("refuses a partial proof", () => {
    expect(
      submitPaymentEvidenceRefined.safeParse({
        bookingId: BOOKING_ID,
        transactionRef: "TID-1",
        proofUrl: "https://res.cloudinary.com/demo/image/upload/x.jpg",
      }).success
    ).toBe(false);
  });

  it("refuses a hash that is not a SHA-256 digest", () => {
    expect(
      submitPaymentEvidenceRefined.safeParse({
        bookingId: BOOKING_ID,
        transactionRef: "TID-1",
        proofUrl: "https://res.cloudinary.com/demo/image/upload/x.jpg",
        proofPublicId: "payments/x",
        proofHash: "not-a-hash",
      }).success
    ).toBe(false);
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
