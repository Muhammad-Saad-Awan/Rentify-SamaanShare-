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

  it("routes payment events to the side that has to act", () => {
    // The renter arranged it, so the owner is told to confirm.
    expect(
      build({ event: "payment-selected", method: "CASH", amount: 7500 })[0]
    ).toMatchObject({
      userId: parties.ownerId,
      type: NotificationType.PAYMENT_PENDING,
    });

    // The owner confirmed it, so the renter is told to collect.
    expect(
      build({ event: "payment-confirmed", amount: 7500 })[0]
    ).toMatchObject({
      userId: parties.renterId,
      type: NotificationType.PAYMENT_CONFIRMED,
    });
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
   * The load-bearing assertion of this phase.
   *
   * SamaanShare is not in the money path: the deposit goes from renter to owner and back the same
   * way. Copy claiming the platform holds it, protects it, or will return it would be a promise
   * nothing in the system can keep.
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
      { event: "payment-confirmed", amount: 7500 },
      { event: "picked-up" },
      { event: "returned" },
      { event: "review-reminder" },
      { event: "deposit-returned", amount: 10800 },
      { event: "cancelled", by: "renter" },
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

  it("attributes the deposit return to the owner and offers the only real recourse", () => {
    const draft = build({ event: "deposit-returned", amount: 10800 })[0];

    expect(draft?.title).toContain("The owner marked");
    expect(draft?.body).toContain("SamaanShare does not hold the deposit");
  });

  it("attributes payment confirmation to the owner, not to the platform", () => {
    // "Rs." rather than "PKR": that is what `formatPKR` produces, and the amount in a
    // notification has to read the same as the amount on the booking card beside it.
    expect(build({ event: "payment-confirmed", amount: 7500 })[0]?.title).toBe(
      "The owner confirmed receiving Rs. 7,500"
    );
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
