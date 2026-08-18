import {
  ReportAction,
  ReportReason,
  ReportStatus,
  ReportType,
} from "@/generated/prisma/enums";

/**
 * Reporting and moderation rules. Pure, so all of this is testable without a database.
 *
 * FOUR PROPERTIES THIS EXISTS TO PROTECT.
 *
 * 1. A reason must fit what is being reported. Fifteen reasons on every form would let someone file
 *    INCORRECT_PRICING against a person, and the triage queue - whose entire value is being sortable
 *    by reason - would fill with categories that mean nothing for their target.
 *
 * 2. An action must fit what is being resolved. `REMOVE_LISTING` on a review report would either do
 *    nothing or, worse, act on whatever row happened to share that id: `Report.targetId` is
 *    polymorphic with no foreign key, so nothing in the database would object.
 *
 * 3. Nobody reports themselves. Self-reporting is either a mistake or an attempt to manufacture a
 *    record, and both are worth refusing outright rather than putting in front of a moderator.
 *
 * 4. A report is resolved once. Resolution applies a real consequence - a suspension, a removal - so
 *    a second resolution is a second consequence for one complaint.
 */

/** Bound on the reporter's free-text description, shared by the schema and the form. */
export const REPORT_DESCRIPTION_MAX = 1000;

/** Bound on the moderator's resolution note. */
export const RESOLUTION_NOTE_MAX = 1000;

/**
 * Which reasons may be filed against which kind of target.
 *
 * A total map over `ReportType`, so adding a target type fails to compile rather than silently
 * offering an empty list - a form with no reasons would look like a bug in the form.
 *
 * The split is not cosmetic. `INCORRECT_PRICING` and `PROHIBITED_ITEM` are properties of a listing;
 * `NO_SHOW` and `HARASSMENT` are things a person did; `FAKE_REVIEW` is only meaningful about a
 * review. Offering all of them everywhere produces a queue that cannot be triaged by reason, which
 * is the one thing `@@index([reason])` exists for.
 *
 * `OTHER` appears on all three and is last everywhere: it is the escape hatch for the case nobody
 * anticipated, and putting it first would make it the default answer to a question the reporter had
 * not finished reading.
 */
export const REPORT_REASONS_BY_TYPE: Readonly<
  Record<ReportType, readonly ReportReason[]>
> = {
  [ReportType.LISTING]: [
    ReportReason.PROHIBITED_ITEM,
    ReportReason.COUNTERFEIT_ITEM,
    ReportReason.UNSAFE_ITEM,
    ReportReason.MISLEADING_DESCRIPTION,
    ReportReason.INCORRECT_PRICING,
    ReportReason.INAPPROPRIATE_CONTENT,
    ReportReason.SCAM_OR_FRAUD,
    ReportReason.SPAM,
    ReportReason.OTHER,
  ],
  [ReportType.USER]: [
    ReportReason.SCAM_OR_FRAUD,
    ReportReason.NO_SHOW,
    ReportReason.ITEM_NOT_RETURNED,
    ReportReason.ITEM_DAMAGED,
    ReportReason.HARASSMENT,
    ReportReason.OFFENSIVE_LANGUAGE,
    ReportReason.SPAM,
    ReportReason.OTHER,
  ],
  [ReportType.REVIEW]: [
    ReportReason.FAKE_REVIEW,
    ReportReason.HARASSMENT,
    ReportReason.OFFENSIVE_LANGUAGE,
    ReportReason.INAPPROPRIATE_CONTENT,
    ReportReason.SPAM,
    ReportReason.OTHER,
  ],
};

/**
 * Whether this reason may be filed against this kind of target.
 *
 * Checked on the server as well as used to build the form. The form is a convenience; this is the
 * boundary, and a reason arriving from a hand-made request is exactly the case the form cannot stop.
 */
export function isReasonValidFor(
  type: ReportType,
  reason: ReportReason
): boolean {
  return REPORT_REASONS_BY_TYPE[type].includes(reason);
}

/**
 * What each reason says, in the words a reporter would use.
 *
 * A total map, so a new `ReportReason` fails to compile rather than rendering as
 * `INAPPROPRIATE_CONTENT` on a public form.
 */
export const REPORT_REASON_LABELS: Readonly<Record<ReportReason, string>> = {
  [ReportReason.SPAM]: "Spam or repeated posting",
  [ReportReason.SCAM_OR_FRAUD]: "Scam or fraud",
  [ReportReason.INAPPROPRIATE_CONTENT]: "Inappropriate content",
  [ReportReason.MISLEADING_DESCRIPTION]: "Description does not match the item",
  [ReportReason.INCORRECT_PRICING]: "Misleading or incorrect pricing",
  [ReportReason.PROHIBITED_ITEM]: "Item is not allowed on SamaanShare",
  [ReportReason.COUNTERFEIT_ITEM]: "Counterfeit or fake item",
  [ReportReason.UNSAFE_ITEM]: "Item is unsafe or faulty",
  [ReportReason.ITEM_DAMAGED]: "Item was returned damaged",
  [ReportReason.ITEM_NOT_RETURNED]: "Item was never returned",
  [ReportReason.HARASSMENT]: "Harassment or threats",
  [ReportReason.NO_SHOW]: "Did not turn up",
  [ReportReason.FAKE_REVIEW]: "Review is fake or not about a real rental",
  [ReportReason.OFFENSIVE_LANGUAGE]: "Offensive language",
  [ReportReason.OTHER]: "Something else",
};

