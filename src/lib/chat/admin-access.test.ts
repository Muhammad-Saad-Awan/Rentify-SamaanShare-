import { describe, expect, it } from "vitest";

import {
  ClaimStatus,
  HandoverConfirmation,
  ReportStatus,
  ReportType,
} from "@/generated/prisma/enums";
import {
  adminConversationGrounds,
  describeAdminViewGround,
  findAdminViewGround,
} from "@/lib/chat/admin-access";

/**
 * Administrator access to conversations.
 *
 * The load-bearing assertion is the empty case: with no claim, no dispute and no qualifying report
 * between these two people, an administrator has no grounds at all.
 */

const parties = { renterId: "renter", ownerId: "owner" };
const none = { claims: [], handovers: [], reports: [] };

function report(
  overrides: Partial<{
    type: ReportType;
    status: ReportStatus;
    reporterId: string;
    targetId: string;
  }> = {}
) {
  return {
    id: "report",
    type: ReportType.USER,
    status: ReportStatus.PENDING,
    reporterId: "renter",
    targetId: "owner",
    ...overrides,
  };
}

describe("adminConversationGrounds", () => {
  it("grants nothing by default - being an administrator is not a ground", () => {
    expect(adminConversationGrounds({ ...parties, ...none })).toEqual([]);
  });

  it.each(Object.values(ClaimStatus))(
    "treats a %s claim as a ground about its respondent",
    (status) => {
      expect(
        adminConversationGrounds({
          ...parties,
          ...none,
          claims: [{ id: "claim", status, respondentId: "renter" }],
        })
      ).toEqual([{ kind: "claim", id: "claim", subjectId: "renter" }]);
    }
  );

  it("treats only a DISPUTED handover as a ground", () => {
    const grounds = adminConversationGrounds({
      ...parties,
      ...none,
      handovers: [
        {
          id: "agreed",
          confirmation: HandoverConfirmation.AGREED,
          recordedById: "owner",
        },
        {
          id: "pending",
          confirmation: HandoverConfirmation.PENDING,
          recordedById: "owner",
        },
        {
          id: "disputed",
          confirmation: HandoverConfirmation.DISPUTED,
          recordedById: "owner",
        },
      ],
    });

    expect(grounds).toEqual([
      { kind: "dispute", id: "disputed", subjectId: "owner" },
    ]);
  });

  it("accepts a USER report between the two participants, in either direction", () => {
    expect(
      adminConversationGrounds({ ...parties, ...none, reports: [report()] })
    ).toEqual([{ kind: "report", id: "report", subjectId: "owner" }]);
    expect(
      adminConversationGrounds({
        ...parties,
        ...none,
        reports: [report({ reporterId: "owner", targetId: "renter" })],
      })
    ).toEqual([{ kind: "report", id: "report", subjectId: "renter" }]);
  });

  it("accepts a resolved report but not a dismissed one", () => {
    expect(
      adminConversationGrounds({
        ...parties,
        ...none,
        reports: [report({ status: ReportStatus.RESOLVED })],
      })
    ).toHaveLength(1);
    expect(
      adminConversationGrounds({
        ...parties,
        ...none,
        reports: [report({ status: ReportStatus.DISMISSED })],
      })
    ).toEqual([]);
  });

  it("ignores reports involving a third party, and non-USER reports", () => {
    expect(
      adminConversationGrounds({
        ...parties,
        ...none,
        reports: [
          report({ reporterId: "stranger" }),
          report({ targetId: "stranger" }),
          report({ type: ReportType.LISTING }),
          report({ reporterId: "owner", targetId: "owner" }),
        ],
      })
    ).toEqual([]);
  });
});

describe("findAdminViewGround", () => {
  const grounds = [
    { kind: "claim" as const, id: "claim", subjectId: "renter" },
  ];

  it("returns the named ground when it is real", () => {
    expect(findAdminViewGround(grounds, { kind: "claim", id: "claim" })).toBe(
      grounds[0]
    );
  });

  it("refuses a ground that is not in the list, or of the wrong kind", () => {
    expect(
      findAdminViewGround(grounds, { kind: "claim", id: "other" })
    ).toBeNull();
    expect(
      findAdminViewGround(grounds, { kind: "report", id: "claim" })
    ).toBeNull();
  });

  it("records the ground in a stable form", () => {
    expect(describeAdminViewGround(grounds[0]!)).toBe("claim:claim");
  });
});
