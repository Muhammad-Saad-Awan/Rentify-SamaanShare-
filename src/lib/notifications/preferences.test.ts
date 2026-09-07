import { describe, expect, it } from "vitest";

import { NotificationType } from "@/generated/prisma/enums";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  filterByPreferences,
  isMuted,
  MUTABLE_NOTIFICATION_TYPES,
  needsPreferenceLookup,
} from "@/lib/notifications/preferences";

import type { NotificationDraft } from "@/lib/notifications/messages";
import type { NotificationPreferences } from "@/lib/notifications/preferences";

/**
 * What a member is allowed to switch off.
 *
 * THE MOST IMPORTANT TEST IN THIS FILE IS THE EXHAUSTIVE ONE at the bottom. Everything the
 * platform sends other than the two review notices is written inside the transaction that
 * moves a booking or settles a deposit, and is the member's only record that it happened -
 * there is no email channel for bookings to fall back on. So the risk is not that a switch
 * fails to mute something; it is that a future change quietly makes a transactional
 * notification mutable, and nobody notices until a renter says they were never told their
 * deposit had been claimed.
 *
 * That test enumerates the whole enum, so adding a type to `MUTABLE_NOTIFICATION_TYPES`
 * fails here and has to be argued for rather than slipped in.
 */

const ALL_ON = DEFAULT_NOTIFICATION_PREFERENCES;

const ALL_OFF: NotificationPreferences = {
  notifyReviewReminders: false,
  notifyReviewPublished: false,
};

/**
 * A draft, reduced to the two fields the preference rules read.
 *
 * The deep-link pair is required by `NotificationDraft` and irrelevant here: muting is
 * decided by recipient and type alone, never by what the notification points at.
 */
function draft(userId: string, type: NotificationType): NotificationDraft {
  return {
    userId,
    type,
    title: "t",
    body: "b",
    entityType: "booking",
    entityId: "b1",
  };
}

describe("isMuted", () => {
  it("mutes a review reminder when that switch is off", () => {
    expect(isMuted(NotificationType.REVIEW_REMINDER, ALL_OFF)).toBe(true);
  });

  it("does not mute it when the switch is on", () => {
    expect(isMuted(NotificationType.REVIEW_REMINDER, ALL_ON)).toBe(false);
  });

  it("reads the two switches independently", () => {
    const remindersOnly: NotificationPreferences = {
      notifyReviewReminders: true,
      notifyReviewPublished: false,
    };

    expect(isMuted(NotificationType.REVIEW_REMINDER, remindersOnly)).toBe(
      false
    );
    expect(isMuted(NotificationType.REVIEW_RECEIVED, remindersOnly)).toBe(true);
  });

  it("sends when preferences could not be read", () => {
    // The safe direction. A member who misses a nudge is mildly inconvenienced; one
    // silently muted by a failed lookup would never learn why the app went quiet.
    expect(isMuted(NotificationType.REVIEW_REMINDER, undefined)).toBe(false);
  });

  it("never mutes a transactional type, whatever the preferences say", () => {
    expect(isMuted(NotificationType.BOOKING_APPROVED, ALL_OFF)).toBe(false);
    expect(isMuted(NotificationType.CLAIM_FILED, ALL_OFF)).toBe(false);
    expect(isMuted(NotificationType.PAYMENT_CONFIRMED, ALL_OFF)).toBe(false);
  });
});

