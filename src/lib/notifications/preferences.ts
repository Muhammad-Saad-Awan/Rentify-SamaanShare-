import { NotificationType } from "@/generated/prisma/enums";

import type { NotificationDraft } from "@/lib/notifications/messages";

/**
 * Which notifications a member is allowed to switch off.
 *
 * MOST OF THEM ARE NOT, AND THAT IS THE DESIGN RATHER THAN AN OMISSION.
 * `createNotifications` writes inside the same transaction as the booking change being
 * described, so that a member cannot fail to learn that a request was approved, a payment
 * was confirmed, or a claim was filed against their deposit. Those are guarantees the rest
 * of the system leans on: the notification row is the member's only record of the event,
 * and the platform has no second channel - no email for bookings, no SMS - to fall back
 * on. Turning one off would not reduce noise, it would delete the only copy.
 *
 * So the switch list is the set of notifications that carry no obligation and duplicate
 * something the member can already see:
 *
 *   REVIEW_REMINDER  - a nudge. Nothing happens if it is ignored, and the booking already
 *                      appears in their own dashboard.
 *   REVIEW_RECEIVED  - the notice that a review went public. Informational; the review is
 *                      on the profile either way.
 *
 * Adding a third is a product decision and a migration, which is the right amount of
 * friction. Anything transactional does not belong here at any price.
 */
export const MUTABLE_NOTIFICATION_TYPES = {
  [NotificationType.REVIEW_REMINDER]: "notifyReviewReminders",
  [NotificationType.REVIEW_RECEIVED]: "notifyReviewPublished",
} as const satisfies Partial<Record<NotificationType, string>>;

/** The `User` columns that back the switches above. */
export type NotificationPreferenceKey =
  (typeof MUTABLE_NOTIFICATION_TYPES)[keyof typeof MUTABLE_NOTIFICATION_TYPES];

export type NotificationPreferences = Record<
  NotificationPreferenceKey,
  boolean
>;

/** Everything on, which is the column default and the answer for an unknown recipient. */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  notifyReviewReminders: true,
  notifyReviewPublished: true,
};

/**
 * Whether this member has switched this type off.
 *
 * A type that is not in {@link MUTABLE_NOTIFICATION_TYPES} is never muted, whatever the
 * preferences say. That is the load-bearing line in this file: it means a future column
 * name collision, or a preferences row from some other feature, still cannot suppress a
 * booking notification.
 */
export function isMuted(
  type: NotificationType,
  preferences: NotificationPreferences | undefined
): boolean {
  const key = (
    MUTABLE_NOTIFICATION_TYPES as Partial<
      Record<NotificationType, NotificationPreferenceKey>
    >
  )[type];

  if (key === undefined) {
    return false;
  }

  // An absent preference set means "we could not read them", and the safe answer there is
  // to send. A member who misses a nudge is inconvenienced; one who is silently muted by a
  // failed lookup would never know why the app went quiet.
  return preferences !== undefined && !preferences[key];
}

/**
 * Drops the drafts their recipients have switched off.
 *
 * Pure, and separate from the write, so the rule is testable without a database - the same
 * split `buildBookingNotifications` already uses for the copy. One event commonly notifies
 * both parties with the same type, and they may disagree about wanting it, so the decision
 * is per draft rather than per event.
 */
export function filterByPreferences(
  drafts: readonly NotificationDraft[],
  preferencesByUserId: ReadonlyMap<string, NotificationPreferences>
): NotificationDraft[] {
  return drafts.filter(
    (draft) => !isMuted(draft.type, preferencesByUserId.get(draft.userId))
  );
}

/**
 * Whether any draft in a batch could be muted at all.
 *
 * Lets the writer skip the preference lookup entirely for the overwhelmingly common case -
 * a booking transition, none of whose types are mutable - so the guarantee that
 * notifications are written inside the booking transaction does not start costing an extra
 * query on every status change.
 */
export function needsPreferenceLookup(
  drafts: readonly NotificationDraft[]
): boolean {
  return drafts.some((draft) => draft.type in MUTABLE_NOTIFICATION_TYPES);
}
