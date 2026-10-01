import { describe, expect, it } from "vitest";

import { NotificationType } from "@/generated/prisma/enums";
import {
  buildBookingNotifications,
  clipTitle,
  notificationHref,
  paymentMethodLabel,
  TITLE_ITEM_MAX,
} from "@/lib/notifications/messages";

import type { BookingNotificationEvent } from "@/lib/notifications/messages";

/**
 * Notification copy.
 *
 * Two properties are worth pinning. First, addressing: a notification must reach the party who
 * needs to act and must not reach the one who just clicked - a badge that lights up for your own
 * action is a badge nobody trusts. Second, the money wording: payment is offline, so no string
 * may imply SamaanShare holds a deposit or can return one. Both are the kind of thing that drifts
 * silently during a copy edit, which is exactly why they are asserted rather than reviewed.
 */

const parties = { renterId: "renter-1", ownerId: "owner-1" };

const base = {
  bookingId: "booking-1",
  listingTitle: "Canon EOS R6 with 24-105mm lens",
  parties,
};

const build = (event: BookingNotificationEvent) =>
  buildBookingNotifications({ ...base, ...event });

describe("clipTitle", () => {
  it("leaves a short title untouched", () => {
    expect(clipTitle("Canon EOS R6")).toBe("Canon EOS R6");
  });

  it("clips a long title to the limit", () => {
    const clipped = clipTitle("a".repeat(80));

    expect(clipped.length).toBeLessThanOrEqual(TITLE_ITEM_MAX);
    expect(clipped.endsWith("…")).toBe(true);
  });

  it("prefers a word boundary when one is late enough in the string", () => {
    expect(clipTitle("Canon EOS R6 with 24-105mm lens and bag", 30)).toBe(
      "Canon EOS R6 with 24-105mm…"
    );
  });

  it("does not clip to a stub when the only space is early", () => {
    // A word boundary at position 2 would leave "A…", which says nothing. The hard cut is better.
    const clipped = clipTitle(`A ${"b".repeat(60)}`, 20);

    expect(clipped.startsWith("A b")).toBe(true);
  });

  it("trims before measuring", () => {
    expect(clipTitle("   Canon EOS R6   ")).toBe("Canon EOS R6");
  });
});

describe("buildBookingNotifications addressing", () => {
  it("tells the owner about a new request, and not the renter", () => {
    const drafts = build({
      event: "requested",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-09-05T00:00:00.000Z"),
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      userId: parties.ownerId,
      type: NotificationType.BOOKING_REQUESTED,
      entityType: "booking-request",
      entityId: "booking-1",
    });
  });

  it("tells the renter about the owner's decisions", () => {
    for (const event of [
      { event: "approved" } as const,
      { event: "declined" } as const,
      { event: "picked-up" } as const,
      { event: "returned" } as const,
    ]) {
      const drafts = build(event);

      expect(drafts).toHaveLength(1);
      expect(drafts[0]?.userId).toBe(parties.renterId);
      expect(drafts[0]?.entityType).toBe("booking");
    }
  });

  it("tells both sides when a request expires", () => {
    const drafts = build({ event: "expired" });

    expect(drafts.map((draft) => draft.userId)).toEqual([
      parties.renterId,
      parties.ownerId,
    ]);
    // Same type for both, different copy - the owner's names the lost booking.
    expect(new Set(drafts.map((draft) => draft.type))).toEqual(
      new Set([NotificationType.BOOKING_EXPIRED])
    );
  });

  it("prompts both sides for a review", () => {
    const drafts = build({ event: "review-reminder" });

    expect(drafts.map((draft) => draft.userId)).toEqual([
      parties.renterId,
      parties.ownerId,
    ]);
  });

  /** The actor must not be notified about their own click. */
  it("notifies only the counterparty on a cancellation", () => {
    expect(build({ event: "cancelled", by: "renter" })[0]?.userId).toBe(
      parties.ownerId
    );
    expect(build({ event: "cancelled", by: "owner" })[0]?.userId).toBe(
      parties.renterId
    );
  });

  /**
   * Only one payment event is left here.
   *
   * Confirmation moved to `payment-messages.ts` when the platform started receiving the money:
   * an administrator confirms it now, both parties are told, and the copy says "we". What
   * remains in this module is the renter choosing a method, which is still a booking event.
   */
  it("tells the owner when the renter has chosen how to pay", () => {
    expect(
      build({
        event: "payment-selected",
        method: "BANK_TRANSFER",
        amount: 7500,
      })[0]
    ).toMatchObject({
      userId: parties.ownerId,
      type: NotificationType.PAYMENT_PENDING,
    });
  });

  /**
   * Pickup details are the only channel between the two parties in this phase, so a change to
   * them has to reach the renter - who may already have travelled on the old address. The owner
   * made the edit, so they are not told about it.
   */
  it("tells only the renter when the owner edits the pickup details", () => {
    const drafts = build({ event: "instructions-updated" });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      userId: parties.renterId,
      type: NotificationType.BOOKING_INSTRUCTIONS_UPDATED,
      entityType: "booking",
    });
  });

  it("does not repeat the new instructions in the notification body", () => {
    // They can run to a thousand characters; the booking is where they live.
    const body = build({ event: "instructions-updated" })[0]?.body ?? "";

    expect(body.length).toBeLessThan(120);
    expect(body).toContain("Check your booking");
  });

  /**
   * Release notifies both sides, because release is mutual.
   *
   * Critically this fires on RELEASE, not on submission: telling someone a review exists the moment
   * it is written hands them the one fact reciprocal withholding exists to withhold.
   */
  it("tells both parties when reviews are published", () => {
    const drafts = build({ event: "reviews-published" });

    expect(drafts.map((draft) => draft.userId)).toEqual([
      parties.renterId,
      parties.ownerId,
    ]);
    expect(new Set(drafts.map((draft) => draft.type))).toEqual(
      new Set([NotificationType.REVIEW_RECEIVED])
    );
  });

  it("does not leak the rating into the release notification", () => {
    // A rating delivered as a notification line is both a spoiler and a worse way to receive bad
    // news than reading it in context.
    const text = build({ event: "reviews-published" })
      .flatMap((draft) => [draft.title, draft.body ?? ""])
      .join(" ");

    expect(text).not.toMatch(/[1-5]\s*(star|out of)/i);
    expect(text).not.toMatch(/[1-5]\/5/);
  });

  it("clips the listing title in every title it produces", () => {
    const drafts = buildBookingNotifications({
      ...base,
      listingTitle: "X".repeat(200),
      event: "approved",
    });

    expect(drafts[0]?.title.length).toBeLessThan(80);
  });
});

