import { NotificationType, ReportStatus } from "@/generated/prisma/enums";
import { reportOutcomeSummary } from "@/lib/reports/rules";

import type { NotificationDraft } from "@/lib/notifications/messages";

/**
 * Notification copy for moderation outcomes, as pure data.
 *
 * WHO IS NOT NOTIFIED, AND WHY THAT IS THE DESIGN.
 *
 * Filing a report sends nothing to anybody. Not to the reported account - telling someone they have
 * been reported hands them the warning and the motive to retaliate against whoever could plausibly
 * have filed it, and in a two-party rental that set usually has one member. It is the same argument
 * that withholds a review until its counterpart lands, and it matters more here, because the subject
 * of a report has not yet been found to have done anything.
 *
 * Nor to moderators. A queue that anyone can add rows to is a queue anyone can use to send an admin
 * a hundred notifications; the pending list at `/admin/reports` is the notification, and it cannot
 * be flooded into uselessness.
 *
 * So the only moderation notification is the one to the reporter, once a decision exists.
 */

/** A report that has reached a decision. `PENDING` produces nothing, by construction. */
export interface ReportNotificationInput {
  reportId: string;
  reporterId: string;
  status: ReportStatus;
}

/**
 * Builds the notification a reporter gets when their report is closed.
 *
 * Returns a list, matching `buildBookingNotifications`, so the caller inserts whatever it gets back
 * without a special case - here it is always zero or one row.
 *
 * The body comes from `reportOutcomeSummary`, which is where the rule lives that this never names
 * the action taken. Keeping the copy and that rule in one place is deliberate: a second sentence
 * written here saying "we removed the listing" would defeat it while looking like an improvement.
 */
export function buildReportNotifications({
  reportId,
  reporterId,
  status,
}: ReportNotificationInput): NotificationDraft[] {
  const body = reportOutcomeSummary(status);

  // A report still pending has no outcome to describe. Guarding here rather than at the call site
  // means a future caller that resolves in a different way cannot skip the check.
  if (!body || status === ReportStatus.PENDING) {
    return [];
  }

  return [
    {
      userId: reporterId,
      type: NotificationType.REPORT_RESOLVED,
      title: "Your report has been reviewed",
      body,
      entityType: "report",
      entityId: reportId,
    },
  ];
}
