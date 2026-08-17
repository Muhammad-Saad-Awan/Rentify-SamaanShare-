import { describe, expect, it } from "vitest";

import {
  ReportAction,
  ReportReason,
  ReportStatus,
  ReportType,
} from "@/generated/prisma/enums";
import {
  canFileReport,
  isActionPermittedFor,
  isReasonValidFor,
  isReportOpen,
  REPORT_ACTION_LABELS,
  REPORT_REASONS_BY_TYPE,
  REPORT_REASON_LABELS,
  reportOutcomeSummary,
} from "@/lib/reports/rules";

/**
 * Reporting and moderation rules.
 *
 * The load-bearing assertions are the two fit checks - a reason must suit its target, an action must
 * suit the report it resolves - and the confidentiality of the outcome. `Report.targetId` carries no
 * foreign key, so an action applied to the wrong kind of target is not something the database will
 * catch; it is caught here or not at all.
 */

const ALL_TYPES = Object.values(ReportType);
const ALL_REASONS = Object.values(ReportReason);
const ALL_ACTIONS = Object.values(ReportAction);

describe("REPORT_REASONS_BY_TYPE", () => {
  it("offers reasons for every target type", () => {
    for (const type of ALL_TYPES) {
      expect(REPORT_REASONS_BY_TYPE[type].length).toBeGreaterThan(0);
    }
  });

  /**
   * A reason no form can reach is a value in the enum, an index entry, and a triage category that
   * can never be filed - dead weight that reads as a feature.
   */
  it("leaves no reason unreachable from every type", () => {
    for (const reason of ALL_REASONS) {
      const reachable = ALL_TYPES.some((type) =>
        isReasonValidFor(type, reason)
      );

      expect(reachable, `${reason} is offered nowhere`).toBe(true);
    }
  });

  it("keeps listing-only reasons off people and reviews", () => {
    for (const reason of [
      ReportReason.INCORRECT_PRICING,
      ReportReason.PROHIBITED_ITEM,
      ReportReason.COUNTERFEIT_ITEM,
      ReportReason.UNSAFE_ITEM,
      ReportReason.MISLEADING_DESCRIPTION,
    ]) {
      expect(isReasonValidFor(ReportType.LISTING, reason)).toBe(true);
      expect(isReasonValidFor(ReportType.USER, reason)).toBe(false);
      expect(isReasonValidFor(ReportType.REVIEW, reason)).toBe(false);
    }
  });

  it("keeps conduct reasons off listings", () => {
    for (const reason of [
      ReportReason.NO_SHOW,
      ReportReason.ITEM_NOT_RETURNED,
      ReportReason.ITEM_DAMAGED,
    ]) {
      expect(isReasonValidFor(ReportType.USER, reason)).toBe(true);
      expect(isReasonValidFor(ReportType.LISTING, reason)).toBe(false);
    }
  });

  it("offers FAKE_REVIEW only about a review", () => {
    expect(isReasonValidFor(ReportType.REVIEW, ReportReason.FAKE_REVIEW)).toBe(
      true
    );
    expect(isReasonValidFor(ReportType.USER, ReportReason.FAKE_REVIEW)).toBe(
      false
    );
    expect(isReasonValidFor(ReportType.LISTING, ReportReason.FAKE_REVIEW)).toBe(
      false
    );
  });

  it("offers OTHER everywhere, and last", () => {
    for (const type of ALL_TYPES) {
      const reasons = REPORT_REASONS_BY_TYPE[type];

      expect(reasons.at(-1)).toBe(ReportReason.OTHER);
    }
  });

  /** A duplicated reason would render the same option twice on one form. */
  it("lists each reason at most once per type", () => {
    for (const type of ALL_TYPES) {
      const reasons = REPORT_REASONS_BY_TYPE[type];

      expect(new Set(reasons).size).toBe(reasons.length);
    }
  });

  it("labels every reason", () => {
    for (const reason of ALL_REASONS) {
      expect(REPORT_REASON_LABELS[reason]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("REPORT_ACTIONS_BY_TYPE", () => {
  /**
   * THE ONE THAT MATTERS. `targetId` is polymorphic with no foreign key, so `REMOVE_LISTING` on a
   * review report would run against whatever row shares that id - the database has no opinion.
   */
  it("confines each removal to the type it can actually act on", () => {
    expect(
      isActionPermittedFor(ReportType.LISTING, ReportAction.REMOVE_LISTING)
    ).toBe(true);
    expect(
      isActionPermittedFor(ReportType.REVIEW, ReportAction.REMOVE_LISTING)
    ).toBe(false);
    expect(
      isActionPermittedFor(ReportType.USER, ReportAction.REMOVE_LISTING)
    ).toBe(false);

    expect(
      isActionPermittedFor(ReportType.REVIEW, ReportAction.REMOVE_REVIEW)
    ).toBe(true);
    expect(
      isActionPermittedFor(ReportType.LISTING, ReportAction.REMOVE_REVIEW)
    ).toBe(false);
    expect(
      isActionPermittedFor(ReportType.USER, ReportAction.REMOVE_REVIEW)
    ).toBe(false);
  });

  /**
   * Every target resolves to an account, and the reports most likely to warrant a suspension are
   * filed against a listing or a review rather than against a person in the abstract.
   */
  it("permits suspension from any report type", () => {
    for (const type of ALL_TYPES) {
      expect(isActionPermittedFor(type, ReportAction.SUSPEND_USER)).toBe(true);
    }
  });

  /** Investigated and warranting nothing is a decision, and has to be recordable as one. */
  it("permits NONE everywhere", () => {
    for (const type of ALL_TYPES) {
      expect(isActionPermittedFor(type, ReportAction.NONE)).toBe(true);
    }
  });

  it("labels every action", () => {
    for (const action of ALL_ACTIONS) {
      expect(REPORT_ACTION_LABELS[action]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("canFileReport", () => {
  it("refuses a report against yourself", () => {
    const result = canFileReport({
      reporterId: "user-1",
      subjectUserId: "user-1",
    });

    expect(result.allowed).toBe(false);
  });

  /**
   * The subject is the account *behind* the target, not the target id. Reporting your own listing
   * is not reporting yourself by id, and comparing ids would let it through.
   */
  it("allows a report against someone else", () => {
    expect(
      canFileReport({ reporterId: "user-1", subjectUserId: "user-2" }).allowed
    ).toBe(true);
  });
});

describe("isReportOpen", () => {
  it("is open only while pending", () => {
    expect(isReportOpen(ReportStatus.PENDING)).toBe(true);
    expect(isReportOpen(ReportStatus.RESOLVED)).toBe(false);
    expect(isReportOpen(ReportStatus.DISMISSED)).toBe(false);
  });
});

describe("reportOutcomeSummary", () => {
  /**
   * THE CONFIDENTIALITY ASSERTION.
   *
   * What happened to the reported account is a decision about a third party. Telling whoever
   * complained would turn the report form into a way of probing other people's standing.
   */
  it("never names the action taken", () => {
    const copy = [
      reportOutcomeSummary(ReportStatus.RESOLVED),
      reportOutcomeSummary(ReportStatus.DISMISSED),
    ].join(" ");

    for (const leak of ["suspend", "remove", "ban", "deleted"]) {
      expect(copy.toLowerCase()).not.toContain(leak);
    }
  });

  it("still distinguishes acted-on from not, which is about the reporter's own complaint", () => {
    expect(reportOutcomeSummary(ReportStatus.RESOLVED)).not.toBe(
      reportOutcomeSummary(ReportStatus.DISMISSED)
    );
  });

  it("says nothing about a report still pending", () => {
    expect(reportOutcomeSummary(ReportStatus.PENDING)).toBeNull();
  });
});
