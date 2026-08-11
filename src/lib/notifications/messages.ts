import { NotificationType } from "@/generated/prisma/enums";
import { formatPKR } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";

import type { PaymentMethod } from "@/generated/prisma/enums";

/**
 * Notification copy for every booking event, as pure data.
 *
 * WHY A PURE MODULE. The wording of a notification is the only record either party gets of
 * what happened to their booking, and it is written inside the same transaction as the status
 * change - so a mistake here is a mistake in an audit trail, not just a cosmetic one. Keeping
 * the copy separate from the write means it is unit-testable without a database, which is the
 * same line every other pure module in this codebase draws.
 *
 * ONE EVENT CAN PRODUCE TWO ROWS. A notification row belongs to exactly one recipient, but
 * some events concern both sides - an expired request wastes the renter's wait *and* the
 * owner's business. So the builder returns a list rather than a single draft, and the caller
 * inserts whatever it gets back.
 *
 * PAYMENT WORDING IS DELIBERATE. Payment is offline: cash or a bank transfer, between the two
 * people, with SamaanShare nowhere in the money path. Every string below says the *owner*
 * received or returned the money. Nothing here may imply the platform holds a deposit or
 * guarantees its return, because it does not, and copy that suggests otherwise would have to
 * be walked back the moment real escrow lands.
 */

/** A notification ready to insert, with its recipient already resolved. */
export interface NotificationDraft {
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /**
   * Which dashboard the notification points at.
   *
   * `Notification.entityType` is documented as the deep-link discriminator, and the two sides
   * of a booking live on different screens: a renter's booking is at `/dashboard/bookings`, an
   * owner's is at `/dashboard/requests`. Storing which one avoids having to re-derive the
   * reader's role in the booking at render time.
   */
  entityType: BookingEntityType;
  entityId: string;
}

export type BookingEntityType = "booking" | "booking-request";

/** Who the booking belongs to, so a draft can be addressed without another query. */
export interface BookingParties {
  renterId: string;
  ownerId: string;
}

interface BookingNotificationBase {
  bookingId: string;
  listingTitle: string;
  parties: BookingParties;
}

/**
 * The Phase 4 booking events.
 *
 * A discriminated union rather than loose strings, so the switch below is exhaustive and
 * adding an event fails at the type level instead of silently sending nothing. `REVIEW_RECEIVED`
 * and `REPORT_RESOLVED` exist in `NotificationType` but are not emitted here - they belong to
 * reviews and moderation, and inventing copy for them now would be guessing at flows that do
 * not exist yet.
 */
export type BookingNotificationEvent =
  | { event: "requested"; startDate: Date; endDate: Date }
  | { event: "approved" }
  | { event: "declined"; reason?: string | null }
  | { event: "expired" }
  | { event: "payment-selected"; method: PaymentMethod; amount: number }
  | { event: "payment-confirmed"; amount: number }
  | { event: "picked-up" }
  | { event: "returned" }
  | { event: "review-reminder" }
  | { event: "deposit-returned"; amount: number }
  | { event: "cancelled"; by: "renter" | "owner"; reason?: string | null };

export type BookingNotificationInput = BookingNotificationBase &
  BookingNotificationEvent;

/**
 * How much of a listing title a notification title carries.
 *
 * Titles are rendered in a 288px dropdown panel and a list row. A 200-character listing name
 * is legal and would push the meaningful part of the sentence out of sight, so it is clipped
 * here rather than by CSS - the truncation belongs in the stored text, which is also what an
 * email or push payload would use later.
 */
export const TITLE_ITEM_MAX = 40;

/** Clips a listing title for inclusion in a sentence, on a word boundary where possible. */
export function clipTitle(title: string, max: number = TITLE_ITEM_MAX): string {
  const trimmed = title.trim();

  if (trimmed.length <= max) {
    return trimmed;
  }

  const hard = trimmed.slice(0, max - 1);
  const lastSpace = hard.lastIndexOf(" ");

  // Only prefer the word boundary when it is not cutting the title to a stub.
  const base = lastSpace > max * 0.6 ? hard.slice(0, lastSpace) : hard;

  return `${base.trimEnd()}…`;
}

/**
 * Builds every notification an event produces.
 *
 * Returns drafts in a stable order - renter first where both are notified - so the tests can
 * assert on positions and a bulk insert is deterministic.
 */
