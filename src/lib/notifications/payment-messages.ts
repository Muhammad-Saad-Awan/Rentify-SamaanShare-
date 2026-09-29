import { NotificationType } from "@/generated/prisma/enums";
import { clipTitle } from "@/lib/notifications/messages";
import { formatPKR } from "@/lib/utils/currency";

import type {
  BookingParties,
  NotificationDraft,
} from "@/lib/notifications/messages";

/**
 * Notification copy for the custodial money flow, as pure data.
 *
 * SEPARATE FROM `messages.ts` FOR THE SAME REASON `actions/settlement.ts` IS SEPARATE FROM
 * `actions/payments.ts`. That module's copy describes money moving between two people, with
 * SamaanShare recording what they say happened - "the owner should return your deposit", never
 * "we hold it". These strings describe the opposite arrangement: the platform took the money and
 * the platform is accountable for it. Mixing the two would put contradictory promises a few lines
 * apart, and the wrong one would eventually be copied.
 *
 * SO THE COPY HERE MAY SAY "WE", AND MUST. An administrator verified the payment; SamaanShare is
 * holding the deposit; we sent the payout. A renter whose deposit has not come back needs to know
 * who to chase, and under this flow the answer is us. Hedging that to match the older wording
 * would be the one dishonest thing this file could do.
 *
 * THE AMOUNT IS ALWAYS STATED, as in the claim copy. "Your payment was confirmed" without the
 * figure makes opening the app compulsory to learn whether the right amount was recorded, and the
 * whole point of a money notification is that the reader can check it against their own bank.
 *
 * WHO IS NOT NOTIFIED. Nobody is told about their own action - an administrator's decisions land
 * in the audit trail, not in their feed - and a renter submitting evidence notifies no one,
 * because its audience is the verification queue rather than a person. See the note on
 * `NotificationType`.
 */

export type PaymentEvent =
  /** An administrator agreed the money arrived. Both parties: it unblocks the handover. */
  | { event: "verified"; amount: number }
  /** An administrator could not match it. The renter has to act. */
  | { event: "rejected"; reason: string }
  /** A verification undone. Rare, and the renter must not discover it by accident. */
  | { event: "verification-reversed"; reason: string }
  /** The figures are decided. Each side is told their own half. */
  | {
      event: "settled";
      ownerRentalAmount: number;
      commissionAmount: number;
      damageCompensationAmount: number;
      depositReturnedAmount: number;
    }
  /** The transfer to the owner has gone. */
  | { event: "owner-paid"; amount: number }
  /** The deposit has gone back to the renter. */
  | { event: "deposit-returned"; amount: number }
  /**
   * The collection was reversed.
   *
   * No emitter yet - the refund action is a later phase. The copy is here so that phase adds a
   * call rather than a decision about wording, and so the branch is covered by tests before it
   * has a caller.
   */
  | { event: "refunded"; amount: number };

export interface PaymentNotificationInput {
  bookingId: string;
  listingTitle: string;
  parties: BookingParties;
  event: PaymentEvent;
}

/**
 * Builds every notification one money event produces.
 *
 * Renter first where both are notified, matching `buildBookingNotifications` and
 * `buildClaimNotifications`, so a bulk insert is deterministic and tests can assert on position.
 */
export function buildPaymentNotifications({
  bookingId,
  listingTitle,
  parties,
  event,
}: PaymentNotificationInput): NotificationDraft[] {
  const item = clipTitle(listingTitle);

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
     * Both sides, and the owner's copy is the one that changes what happens next: the handover is
     * gated on the payment being confirmed, so this is the message that says they may hand over.
     */
    case "verified":
      return [
        toRenter(
          NotificationType.PAYMENT_CONFIRMED,
          `Your ${formatPKR(event.amount)} payment for ${item} is confirmed`,
          "SamaanShare is holding it until the rental is finished."
        ),
        toOwner(
          NotificationType.PAYMENT_CONFIRMED,
          `Payment confirmed for ${item}`,
          "You can hand the item over. We will pay you once it is returned."
        ),
      ];

    /**
     * The renter alone, and the reason travels with it.
     *
     * Without the reason this is "something is wrong, open the app", and the renter cannot tell a
     * mistyped reference from a payment that never arrived - which are minutes apart in effort.
     */
    case "rejected":
      return [
        toRenter(
          NotificationType.PAYMENT_REJECTED,
          `We could not confirm your payment for ${item}`,
          `${event.reason} Check the details and record it again.`
        ),
      ];

    /**
     * Told, rather than quietly corrected.
     *
     * This is the platform admitting it got something wrong, and the renter has already been told
     * their payment was confirmed. Leaving them to notice the status had moved backwards would be
     * worse than the original error. It says no action is needed, because none is.
     */
    case "verification-reversed":
      return [
        toRenter(
          NotificationType.PAYMENT_VERIFICATION_REVERSED,
          `We are re-checking your payment for ${item}`,
          `${event.reason} You do not need to do anything - we will confirm again shortly.`
        ),
      ];

    /**
     * Each side is told their own figures and not the other's.
     *
     * The owner gets the commission they were charged; the renter has no business knowing it, and
     * putting it in their notification would invite a conversation about the platform's cut in the
     * middle of a deposit return. The renter gets the one number they care about.
     */
    case "settled":
      return [
        toRenter(
          NotificationType.BOOKING_SETTLED,
          event.depositReturnedAmount > 0
            ? `${formatPKR(event.depositReturnedAmount)} of your deposit for ${item} is on its way back`
            : `Your deposit for ${item} has been settled`,
          event.damageCompensationAmount > 0
            ? `${formatPKR(event.damageCompensationAmount)} was awarded to the owner for the claim.`
            : null
        ),
        toOwner(
          NotificationType.BOOKING_SETTLED,
          `Your payout for ${item} is ready`,
          event.damageCompensationAmount > 0
            ? `${formatPKR(event.ownerRentalAmount)} rental plus ${formatPKR(event.damageCompensationAmount)} compensation, after ${formatPKR(event.commissionAmount)} commission.`
            : `${formatPKR(event.ownerRentalAmount)} after ${formatPKR(event.commissionAmount)} commission.`
        ),
      ];

    case "owner-paid":
      return [
        toOwner(
          NotificationType.OWNER_PAID,
          `We have sent you ${formatPKR(event.amount)} for ${item}`,
          "It should reach your account shortly. Tell us if it does not."
        ),
      ];

    /**
     * The renter alone. `DEPOSIT_RETURNED` is reused from the offline flow, but the body is not:
     * there it pointed the renter at the owner, because the platform was not in the money path.
     * Here we are, so it points at us.
     */
    case "deposit-returned":
      return [
        toRenter(
          NotificationType.DEPOSIT_RETURNED,
          `We have returned ${formatPKR(event.amount)} of your deposit for ${item}`,
          "Confirm on your booking once it reaches you. Tell us if it does not."
        ),
      ];

    case "refunded":
      return [
        toRenter(
          NotificationType.REFUND_RECORDED,
          `We have refunded ${formatPKR(event.amount)} for ${item}`,
          "It should reach your account shortly. Tell us if it does not."
        ),
      ];
  }
}