/** What each moderator action does, for the resolution form and the audit trail. */
export const REPORT_ACTION_LABELS: Readonly<Record<ReportAction, string>> = {
  [ReportAction.NONE]: "No action taken",
  [ReportAction.SUSPEND_USER]: "Suspend the account",
  [ReportAction.REMOVE_LISTING]: "Remove the listing",
  [ReportAction.REMOVE_REVIEW]: "Remove the review",
};

/**
 * Which actions a moderator may take when resolving a report of this type.
 *
 * `NONE` is on every list: a report can be legitimate, investigated, and still warrant nothing, and
 * that outcome deserves to be recorded as a decision rather than as a dismissal.
 *
 * `SUSPEND_USER` is on every list too, which is the one worth justifying. The account behind a
 * target is always identifiable - a listing has an owner, a review has an author - and the reports
 * that most need a suspension are precisely the ones filed against a listing or a review rather
 * than against a person in the abstract. Requiring the moderator to re-file the complaint against
 * the user before they could act on it would add a step whose only effect is delay. Which account
 * gets suspended is resolved on the server from the target, never supplied by the client.
 *
 * The removals are each confined to their own type, because `targetId` carries no foreign key and
 * nothing in the database would stop `REMOVE_LISTING` on a review report from matching an unrelated
 * row that happened to share an id.
 */
export const REPORT_ACTIONS_BY_TYPE: Readonly<
  Record<ReportType, readonly ReportAction[]>
> = {
  [ReportType.LISTING]: [
    ReportAction.NONE,
    ReportAction.REMOVE_LISTING,
    ReportAction.SUSPEND_USER,
  ],
  [ReportType.USER]: [ReportAction.NONE, ReportAction.SUSPEND_USER],
  [ReportType.REVIEW]: [
    ReportAction.NONE,
    ReportAction.REMOVE_REVIEW,
    ReportAction.SUSPEND_USER,
  ],
};

/** Whether this action may be taken when resolving a report of this type. */
export function isActionPermittedFor(
  type: ReportType,
  action: ReportAction
): boolean {
  return REPORT_ACTIONS_BY_TYPE[type].includes(action);
}

export type ReportEligibility =
  { allowed: true } | { allowed: false; reason: string };

/**
 * Whether this person may file this report.
 *
 * `subjectUserId` is the account behind the target - the listing's owner, the review's author, or
 * the reported user themselves - resolved on the server. Comparing against the *target* id would
 * miss the real case: reporting your own listing is not reporting yourself by id, but it is still
 * a person filing a complaint against themselves.
 *
 * Refusing outright rather than accepting and hiding it. A self-report that quietly disappeared
 * would leave the reporter believing a complaint was pending, and a moderator can only lose time on
 * a queue that contains them.
 */
export function canFileReport({
  reporterId,
  subjectUserId,
}: {
  reporterId: string;
  subjectUserId: string;
}): ReportEligibility {
  if (reporterId === subjectUserId) {
    return {
      allowed: false,
      reason: "You cannot report your own account or content.",
    };
  }

  return { allowed: true };
}

/**
 * Whether a report is still awaiting a decision.
 *
 * The guard against resolving twice. Resolution applies a real consequence, so a second one is a
 * second suspension or a second removal for a single complaint - and with two moderators working
 * the same queue, that is a race rather than a hypothetical. The write itself is a compare-and-swap
 * on `status`; this is the readable half of that check.
 */
export function isReportOpen(status: ReportStatus): boolean {
  return status === ReportStatus.PENDING;
}

/**
 * How a resolved report reads back to the person who filed it.
 *
 * DELIBERATELY WITHOUT THE ACTION. A reporter learns that their complaint was looked at and closed,
 * never what happened to the other account. "We suspended them" is a moderation decision about a
 * third party, and handing it to whoever complained turns the report form into a way of probing
 * other people's standing - and into a scoreboard worth farming.
 *
 * The distinction it does draw - acted on versus not - is about the reporter's own complaint rather
 * than about anyone else, and without it the notification says nothing at all.
 */
export function reportOutcomeSummary(status: ReportStatus): string | null {
  switch (status) {
    case ReportStatus.RESOLVED:
      return "We reviewed your report and have taken action where it was needed.";
    case ReportStatus.DISMISSED:
      return "We reviewed your report and found nothing that breaks our rules.";
    case ReportStatus.PENDING:
      return null;
  }
}
