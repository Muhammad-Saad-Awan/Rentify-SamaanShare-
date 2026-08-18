import { z } from "zod";

import { HandoverCondition } from "@/generated/prisma/enums";
import {
  HANDOVER_NOTES_MAX,
  HANDOVER_PHOTOS_MAX,
  HANDOVER_REPLY_MAX,
} from "@/lib/handover/rules";
import {
  listingIdSchema,
  listingImagePublicIdSchema,
} from "@/lib/validations/listing";

/**
 * Handover input rules.
 *
 * PHOTOS ARE PUBLIC IDS ONLY, never URLs, and this is not a style choice. `listingImagePublicIdSchema`
 * carries the full reasoning: an earlier version of the listing form accepted `{ publicId, url }` and
 * checked only that the URL was on the Cloudinary host, so a crafted submission could pair its own id
 * with *any* Cloudinary URL - including another user's photo. Every URL written here is derived
 * server-side from Cloudinary's Admin API, so there is nothing for a caller to assert.
 *
 * That matters more here than on a listing. A handover photo is evidence in a deposit dispute, and an
 * image an owner could point at while it actually belonged to someone else would be evidence of
 * nothing while looking like proof.
 *
 * NOTE WHAT IS ABSENT: `type`, `recordedById`, `recordedAt`. Which handover this is comes from the
 * booking's own status, and who wrote it from the session - never from input. A client-supplied type
 * would let a return record be filed against a rental that never started.
 */

/** The condition record itself, submitted alongside the transition that creates it. */
export const handoverRecordSchema = z.object({
  bookingId: listingIdSchema,

  condition: z.enum(HandoverCondition, {
    error: "Choose the condition the item is in.",
  }),

  /**
   * Optional, and empty is normalised away rather than stored.
   *
   * A condition grade alone is a legitimate record - two people in a doorway should not be forced to
   * write prose to finish a handover. An empty string would render as a blank quote beside the grade,
   * so it becomes `undefined` and the column stays null.
   */
  notes: z
    .string()
    .trim()
    .max(HANDOVER_NOTES_MAX, {
      error: `Keep the notes under ${HANDOVER_NOTES_MAX} characters.`,
    })
    .optional()
    .transform((value) => (value ? value : undefined)),

  /**
   * Cloudinary public ids, in the order they should be shown.
   *
   * Bounded at both ends by the schema rather than by the form: the form is a convenience and this is
   * a public endpoint. Duplicates are rejected outright - the same photo twice is either a client bug
   * or an attempt to pad a record, and `HandoverPhoto.publicId` is unique so the write would fail
   * anyway, less legibly.
   */
  photoIds: z
    .array(listingImagePublicIdSchema)
    .max(HANDOVER_PHOTOS_MAX, {
      error: `Attach at most ${HANDOVER_PHOTOS_MAX} photos.`,
    })
    .refine((ids) => new Set(ids).size === ids.length, {
      error: "The same photo was attached more than once.",
    })
    .optional()
    .transform((ids) => ids ?? []),
});

export type HandoverRecordInput = z.infer<typeof handoverRecordSchema>;

/**
 * The counterparty's answer.
 *
 * `agreed` is a required boolean with no default. Defaulting either way would put words in the
 * answering party's mouth on a field that is the whole point of asking them - and "agreed" is the
 * one nobody should be able to record by accident.
 */
export const confirmHandoverSchema = z.object({
  handoverId: listingIdSchema,

  agreed: z.boolean({ error: "Choose whether you agree with this record." }),

  /**
   * The answering party's own account.
   *
   * Optional even when disagreeing. Requiring a reason to disagree would push someone who is upset
   * and in a hurry into clicking "agree" to get past the form, which is the opposite of what this
   * field exists to capture.
   */
  note: z
    .string()
    .trim()
    .max(HANDOVER_REPLY_MAX, {
      error: `Keep your reply under ${HANDOVER_REPLY_MAX} characters.`,
    })
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type ConfirmHandoverInput = z.infer<typeof confirmHandoverSchema>;
