import { describe, expect, it } from "vitest";

import { NotificationType } from "@/generated/prisma/enums";
import { buildClaimNotifications } from "@/lib/notifications/claim-messages";

import type { ClaimEvent } from "@/lib/notifications/claim-messages";

/**
 * Damage claim notification copy.
 *
 * Two properties carry the weight. The amount is always stated, because the first thing anyone wants
 * to know about a claim against them is how much. And nothing ever implies SamaanShare holds,
 * transfers or protects the money - the deposit moves between the two people and the platform only
 * ever states what is owed.
 */

const parties = { renterId: "renter-1", ownerId: "owner-1" };

const build = (event: ClaimEvent) =>
  buildClaimNotifications({
    bookingId: "booking-1",
    listingTitle: "Honda EU22i Generator",
    parties,
    event,
  });

const ALL_EVENTS: ClaimEvent[] = [
  { event: "filed", amountClaimed: 15_000 },
  { event: "answered", accepted: true, amountClaimed: 15_000 },
  { event: "answered", accepted: false, amountClaimed: 15_000 },
  { event: "escalated" },
  { event: "withdrawn" },
  { event: "resolved", amountUpheld: 5_000, securityDeposit: 60_000 },
  { event: "resolved", amountUpheld: 0, securityDeposit: 60_000 },
];

describe("who is told", () => {
  /** The owner just filed it; telling them what they did is noise, and noise devalues the badge. */
  it("tells only the renter that a claim was filed", () => {
    const drafts = build({ event: "filed", amountClaimed: 15_000 });

    expect(drafts.map((d) => d.userId)).toEqual(["renter-1"]);
    expect(drafts[0]?.type).toBe(NotificationType.CLAIM_FILED);
  });

  it("tells only the owner that the renter answered", () => {
    expect(
      build({ event: "answered", accepted: true, amountClaimed: 15_000 }).map(
        (d) => d.userId
      )
    ).toEqual(["owner-1"]);
  });

  /** Both, because the renter most needs to know their chance to answer directly has passed. */
  it("tells both parties when a claim escalates", () => {
    expect(build({ event: "escalated" }).map((d) => d.userId)).toEqual([
      "renter-1",
      "owner-1",
    ]);
  });

  /** Only the renter: the owner did it, and it lifts an obligation from the renter alone. */
  it("tells only the renter about a withdrawal", () => {
    expect(build({ event: "withdrawn" }).map((d) => d.userId)).toEqual([
      "renter-1",
    ]);
  });

  /**
   * Both, with the same figures. Telling each side only their own half is how a settled dispute
   * restarts - the two would go on to describe different outcomes to each other.
   */
  it("tells both parties the determination", () => {
    const drafts = build({
      event: "resolved",
      amountUpheld: 5_000,
      securityDeposit: 60_000,
    });

    expect(drafts.map((d) => d.userId)).toEqual(["renter-1", "owner-1"]);

    for (const draft of drafts) {
      expect(draft.body).toContain("5,000");
      expect(draft.body).toContain("55,000");
    }
  });
});

describe("what is said", () => {
  it("states the amount whenever there is one", () => {
    expect(
      build({ event: "filed", amountClaimed: 15_000 })[0]?.title
    ).toContain("15,000");
  });

  it("says plainly when nothing was upheld", () => {
    const drafts = build({
      event: "resolved",
      amountUpheld: 0,
      securityDeposit: 60_000,
    });

    for (const draft of drafts) {
      expect(draft.body?.toLowerCase()).toContain("nothing was upheld");
      expect(draft.body).toContain("60,000");
    }
  });

  /** An escalated claim has decided nothing, and the renter has to be told that explicitly. */
  it("says nothing has been decided when a claim escalates", () => {
    const toRenter = build({ event: "escalated" })[0];

    expect(toRenter?.body?.toLowerCase()).toContain("nothing has been decided");
  });

  /**
   * THE ONE THAT MATTERS. SamaanShare never holds the deposit, cannot release it and cannot
   * compensate anyone. Copy implying otherwise is a promise it cannot keep - the same line every
   * payment string draws.
   */
  it("never implies the platform holds or moves the money", () => {
    const copy = ALL_EVENTS.flatMap(build)
      .flatMap((draft) => [draft.title, draft.body ?? ""])
      .join(" ")
      .toLowerCase();

    for (const claim of [
      "refund",
      "we will pay",
      "reimburse",
      "we are holding",
      "held by samaanshare",
      "protected",
      "guarantee",
      "transferred to",
    ]) {
      expect(copy).not.toContain(claim);
    }
  });

  it("routes each party to their own side of the booking", () => {
    for (const draft of ALL_EVENTS.flatMap(build)) {
      expect(draft.entityType).toBe(
        draft.userId === parties.ownerId ? "booking-request" : "booking"
      );
      expect(draft.entityId).toBe("booking-1");
    }
  });

  it("clips a long listing title", () => {
    const draft = buildClaimNotifications({
      bookingId: "booking-1",
      listingTitle:
        "An extremely long listing title that would otherwise push the meaningful part of this sentence out of sight",
      parties,
      event: { event: "filed", amountClaimed: 1_000 },
    })[0];

    expect(draft?.title).toContain("…");
  });

  it("produces a title and a body for every event", () => {
    for (const draft of ALL_EVENTS.flatMap(build)) {
      expect(draft.title.length).toBeGreaterThan(10);
      expect(draft.body?.length ?? 0).toBeGreaterThan(10);
    }
  });
});
