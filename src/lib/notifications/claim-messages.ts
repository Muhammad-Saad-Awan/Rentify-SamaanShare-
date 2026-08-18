import { NotificationType } from "@/generated/prisma/enums";
import { clipTitle } from "@/lib/notifications/messages";
import { formatPKR } from "@/lib/utils/currency";

import type { BookingParties } from "@/lib/notifications/messages";
import type { NotificationDraft } from "@/lib/notifications/messages";

/**
 * Notification copy for damage claims, as pure data.
 *
 * EVERY EVENT NOTIFIES, unlike a handover, where only a disagreement does. There is no "expected
 * path" here that somebody could safely not hear about: a claim is a demand for money, an answer to
 * one changes what the other party can expect back, and a determination settles what the platform
 * says is owed. Missing any of the three costs somebody something.
 *
 * THE AMOUNT IS ALWAYS STATED. A notification saying "a claim was filed against you" without the
 * figure would make opening the app compulsory to learn whether it was for two hundred rupees or the
 * whole deposit - and the first thing anyone wants to know is how much.
 *
 * WHAT THE COPY NEVER SAYS. That SamaanShare holds, protects, refunds or will pay anything. The
 * deposit moves between the two people and the platform only states what is owed - the same line
 * every payment string draws. An upheld claim says the owner "may keep", never that we transferred.
 */

export type ClaimEvent =
  | { event: "filed"; amountClaimed: number }
  | { event: "answered"; accepted: boolean; amountClaimed: number }
  | { event: "escalated" }
  | { event: "withdrawn" }
  | { event: "resolved"; amountUpheld: number; securityDeposit: number };

export interface ClaimNotificationInput {
  bookingId: string;
  listingTitle: string;
  parties: BookingParties;
  event: ClaimEvent;
}

/**
 * Builds every notification a claim event produces.
 *
 * Returns drafts in a stable order - renter first where both are notified - matching
 * `buildBookingNotifications`, so a bulk insert is deterministic and tests can assert on positions.
 */
export function buildClaimNotifications({
  bookingId,
  listingTitle,
  parties,
  event,
}: ClaimNotificationInput): NotificationDraft[] {
  const item = clipTitle(listingTitle);

  /** The renter is the respondent: a claim is always against them, so their screen is `booking`. */
  const toRenter = (
    type: NotificationType,
    title: string,
    body: string | null = null
  ): NotificationDraft => ({
    userId: parties.renterId,
    type,
    title,
    body,
    entityType: "booking",
    entityId: bookingId,
  });

  /** The owner is the claimant, and their side of a booking lives on the requests screen. */
  const toOwner = (
    type: NotificationType,
    title: string,
    body: string | null = null
  ): NotificationDraft => ({
    userId: parties.ownerId,
    type,
    title,
    body,
    entityType: "booking-request",
    entityId: bookingId,
  });

  switch (event.event) {
    /**
     * Only the renter. The owner just filed it and does not need telling what they did - the same
     * rule that keeps an actor's own clicks out of their own feed everywhere else here.
     */
    case "filed":
      return [
        toRenter(
          NotificationType.CLAIM_FILED,
          `The owner has claimed ${formatPKR(event.amountClaimed)} of your deposit for ${item}`,
          "Read what they have said and reply. If you do not, it goes to SamaanShare to decide."
        ),
      ];

    case "answered":
      return [
        toOwner(
          NotificationType.CLAIM_RESPONDED,
          event.accepted
            ? `The renter accepted your ${formatPKR(event.amountClaimed)} claim for ${item}`
            : `The renter disputed your claim for ${item}`,
          event.accepted
            ? "You may keep that amount from the deposit and should return the rest."
            : "They have given their own account. SamaanShare will decide."
        ),
      ];

    /**
     * Both sides, and the renter's copy is the point.
     *
     * They are the one who let the window pass, and they are the one who most needs to know that
     * their chance to answer directly has gone - while being told plainly that nothing has been
     * decided against them.
     */
    case "escalated":
      return [
        toRenter(
          NotificationType.CLAIM_RESPONDED,
          `The claim on your deposit for ${item} has gone to SamaanShare`,
          "The time to reply has passed, so we will decide on what has been recorded. Nothing has been decided yet."
        ),
        toOwner(
          NotificationType.CLAIM_RESPONDED,
          `Your claim for ${item} has gone to SamaanShare`,
          "The renter did not reply in time, so we will decide on what has been recorded."
        ),
      ];

    /** Only the renter: the owner withdrew it, and it lifts an obligation from the renter alone. */
    case "withdrawn":
      return [
        toRenter(
          NotificationType.CLAIM_RESOLVED,
          `The owner withdrew their claim on your deposit for ${item}`,
          "The full deposit is owed back to you."
        ),
      ];

    /**
     * Both sides, with the same two figures in each.
     *
     * A determination that told each party only their own half would leave them describing different
     * outcomes to each other, which is how a settled dispute restarts.
     */
    case "resolved": {
      const owed = Math.max(0, event.securityDeposit - event.amountUpheld);

      return [
        toRenter(
          NotificationType.CLAIM_RESOLVED,
          `SamaanShare has decided the claim on your deposit for ${item}`,
          event.amountUpheld > 0
            ? `The owner may keep ${formatPKR(event.amountUpheld)}. ${formatPKR(owed)} is owed back to you.`
            : `Nothing was upheld. The full ${formatPKR(owed)} is owed back to you.`
        ),
        toOwner(
          NotificationType.CLAIM_RESOLVED,
          `SamaanShare has decided your claim for ${item}`,
          event.amountUpheld > 0
            ? `You may keep ${formatPKR(event.amountUpheld)} and should return ${formatPKR(owed)} to the renter.`
            : `Nothing was upheld. The full ${formatPKR(owed)} should be returned to the renter.`
        ),
      ];
    }
  }
}
