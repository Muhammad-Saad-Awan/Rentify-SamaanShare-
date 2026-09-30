import { PaymentStatus } from "@/generated/prisma/enums";

/**
 * Giving the money back.
 *
 * THE OTHER TERMINAL OUTCOME. A booking that collected money ends in exactly one of two ways: it
 * settles, or it refunds. That is the property `Payment.refundedAt` was put on the payment rather
 * than on the settlement to preserve - reconciliation is then a single check per payment rather
 * than a union across two tables - and it only holds if each side refuses the other. Settlement
 * already refuses a refunded payment; this is the half that refuses a settled booking.
 *
 * Pure, like `commission.ts` and `settlement.ts`, so the refusals can be asserted without a
 * database.
 */

export interface RefundSubject {
  paymentStatus: PaymentStatus;
  /** What the renter paid, excluding the deposit. */
  amount: number;
  /** The deposit the platform is holding. */
  securityDeposit: number;
  /** `Payment.refundedAt !== null` - already given back. */
  refunded: boolean;
  /** Whether a `Settlement` row exists for the booking. */
  settled: boolean;
}

export type RefundReadiness =
  { ready: true; refundAmount: number } | { ready: false; reason: string };

/**
 * The whole amount the platform is holding for this booking.
 *
 * Rental AND deposit, because a refund means the rental is not happening and neither of them is
 * ours or the owner's to keep. Kept as a function rather than inlined so the one place that
 * decides "how much" is findable when a cancellation policy eventually wants a say.
 */
export function computeRefund({
  amount,
  securityDeposit,
}: {
  amount: number;
  securityDeposit: number;
}): number {
  if (!Number.isInteger(amount) || !Number.isInteger(securityDeposit)) {
    throw new TypeError("Refund components must be whole numbers of PKR.");
  }

  if (amount < 0 || securityDeposit < 0) {
    throw new RangeError("Refund components must not be negative.");
  }

  return amount + securityDeposit;
}

/**
 * Whether this booking's money can be given back, and how much.
 *
 * THE AMOUNT IS DERIVED, NEVER TYPED, for the same reason no settlement figure is: an
 * administrator decides *that* a booking is refunded, not *for how much*. There is no partial
 * refund here, and its absence is a decision rather than an omission - a partial refund is the
 * output of a cancellation policy, and this product has none. `canRenterCancel` refuses outright
 * once a payment is confirmed precisely because there was no policy to apply. Inventing a free
 * text amount would be inventing the policy at the keyboard, one booking at a time, with nothing
 * to review it against.
 *
 * BOOKING STATUS IS DELIBERATELY NOT A GATE. Everywhere else in this codebase the lifecycle
 * decides what may happen, and here it must not: a refund is the remedy of last resort, wanted
 * precisely in the cases the lifecycle did not anticipate - an item never handed over on a
 * booking that says ACTIVE, a duplicate payment, a fraudulent listing found after collection.
 * Gating it on status would not prevent those refunds, it would move them into somebody editing
 * the database by hand. What constrains this instead is that it is administrator-only, requires a
 * reason, writes an audit row, and cannot happen to a booking that has already been settled.
 */
export function refundReadiness({
  paymentStatus,
  amount,
  securityDeposit,
  refunded,
  settled,
}: RefundSubject): RefundReadiness {
  if (refunded) {
    return { ready: false, reason: "This payment has already been refunded." };
  }

  /**
   * The mutual exclusion, from this side.
   *
   * A settled booking has already paid the owner and returned the deposit; refunding it would
   * send the renter money the platform no longer holds.
   */
  if (settled) {
    return {
      ready: false,
      reason:
        "This booking has been settled, so the money has already gone out. A refund is no longer the remedy.",
    };
  }

  /**
   * Only verified money can be given back.
   *
   * A payment that was never confirmed is not held by anybody: there is nothing to return, and
   * recording a refund against it would put a figure in the ledger that never moved. A renter
   * whose evidence was rejected is not owed a refund - they are owed the chance to submit again.
   */
  if (paymentStatus !== PaymentStatus.COMPLETED) {
    return {
      ready: false,
      reason:
        "This payment is not verified, so SamaanShare is not holding anything to refund.",
    };
  }

  const refundAmount = computeRefund({ amount, securityDeposit });

  if (refundAmount <= 0) {
    return { ready: false, reason: "There is nothing to refund." };
  }

  return { ready: true, refundAmount };
}