export function buildBookingNotifications(
  input: BookingNotificationInput
): NotificationDraft[] {
  const { bookingId, parties } = input;
  const item = clipTitle(input.listingTitle);

  /** A draft for the renter, pointing at the renter's own bookings screen. */
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

  /** A draft for the owner, pointing at the incoming-requests screen. */
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

  switch (input.event) {
    case "requested":
      return [
        toOwner(
          NotificationType.BOOKING_REQUESTED,
          `New rental request for ${item}`,
          `${formatDate(input.startDate)} to ${formatDate(input.endDate)}. Respond within 48 hours or the request expires.`
        ),
      ];

    case "approved":
      return [
        toRenter(
          NotificationType.BOOKING_APPROVED,
          `Your request for ${item} was approved`,
          "Choose how you will pay the owner to continue."
        ),
      ];

    case "declined":
      return [
        toRenter(
          NotificationType.BOOKING_DECLINED,
          `Your request for ${item} was declined`,
          input.reason?.trim() ||
            "Those dates are free again for other renters."
        ),
      ];

    /**
     * Both sides, and the owner's copy is the point.
     *
     * The renter needs to know their wait ended in nothing. But an owner who quietly lost a
     * booking by not looking at the app is the one who can change their behaviour, and telling
     * only the renter would hide that entirely.
     */
    case "expired":
      return [
        toRenter(
          NotificationType.BOOKING_EXPIRED,
          `Your request for ${item} expired`,
          "The owner did not respond within 48 hours. Those dates are available again."
        ),
        toOwner(
          NotificationType.BOOKING_EXPIRED,
          `A request for ${item} expired`,
          "It went unanswered for 48 hours, so the dates were released."
        ),
      ];

    case "payment-selected":
      return [
        toOwner(
          NotificationType.PAYMENT_PENDING,
          `Payment arranged for ${item}`,
          `The renter will pay ${formatPKR(input.amount)} by ${paymentMethodLabel(input.method)}. Confirm once you have received it.`
        ),
      ];

    /**
     * "The owner confirmed receiving" - not "payment received".
     *
     * The money went from one person to the other; the platform only recorded that the owner
     * says so. The wording keeps who vouched for what visible, which matters if the two later
     * disagree about it.
     */
    case "payment-confirmed":
      return [
        toRenter(
          NotificationType.PAYMENT_CONFIRMED,
          `The owner confirmed receiving ${formatPKR(input.amount)}`,
          `Arrange collection of ${item} using the pickup instructions on your booking.`
        ),
      ];

    case "picked-up":
      return [
        toRenter(
          NotificationType.BOOKING_ACTIVE,
          `Your rental of ${item} has started`,
          "The owner marked the item as collected. Return it by the end date."
        ),
      ];

    case "returned":
      return [
        toRenter(
          NotificationType.BOOKING_COMPLETED,
          `Your rental of ${item} is complete`,
          "The owner confirmed the item came back. Your security deposit should be returned by the owner within 48 hours."
        ),
      ];

    case "review-reminder":
      return [
        toRenter(
          NotificationType.REVIEW_REMINDER,
          `How was renting ${item}?`,
          "Leaving a review helps the next renter, and helps owners trust you."
        ),
        toOwner(
          NotificationType.REVIEW_REMINDER,
          `How did renting out ${item} go?`,
          "Your review of the renter helps other owners decide."
        ),
      ];

    /**
     * Explicitly conditional wording.
     *
     * This records an owner's claim that they handed the money back, which is all an offline
     * flow can record. Telling the renter to speak up if it did not arrive is the only recourse
     * the platform can honestly offer at this stage.
     */
    case "deposit-returned":
      return [
        toRenter(
          NotificationType.DEPOSIT_RETURNED,
          `The owner marked your ${formatPKR(input.amount)} deposit as returned`,
          "If it has not reached you, contact the owner - SamaanShare does not hold the deposit."
        ),
      ];

    /**
     * Addressed to the side that did not do it.
     *
     * Sending the actor a notification about their own click is noise, and worse, it makes the
     * unread badge untrustworthy - the one thing a badge has to be.
     */
    case "cancelled": {
      const reason =
        input.reason?.trim() || "No reason was given for the cancellation.";

      return input.by === "renter"
        ? [
            toOwner(
              NotificationType.BOOKING_CANCELLED,
              `The renter cancelled their booking of ${item}`,
              `${reason} Those dates are free again.`
            ),
          ]
        : [
            toRenter(
              NotificationType.BOOKING_CANCELLED,
              `The owner cancelled your booking of ${item}`,
              reason
            ),
          ];
    }
  }
}

/**
 * Payment methods in the words a Pakistani user would use.
 *
 * A total map over the enum, so adding a provider fails to compile rather than telling an owner
 * to expect "JAZZCASH_WALLET". The wallet and card values are unreachable while payment is
 * offline; they are labelled anyway because the enum already declares them and a partial map
 * would defeat the exhaustiveness this exists for.
 */
export function paymentMethodLabel(method: PaymentMethod): string {
  const labels: Record<PaymentMethod, string> = {
    CASH: "cash",
    BANK_TRANSFER: "bank transfer",
    JAZZCASH_WALLET: "JazzCash",
    EASYPAISA_WALLET: "Easypaisa",
    CREDIT_CARD: "credit card",
    DEBIT_CARD: "debit card",
  };

  return labels[method];
}

/**
 * Where a notification leads.
 *
 * Pure, and driven by the stored `entityType` rather than the notification's `type`, so a new
 * event pointing at an existing screen needs no change here.
 */
export function notificationHref(
  entityType: string | null,
  entityId: string | null
): string | null {
  if (!entityId) {
    return null;
  }

  switch (entityType) {
    case "booking":
      return "/dashboard/bookings";
    case "booking-request":
      return "/dashboard/requests";
    default:
      return null;
  }
}
