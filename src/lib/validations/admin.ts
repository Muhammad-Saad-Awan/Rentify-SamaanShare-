import { z } from "zod";

import { UserRole } from "@/generated/prisma/enums";
import { ADMIN_REASON_MAX, ADMIN_REASON_MIN } from "@/lib/admin/rules";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  listingIdSchema,
  TITLE_MAX,
  TITLE_MIN,
} from "@/lib/validations/listing";

/**
 * Administrator action input rules.
 *
 * NOTE WHAT IS ABSENT: `actorId`. Who is acting comes from the session, never from input - a
 * client-supplied actor would let one administrator's decisions be recorded against another's name,
 * which is precisely what the audit log exists to prevent.
 *
 * THE REASON IS REQUIRED ON EVERY ONE OF THESE, unlike a report's resolution note. A report can
 * close unexplained and simply read as unexplained; these change somebody's access to the platform,
 * and a decision nobody can read the reasoning for is one nobody can review or appeal.
 */

const adminReason = z
  .string()
  .trim()
  .min(ADMIN_REASON_MIN, {
    error: `Give a reason of at least ${ADMIN_REASON_MIN} characters. It is recorded permanently.`,
  })
  .max(ADMIN_REASON_MAX, {
    error: `Keep the reason under ${ADMIN_REASON_MAX} characters.`,
  });

/** Suspend, ban and reinstate all take the same shape - only the action differs. */
export const moderateUserSchema = z.object({
  userId: listingIdSchema,
  reason: adminReason,
});

export type ModerateUserInput = z.infer<typeof moderateUserSchema>;

/**
 * A role change.
 *
 * `newRole` is required and has no default. Defaulting it would let the most consequential action in
 * the system be triggered by a form that was never filled in.
 */
export const changeRoleSchema = z.object({
  userId: listingIdSchema,
  newRole: z.enum(UserRole, { error: "Choose a role." }),
  reason: adminReason,
});

export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;

/** Removing and restoring a listing take the same shape - only the action differs. */
export const moderateListingSchema = z.object({
  listingId: listingIdSchema,
  reason: adminReason,
});

export type ModerateListingInput = z.infer<typeof moderateListingSchema>;

/**
 * A moderator's edit to a listing's copy.
 *
 * TITLE AND DESCRIPTION ONLY. Everything else on a listing is the owner's commercial decision - see
 * `ADMIN_EDITABLE_LISTING_FIELDS`. Note in particular that `images` is absent: an administrator who
 * could replace the photos could change what the owner's evidence of the item's condition at
 * handover shows.
 *
 * THE SAME LIMITS THE OWNER'S OWN FORM ENFORCES, imported rather than restated. If moderation could
 * write a three-character title, the owner's edit form would refuse to save the listing afterwards -
 * their own listing would be uneditable until somebody worked out why, and the error would name a
 * field they did not touch.
 */
export const adminEditListingSchema = z.object({
  listingId: listingIdSchema,
  title: z
    .string()
    .trim()
    .min(TITLE_MIN, {
      error: `Title must be at least ${TITLE_MIN} characters.`,
    })
    .max(TITLE_MAX, {
      error: `Title must be ${TITLE_MAX} characters or fewer.`,
    }),
  description: z
    .string()
    .trim()
    .min(DESCRIPTION_MIN, {
      error: `Description must be at least ${DESCRIPTION_MIN} characters.`,
    })
    .max(DESCRIPTION_MAX, {
      error: `Description must be ${DESCRIPTION_MAX} characters or fewer.`,
    }),
  reason: adminReason,
});

export type AdminEditListingInput = z.infer<typeof adminEditListingSchema>;
