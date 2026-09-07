import { buildBookingNotifications } from "@/lib/notifications/messages";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  filterByPreferences,
  needsPreferenceLookup,
} from "@/lib/notifications/preferences";

import type { Prisma } from "@/generated/prisma/client";
import type {
  BookingNotificationInput,
  NotificationDraft,
} from "@/lib/notifications/messages";
import type { NotificationPreferences } from "@/lib/notifications/preferences";

/**
 * Writing notifications.
 *
 * WHY THIS TAKES A TRANSACTION CLIENT. Every Phase 4 notification describes a status change,
 * and the two must succeed or fail together. Written afterwards, outside the transaction, a
 * booking could move to ACTIVE while the renter is never told - and nothing would ever detect
 * it, because there is no reconciliation pass and no queue to retry from. Written inside, the
 * failure mode is a rolled-back transition, which the caller already reports.
 *
 * The counter-argument is that a notification is not important enough to fail a booking over.
 * That would hold for an external channel - an SMS or an email, where the provider is a
 * separate system that can be down on its own. This is an insert into the same Postgres
 * transaction that is already writing the booking; if it fails, the booking write was going to
 * fail too.
 */

/**
 * The subset of the client this needs.
 *
 * Declared structurally so both `prisma` and a `$transaction` callback's `tx` satisfy it. The
 * transaction client is deliberately the *documented* parameter type; accepting the full client
 * as well only exists for the expiry sweep, which batches its writes differently.
 *
 * `user` is here for the preference lookup below, and only for that. It is read, never
 * written - see `readPreferences`.
 */
export type NotificationWriter = Pick<
  Prisma.TransactionClient,
  "notification" | "user"
>;

/**
 * Inserts pre-built drafts.
 *
 * `createMany` rather than a loop: an event that notifies both parties is two rows, and two
 * round trips inside a transaction hold locks for twice as long for no benefit.
 */
export async function createNotifications(
  client: NotificationWriter,
  drafts: NotificationDraft[]
): Promise<number> {
  if (drafts.length === 0) {
    return 0;
  }

  /**
   * The preference lookup is SKIPPED unless a draft could actually be muted.
   *
   * Almost every batch is a booking transition, and none of those types are mutable - see
   * `MUTABLE_NOTIFICATION_TYPES` for why so few are. Checking first means the guarantee
   * that notifications are written inside the booking transaction does not start costing
   * an extra query, and an extra round trip inside a transaction, on every status change.
   */
  const sendable = needsPreferenceLookup(drafts)
    ? filterByPreferences(drafts, await readPreferences(client, drafts))
    : drafts;

  if (sendable.length === 0) {
    return 0;
  }

  const result = await client.notification.createMany({ data: sendable });

  return result.count;
}

/**
 * Reads the notification preferences of everyone a batch would notify.
 *
 * One query for the whole batch, keyed by the distinct recipients rather than one lookup
 * per draft - an event that notifies both parties would otherwise be two round trips
 * inside a transaction that is already holding locks.
 *
 * A recipient missing from the result keeps the defaults, which are all-on. That case
 * should not arise (a draft's `userId` came from the booking being written), and the safe
 * direction if it ever does is to send.
 */
async function readPreferences(
  client: NotificationWriter,
  drafts: readonly NotificationDraft[]
): Promise<Map<string, NotificationPreferences>> {
  const userIds = [...new Set(drafts.map((draft) => draft.userId))];

  const rows = await client.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      notifyReviewReminders: true,
      notifyReviewPublished: true,
    },
  });

  const byUserId = new Map<string, NotificationPreferences>(
    userIds.map((id) => [id, DEFAULT_NOTIFICATION_PREFERENCES])
  );

  for (const row of rows) {
    byUserId.set(row.id, {
      notifyReviewReminders: row.notifyReviewReminders,
      notifyReviewPublished: row.notifyReviewPublished,
    });
  }

  return byUserId;
}

/**
 * Builds and writes the notifications for one booking event.
 *
 * The call site every action uses. Keeping the build and the insert together here means an
 * action never touches copy, and a new event is one case in `buildBookingNotifications` rather
 * than a new query.
 */
export async function emitBookingNotifications(
  client: NotificationWriter,
  input: BookingNotificationInput
): Promise<number> {
  return createNotifications(client, buildBookingNotifications(input));
}
