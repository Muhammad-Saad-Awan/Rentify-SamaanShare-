import { buildBookingNotifications } from "@/lib/notifications/messages";

import type { Prisma } from "@/generated/prisma/client";
import type {
  BookingNotificationInput,
  NotificationDraft,
} from "@/lib/notifications/messages";

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
 */
export type NotificationWriter = Pick<Prisma.TransactionClient, "notification">;

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

  const result = await client.notification.createMany({ data: drafts });

  return result.count;
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
