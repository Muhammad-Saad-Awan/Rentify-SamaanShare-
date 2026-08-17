import { describe, expect, it } from "vitest";

import { NotificationType, ReportStatus } from "@/generated/prisma/enums";
import { buildReportNotifications } from "@/lib/notifications/report-messages";

/**
 * Moderation notification copy.
 *
 * Two properties, and both are about who learns what. Only the reporter is ever told anything, and
 * what they are told never includes the consequence.
 */

const base = { reportId: "report-1", reporterId: "reporter-1" };

describe("buildReportNotifications", () => {
  it("notifies the reporter, and only the reporter", () => {
    const drafts = buildReportNotifications({
      ...base,
      status: ReportStatus.RESOLVED,
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.userId).toBe("reporter-1");
    expect(drafts[0]?.type).toBe(NotificationType.REPORT_RESOLVED);
  });

  /**
   * THE ONE THAT MATTERS.
   *
   * The reported account is never notified - not on filing, not on resolution. Telling someone they
   * have been reported hands them the warning and the motive to retaliate against whoever could
   * plausibly have filed it, and in a two-party rental that set usually has one member.
   */
  it("addresses nobody but the reporter, on either outcome", () => {
    for (const status of [ReportStatus.RESOLVED, ReportStatus.DISMISSED]) {
      const recipients = new Set(
        buildReportNotifications({ ...base, status }).map(
          (draft) => draft.userId
        )
      );

      expect([...recipients]).toEqual(["reporter-1"]);
    }
  });

  /** What happened to the other account is a decision about a third party. */
  it("never names the action taken", () => {
    const copy = [ReportStatus.RESOLVED, ReportStatus.DISMISSED]
      .flatMap((status) => buildReportNotifications({ ...base, status }))
      .flatMap((draft) => [draft.title, draft.body ?? ""])
      .join(" ")
      .toLowerCase();

    for (const leak of ["suspend", "remove", "ban", "deleted", "listing"]) {
      expect(copy).not.toContain(leak);
    }
  });

  it("says nothing at all while a report is still pending", () => {
    expect(
      buildReportNotifications({ ...base, status: ReportStatus.PENDING })
    ).toEqual([]);
  });

  /**
   * The entity id is stored even though nothing links to it yet - see `notificationHref`, which
   * deliberately returns null for reports until a "reports you filed" page exists.
   */
  it("carries the report id for a future link", () => {
    const [draft] = buildReportNotifications({
      ...base,
      status: ReportStatus.DISMISSED,
    });

    expect(draft?.entityType).toBe("report");
    expect(draft?.entityId).toBe("report-1");
  });
});