describe("filterByPreferences", () => {
  it("decides per recipient, not per event", () => {
    // One event commonly notifies both parties with the same type, and they may disagree
    // about wanting it - review reminders go to owner and renter together.
    const drafts = [
      draft("owner", NotificationType.REVIEW_REMINDER),
      draft("renter", NotificationType.REVIEW_REMINDER),
    ];

    const kept = filterByPreferences(
      drafts,
      new Map([
        ["owner", ALL_OFF],
        ["renter", ALL_ON],
      ])
    );

    expect(kept).toHaveLength(1);
    expect(kept[0]?.userId).toBe("renter");
  });

  it("keeps transactional drafts for a member who muted everything", () => {
    const drafts = [
      draft("renter", NotificationType.REVIEW_REMINDER),
      draft("renter", NotificationType.BOOKING_APPROVED),
    ];

    const kept = filterByPreferences(drafts, new Map([["renter", ALL_OFF]]));

    expect(kept.map((d) => d.type)).toEqual([
      NotificationType.BOOKING_APPROVED,
    ]);
  });

  it("keeps everything for a recipient with no entry in the map", () => {
    const drafts = [draft("ghost", NotificationType.REVIEW_REMINDER)];

    expect(filterByPreferences(drafts, new Map())).toHaveLength(1);
  });

  it("returns an empty list rather than throwing on an empty batch", () => {
    expect(filterByPreferences([], new Map())).toEqual([]);
  });
});

describe("needsPreferenceLookup", () => {
  it("is false for a booking transition, so no query is made", () => {
    // The common case by a wide margin. Notifications are written inside the booking
    // transaction, and this is what stops that guarantee costing an extra round trip on
    // every status change.
    const drafts = [
      draft("owner", NotificationType.BOOKING_REQUESTED),
      draft("renter", NotificationType.BOOKING_APPROVED),
    ];

    expect(needsPreferenceLookup(drafts)).toBe(false);
  });

  it("is true as soon as one draft could be muted", () => {
    const drafts = [
      draft("owner", NotificationType.BOOKING_COMPLETED),
      draft("renter", NotificationType.REVIEW_REMINDER),
    ];

    expect(needsPreferenceLookup(drafts)).toBe(true);
  });

  it("is false for an empty batch", () => {
    expect(needsPreferenceLookup([])).toBe(false);
  });
});

describe("the set of mutable types", () => {
  /**
   * Every type the platform can send, listed by hand.
   *
   * Deliberately NOT derived from the enum with a filter - that would let a new type join
   * whichever side the filter happened to put it on. Written out, adding a
   * `NotificationType` fails the completeness check below until someone decides which
   * column it belongs in.
   */
  const TRANSACTIONAL: NotificationType[] = [
    NotificationType.BOOKING_REQUESTED,
    NotificationType.BOOKING_APPROVED,
    NotificationType.BOOKING_DECLINED,
    NotificationType.BOOKING_CANCELLED,
    NotificationType.BOOKING_EXPIRED,
    NotificationType.PAYMENT_PENDING,
    NotificationType.PAYMENT_CONFIRMED,
    NotificationType.BOOKING_ACTIVE,
    NotificationType.BOOKING_COMPLETED,
    NotificationType.DEPOSIT_RETURNED,
    NotificationType.REPORT_RESOLVED,
    NotificationType.HANDOVER_DISPUTED,
    NotificationType.CLAIM_FILED,
    NotificationType.CLAIM_RESPONDED,
    NotificationType.CLAIM_RESOLVED,
    NotificationType.BOOKING_INSTRUCTIONS_UPDATED,
  ];

  const ADVISORY: NotificationType[] = [
    NotificationType.REVIEW_REMINDER,
    NotificationType.REVIEW_RECEIVED,
  ];

  it("covers the whole enum between the two lists", () => {
    // Guards the guard: if a type is added to the schema and to neither list here, the
    // exhaustive test below would silently stop covering it.
    expect([...TRANSACTIONAL, ...ADVISORY].sort()).toEqual(
      Object.values(NotificationType).sort()
    );
  });

  it("refuses to mute anything transactional, even with every switch off", () => {
    for (const type of TRANSACTIONAL) {
      expect(isMuted(type, ALL_OFF), `${type} must not be mutable`).toBe(false);
    }
  });

  it("mutes every advisory type when its switch is off", () => {
    for (const type of ADVISORY) {
      expect(isMuted(type, ALL_OFF), `${type} should be mutable`).toBe(true);
    }
  });

  it("lists exactly the advisory types as mutable", () => {
    expect(Object.keys(MUTABLE_NOTIFICATION_TYPES).sort()).toEqual(
      [...ADVISORY].sort()
    );
  });
});
