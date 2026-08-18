import {
  HandoverConfirmation,
  HandoverType,
  NotificationType,
} from "@/generated/prisma/enums";
import { clipTitle } from "@/lib/notifications/messages";

import type { NotificationDraft } from "@/lib/notifications/messages";
import type { BookingParties } from "@/lib/notifications/messages";

/**
 * Notification copy for handover outcomes, as pure data.
 *
 * ONLY A DISAGREEMENT NOTIFIES. Agreement is the expected path, and a notification for the expected
 * path is noise - which makes the unread badge less trustworthy, the one thing a badge has to be.
 * The same reasoning keeps the actor's own clicks out of their own feed everywhere else here.
 *
 * A dispute is different in kind: it is one party formally contesting a written account of the
 * other's conduct, and the person who wrote that account needs to know while the item is still in
 * front of them and a photograph is still possible.
 *
 * THE COPY CARRIES NO VERDICT AND NO CONSEQUENCE. A disputed record is a disagreement, not a finding,
 * and nothing follows from it automatically. Wording that implied a deposit was at risk would have
 * people acting on a decision nobody has made - the same line every payment string draws about
 * SamaanShare not holding the money.
 */

export interface HandoverNotificationInput {
  bookingId: string;
  listingTitle: string;
  type: HandoverType;
  outcome: HandoverConfirmation;
  /** Who wrote the record being answered. The notification is addressed to them. */
  recordedById: string;
  parties: BookingParties;
}

/**
 * Builds the notification a handover answer produces.
 *
 * Returns a list, matching `buildBookingNotifications`, so the caller inserts whatever it gets back
 * without a special case - here always zero or one row.
 */
export function buildHandoverNotifications({
  bookingId,
  listingTitle,
  type,
  outcome,
  recordedById,
  parties,
}: HandoverNotificationInput): NotificationDraft[] {
  if (outcome !== HandoverConfirmation.DISPUTED) {
    return [];
  }

  const item = clipTitle(listingTitle);
  const moment = type === HandoverType.PICKUP ? "collection" : "return";

  /**
   * Addressed to the record's author, and pointed at the screen they own.
   *
   * Derived from `recordedById` rather than assuming the owner: both transitions are owner-driven
   * today, but the lifecycle may later let a renter file their own record, and a hard-coded role
   * would then notify the wrong person about their own dispute.
   */
  const isOwner = recordedById === parties.ownerId;

  return [
    {
      userId: recordedById,
      type: NotificationType.HANDOVER_DISPUTED,
      title: `Your ${moment} record for ${item} was disputed`,
      body: "The other party has added their own account of the item's condition. Both are saved on the booking.",
      entityType: isOwner ? "booking-request" : "booking",
      entityId: bookingId,
    },
  ];
}
