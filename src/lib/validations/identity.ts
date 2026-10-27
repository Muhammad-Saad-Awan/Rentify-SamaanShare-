import { z } from "zod";

import { listingIdSchema } from "@/lib/validations/listing";

/**
 * Rules for a member's CNIC submission and an administrator's review of it.
 *
 * TRANSFORM-FREE, as in `validations/profile.ts`: the number is checked with `.refine()` against
 * {@link normalizeCnic} and converted once, in the action, immediately before the write.
 */

/** Digits in a CNIC: five for the region, seven for the family and person, one check digit. */
const CNIC_DIGITS = 13;

/**
 * A CNIC in its printed form, `12345-1234567-1`, or `null` if it is not one.
 *
 * Accepts what people actually type - with dashes, without, with spaces - and stores one shape, so
 * the uniqueness constraint compares like with like. Two accounts entering the same number with and
 * without dashes must collide; that collision is the point of the constraint.
 */
export function normalizeCnic(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");

  if (!new RegExp(`^\\d{${CNIC_DIGITS}}$`).test(digits)) {
    return null;
  }

  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

/**
 * The number shown to anyone but the member and an administrator: `*****-*******-1`.
 *
 * Only the check digit, so the member can tell which card is on file without the profile page
 * displaying their national identity number in full to whoever is looking over their shoulder.
 */
export function maskCnic(cnic: string): string {
  return `*****-*******-${cnic.slice(-1)}`;
}

/** A Cloudinary public id as the browser reports it. Ownership is checked in the action. */
const publicIdSchema = z
  .string({ error: "Upload both sides of your CNIC." })
  .min(1, "Upload both sides of your CNIC.")
  .max(300, "That upload could not be read. Please try again.");

export const submitIdentityDocumentSchema = z.object({
  cnicNumber: z
    .string({ error: "Enter your CNIC number." })
    .refine((value) => normalizeCnic(value) !== null, {
      message:
        "Enter the 13-digit number from your CNIC, like 12345-1234567-1.",
    }),
  frontPublicId: publicIdSchema,
  backPublicId: publicIdSchema,
});

export type SubmitIdentityDocumentInput = z.infer<
  typeof submitIdentityDocumentSchema
>;

/** Long enough to be a reason the member can act on, not a single word. */
export const REJECTION_REASON_MIN_LENGTH = 10;
export const REJECTION_REASON_MAX_LENGTH = 500;

export const reviewIdentityDocumentSchema = z
  .object({
    userId: listingIdSchema,
    decision: z.enum(["approve", "reject"], {
      error: "Choose whether to approve or reject this document.",
    }),
    reason: z.string().max(REJECTION_REASON_MAX_LENGTH).optional(),
  })
  .refine(
    (value) =>
      value.decision === "approve" ||
      (value.reason?.trim().length ?? 0) >= REJECTION_REASON_MIN_LENGTH,
    {
      message:
        "Tell the member what was wrong, so they know what to upload instead.",
      path: ["reason"],
    }
  );