describe("buildBookingNotifications money wording", () => {
  /**
   * Still load-bearing, for a narrower reason than when it was written.
   *
   * The platform IS in the money path now - it receives the rental and the deposit and returns
   * what is left. But that is the custodial flow's story, and its copy lives in
   * `payment-messages.ts`, which says "we" deliberately. These are the booking LIFECYCLE events:
   * a request, an approval, a handover, a review reminder. None of them is about money, and a
   * promise about custody appearing in one would be a promise made in the wrong place, by a
   * module with no idea whether it is true.
   */
  it("never claims the platform holds or protects the deposit", () => {
    const everyEvent: BookingNotificationEvent[] = [
      {
        event: "requested",
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        endDate: new Date("2026-09-05T00:00:00.000Z"),
      },
      { event: "approved" },
      { event: "declined" },
      { event: "expired" },
      { event: "payment-selected", method: "BANK_TRANSFER", amount: 7500 },
      { event: "picked-up" },
      { event: "returned" },
      { event: "review-reminder" },
      { event: "cancelled", by: "renter" },
      { event: "instructions-updated" },
      { event: "reviews-published" },
    ];

    const text = everyEvent
      .flatMap(build)
      .flatMap((draft) => [draft.title, draft.body ?? ""])
      .join(" ")
      .toLowerCase();

    for (const forbidden of [
      "we hold",
      "held by samaanshare",
      "samaanshare holds",
      "protected by",
      "escrow",
      "insured",
      "guaranteed",
      "we will refund",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("falls back to a plain sentence when a decline carries no reason", () => {
    expect(build({ event: "declined", reason: "   " })[0]?.body).toBe(
      "Those dates are free again for other renters."
    );
  });

  it("passes a real decline reason through", () => {
    expect(
      build({ event: "declined", reason: "Away that week" })[0]?.body
    ).toBe("Away that week");
  });
});

describe("paymentMethodLabel", () => {
  it("uses the words a renter would recognise", () => {
    expect(paymentMethodLabel("CASH")).toBe("cash");
    expect(paymentMethodLabel("BANK_TRANSFER")).toBe("bank transfer");
    expect(paymentMethodLabel("JAZZCASH_WALLET")).toBe("JazzCash");
  });
});

describe("notificationHref", () => {
  it("sends each side to its own dashboard", () => {
    expect(notificationHref("booking", "b1")).toBe("/dashboard/bookings");
    expect(notificationHref("booking-request", "b1")).toBe(
      "/dashboard/requests"
    );
  });

  it("has no target without an entity id", () => {
    expect(notificationHref("booking", null)).toBeNull();
  });

  it("has no target for an unrecognised entity type", () => {
    // Notifications outlive the rows they point at, and future types will arrive before this
    // mapping knows them. An unknown type renders as plain text rather than a link to nowhere.
    expect(notificationHref("listing", "l1")).toBeNull();
    expect(notificationHref(null, "x1")).toBeNull();
  });
});
