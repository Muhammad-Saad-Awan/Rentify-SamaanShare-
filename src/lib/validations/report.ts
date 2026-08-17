import { z } from "zod";

import { ReportAction, ReportReason } from "@/generated/prisma/enums";
import {
  REPORT_DESCRIPTION_MAX,
  RESOLUTION_NOTE_MAX,
} from "@/lib/reports/rules";
import { listingIdSchema } from "@/lib/validations/listing";

/**
 * Report input rules.
 *
 * NOTE WHAT IS ABSENT: `type`. Which kind of thing is being reported is fixed by *which action was
 * called* - `reportListing`, `reportUser`, `reportReview` - never by a field. A client-supplied type
 * paired with a mismatched id is the one input that could steer a moderator's action onto the wrong
 * row, because `Report.targetId` carries no foreign key and nothing in the database would object.
 *
 * Also absent: `status`, `resolvedBy`, `resolvedAt`, `action`. Those are moderation state, written
 * by the resolving action from the admin's own session.
 *
 * Whether a reason *fits* its target is checked in the action against `isReasonValidFor`, not here.
 * The rule depends on the type, and the type is not in this schema by design.
 */

export const createReportSchema = z.object({
  /**
   * The listing, user or review being reported.
   *
   * Reuses `listingIdSchema` because all four models use the same cuid format; the name is
   * historical rather than a claim about what this id points to.
   */
  targetId: listingIdSchema,

  reason: z.enum(ReportReason, { error: "Choose a reason for this report." }),

  /**
   * Optional context, and empty is normalised away rather than stored.
   *
   * A predefined reason is enough to triage on, and demanding prose from someone reporting
   * harassment adds a hurdle exactly where it is least welcome. An empty string in the column would
   * render as a blank quote in the moderation queue, so it becomes `undefined` and stays null.
   */
  description: z
    .string()
    .trim()
    .max(REPORT_DESCRIPTION_MAX, {
      error: `Keep the description under ${REPORT_DESCRIPTION_MAX} characters.`,
    })
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;

/**
 * A moderator's decision on a report.
 *
 * `action` is required and has no default. `NONE` is a real choice that must be made deliberately -
 * defaulting to it would let a misclick close a report as "investigated, nothing warranted", which
 * is a stronger claim than the moderator made and is recorded permanently.
 */
export const resolveReportSchema = z.object({
  reportId: listingIdSchema,

  action: z.enum(ReportAction, { error: "Choose what action to take." }),

  /**
   * Why the moderator decided what they decided.
   *
   * Optional, but the queue shows its absence rather than hiding it: a suspension with no note is
   * a decision nobody can review later, and making that visible is more useful than forcing a
   * sentence that would be typed as "spam" to get past the validator.
   */
  resolution: z
    .string()
    .trim()
    .max(RESOLUTION_NOTE_MAX, {
      error: `Keep the note under ${RESOLUTION_NOTE_MAX} characters.`,
    })
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type ResolveReportInput = z.infer<typeof resolveReportSchema>;

/** Dismissing needs no action - the outcome is the dismissal - but still records why. */
export const dismissReportSchema = resolveReportSchema.omit({ action: true });

export type DismissReportInput = z.infer<typeof dismissReportSchema>;
