import { z } from "zod";

import { UserRole } from "@/generated/prisma/enums";
import { ADMIN_REASON_MAX, ADMIN_REASON_MIN } from "@/lib/admin/rules";
import { listingIdSchema } from "@/lib/validations/listing";

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
