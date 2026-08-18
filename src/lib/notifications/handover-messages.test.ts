import { describe, expect, it } from "vitest";

import {
  HandoverConfirmation,
  HandoverType,
  NotificationType,
} from "@/generated/prisma/enums";
import { buildHandoverNotifications } from "@/lib/notifications/handover-messages";

/**
 * Handover notification copy.
 *
 * Two properties. Only a disagreement is worth interrupting anyone for, and the copy states a
 * disagreement without stating a consequence - because none follows automatically, and wording that
 * implied one would have people acting on a decision nobody has made.
 */

const parties = { renterId: "renter-1", ownerId: "owner-1" };

const input = (
  overrides: Partial<Parameters<typeof buildHandoverNotifications>[0]> = {}
) =>
  buildHandoverNotifications({
    bookingId: "booking-1",
    listingTitle: "Canon EOS R6 with 24-70mm",
    type: HandoverType.RETURN,
    outcome: HandoverConfirmation.DISPUTED,
    recordedById: parties.ownerId,
    parties,
    ...overrides,
  });

describe("buildHandoverNotifications", () => {
  /**
   * Agreement is the expected path, and a notification for the expected path is noise - which makes
   * the unread badge less trustworthy, the one thing a badge has to be.
   */
  it("says nothing when the other party agrees", () => {
    expect(input({ outcome: HandoverConfirmation.AGREED })).toEqual([]);
  });

  it("says nothing while a record is still unanswered", () => {
    expect(input({ outcome: HandoverConfirmation.PENDING })).toEqual([]);
  });

  it("notifies on a dispute", () => {
    const drafts = input();

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.type).toBe(NotificationType.HANDOVER_DISPUTED);
  });

  /**
   * Addressed to whoever WROTE the record, not to a fixed role. Both transitions are owner-driven
   * today, but a hard-coded owner would silently notify the wrong person the moment a renter can
   * file their own record.
   */
  it("addresses the record's author, whoever that is", () => {
    expect(input({ recordedById: parties.ownerId })[0]?.userId).toBe("owner-1");
    expect(input({ recordedById: parties.renterId })[0]?.userId).toBe(
      "renter-1"
    );
  });

  /** And points at the screen that author actually uses. */
  it("deep-links to the author's own side of the booking", () => {
    expect(input({ recordedById: parties.ownerId })[0]?.entityType).toBe(
      "booking-request"
    );
    expect(input({ recordedById: parties.renterId })[0]?.entityType).toBe(
      "booking"
    );
  });

  it("names which handover was disputed", () => {
    expect(input({ type: HandoverType.PICKUP })[0]?.title).toContain(
      "collection"
    );
    expect(input({ type: HandoverType.RETURN })[0]?.title).toContain("return");
  });

  /**
   * THE ONE THAT MATTERS. A disputed record is a disagreement, not a finding. Nothing follows from
   * it automatically, and copy implying a deposit was at risk would have people acting on a decision
   * nobody has made - the same line every payment string draws.
   */
  it("states no consequence and no verdict", () => {
    const copy = [
      ...input({ type: HandoverType.PICKUP }),
      ...input({ type: HandoverType.RETURN }),
    ]
      .flatMap((draft) => [draft.title, draft.body ?? ""])
      .join(" ")
      .toLowerCase();

    for (const claim of [
      "deposit",
      "charged",
      "forfeit",
      "penalty",
      "refund",
      "liable",
      "at fault",
    ]) {
      expect(copy).not.toContain(claim);
    }
  });

  /** Long titles are clipped in the stored text, not by CSS - the panel is 288px wide. */
  it("clips a long listing title", () => {
    const draft = input({
      listingTitle:
        "An extremely long listing title that would otherwise push the meaningful part of this sentence out of sight entirely",
    })[0];

    expect(draft?.title).toContain("…");
  });
});
