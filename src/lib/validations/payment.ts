import { z } from "zod";

import { listingIdSchema } from "@/lib/validations/listing";

/**
 * Payment verification inputs.
 *
 * Separate from `validations/booking.ts` because these belong to the custodial flow - the renter
 * paying SamaanShare and an administrator confirming it arrived - rather than to the booking
 * lifecycle itself. The booking schemas describe what the two parties do to a rental; these
 * describe what is claimed about money.
 */

/** Long enough for a bank UTR or a wallet TID, short enough to be a reference and not a story. */
export const TRANSACTION_REF_MAX = 120;

/** Matches the reason lengths already used for declines and cancellations. */
export const PAYMENT_REASON_MAX = 500;

/**
 * What the renter submits after paying.
 *
 * `transactionRef` IS REQUIRED, and it is the only required field. An administrator reconciling
 * against a bank or wallet statement needs something to match on; a screenshot alone means
 * reading an amount off an image and guessing which of three same-value transfers it was. Proof
 * is the corroboration, not the identifier.
 */
export const submitPaymentEvidenceSchema = z.object({
  bookingId: listingIdSchema,
  transactionRef: z
    .string()
    .trim()
    .min(1, { error: "Enter the transaction reference from your receipt." })
    .max(TRANSACTION_REF_MAX, {
      error: `A transaction reference is at most ${TRANSACTION_REF_MAX} characters.`,
    }),
  /**
   * Optional, and all three travel together or not at all.
   *
   * `proofHash` is a SHA-256 of the uploaded bytes, computed by the caller that handled the
   * upload. It is what the unique constraint catches a reused screenshot with, so a proof without
   * one would defeat the control while looking like it was in place - hence the refinement below
   * rather than three independently optional fields.
   */
  proofUrl: z.string().url().optional(),
  proofPublicId: z.string().min(1).max(255).optional(),
  proofHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/, {
      error: "Proof hash must be a SHA-256 hex digest.",
    })
    .optional(),
});

export const submitPaymentEvidenceRefined = submitPaymentEvidenceSchema.refine(
  (value) => {
    const parts = [value.proofUrl, value.proofPublicId, value.proofHash];
    const present = parts.filter((part) => part !== undefined).length;

    return present === 0 || present === parts.length;
  },
  { error: "Proof needs its URL, public id and hash together." }
);

/**
 * An administrator verifying a payment.
 *
 * The note is OPTIONAL here and required on the two below, and the asymmetry is deliberate.
 * Verifying is the expected outcome and its justification is already in the data - the reference,
 * the amount, the method - so demanding prose produces "ok" and nothing else. Refusing somebody's
 * money, or undoing a decision they were told about, is neither expected nor self-explanatory.
 */
export const verifyPaymentSchema = z.object({
  bookingId: listingIdSchema,
  note: z.string().trim().max(PAYMENT_REASON_MAX).optional(),
});

/** Refusing a payment. The reason reaches the renter, so it has to say something. */
export const rejectPaymentSchema = z.object({
  bookingId: listingIdSchema,
  reason: z
    .string()
    .trim()
    .min(1, { error: "Say why the payment could not be verified." })
    .max(PAYMENT_REASON_MAX),
});

/** Undoing a verification. The reason is the whole record of why it was wrong. */
export const reverseVerificationSchema = z.object({
  bookingId: listingIdSchema,
  reason: z
    .string()
    .trim()
    .min(1, { error: "Say why the verification is being reversed." })
    .max(PAYMENT_REASON_MAX),
});

export type SubmitPaymentEvidenceInput = z.infer<
  typeof submitPaymentEvidenceSchema
>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;
export type ReverseVerificationInput = z.infer<
  typeof reverseVerificationSchema
>;
