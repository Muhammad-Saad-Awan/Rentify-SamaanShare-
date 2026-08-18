import { z } from "zod";

import { ClaimReason } from "@/generated/prisma/enums";
import {
  CLAIM_DESCRIPTION_MAX,
  CLAIM_DESCRIPTION_MIN,
  CLAIM_PHOTOS_MAX,
  CLAIM_RESOLUTION_MAX,
  CLAIM_RESPONSE_MAX,
} from "@/lib/claims/rules";
import {
  listingIdSchema,
  listingImagePublicIdSchema,
} from "@/lib/validations/listing";

/**
 * Damage claim input rules.
 *
 * NOTE WHAT IS ABSENT: `claimantId`, `respondentId`, `status`, `amountUpheld`, `handoverId`. Every
 * one is derived on the server from the booking. A client-supplied respondent would let someone aim
 * a demand for money at a person who was not party to the rental; a client-supplied `amountUpheld`
 * would let the claimant decide their own award.
 *
 * The cap on `amountClaimed` is NOT here either, because it depends on the booking's deposit, which
 * this schema cannot see. `canFileClaim` enforces it against the real figure.
 *
 * Photos are public ids only. `resolveOwnedPhotos` records why: accepting a URL alongside an id let a
 * crafted submission pair its own id with any Cloudinary URL, including another user's photo - and a
 * claim photo is evidence in a dispute over money.
 */

/** Whole rupees. Matches the Int columns and `formatPKR`, with no Decimal at any boundary. */
const pkrAmount = z
  .number()
  .int({ error: "Enter a whole number of rupees." })
  .positive({ error: "Enter an amount greater than zero." })
  .max(2_000_000_000, { error: "That amount is too large." });

const claimPhotoIds = z
  .array(listingImagePublicIdSchema)
  .max(CLAIM_PHOTOS_MAX, {
    error: `Attach at most ${CLAIM_PHOTOS_MAX} photos.`,
  })
  .refine((ids) => new Set(ids).size === ids.length, {
    error: "The same photo was attached more than once.",
  })
  .optional()
  .transform((ids) => ids ?? []);

export const fileClaimSchema = z.object({
  bookingId: listingIdSchema,

  reason: z.enum(ClaimReason, { error: "Choose what went wrong." }),

  /**
   * Required, and with a floor.
   *
   * Unlike a handover note, which may be a grade alone because two people are standing in a doorway,
   * a claim asks for money and has to say what for. The minimum is low enough not to be a hurdle and
   * high enough that "broken" on its own does not reach an administrator as the entire case.
   */
  description: z
    .string()
    .trim()
    .min(CLAIM_DESCRIPTION_MIN, {
      error: `Describe what happened in at least ${CLAIM_DESCRIPTION_MIN} characters.`,
    })
    .max(CLAIM_DESCRIPTION_MAX, {
      error: `Keep the description under ${CLAIM_DESCRIPTION_MAX} characters.`,
    }),

  amountClaimed: pkrAmount,

  photoIds: claimPhotoIds,
});

export type FileClaimInput = z.infer<typeof fileClaimSchema>;

/**
 * The renter's answer.
 *
 * `accepted` is a required boolean with no default, for the same reason the handover reply has none:
 * this is the field the whole question turns on, and accepting a demand for money is the last thing
 * anyone should be able to record by misclick.
 */
export const respondToClaimSchema = z.object({
  claimId: listingIdSchema,

  accepted: z.boolean({ error: "Choose whether you accept this claim." }),

  /**
   * Optional even when disputing.
   *
   * Requiring a reason would push someone who is upset and in a hurry toward accepting to get past
   * the form - which is the exact outcome this field exists to prevent.
   */
  note: z
    .string()
    .trim()
    .max(CLAIM_RESPONSE_MAX, {
      error: `Keep your reply under ${CLAIM_RESPONSE_MAX} characters.`,
    })
    .optional()
    .transform((value) => (value ? value : undefined)),

  photoIds: claimPhotoIds,
});

export type RespondToClaimInput = z.infer<typeof respondToClaimSchema>;

/** Withdrawing needs nothing but the claim. */
export const withdrawClaimSchema = z.object({ claimId: listingIdSchema });

/**
 * An administrator's determination.
 *
 * `amountUpheld` may be zero - deciding entirely for the renter is a real outcome and has to be
 * recordable as one, which is why this uses a non-negative integer rather than `pkrAmount`.
 */
export const resolveClaimSchema = z.object({
  claimId: listingIdSchema,

  amountUpheld: z
    .number()
    .int({ error: "Enter a whole number of rupees." })
    .min(0, { error: "The amount upheld cannot be negative." })
    .max(2_000_000_000, { error: "That amount is too large." }),

  /**
   * Required, unlike a report's resolution note.
   *
   * A report can close with no note and simply read as unexplained. A claim moves money between two
   * people who both argued their case, and a determination neither of them can read the reasoning
   * for is one neither of them can accept or appeal.
   */
  resolution: z
    .string()
    .trim()
    .min(CLAIM_DESCRIPTION_MIN, {
      error: `Explain the decision in at least ${CLAIM_DESCRIPTION_MIN} characters.`,
    })
    .max(CLAIM_RESOLUTION_MAX, {
      error: `Keep the decision under ${CLAIM_RESOLUTION_MAX} characters.`,
    }),
});

export type ResolveClaimInput = z.infer<typeof resolveClaimSchema>;
