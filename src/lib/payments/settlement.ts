/**
 * What a finished rental owes to whom.
 *
 * Settlement is the moment the platform stops holding money: the owner is paid their share of
 * the rental plus any damage compensation, SamaanShare keeps its commission, and the rest of the
 * deposit goes back to the renter. This module decides the figures and whether a booking is in a
 * state to have them decided. It moves nothing - `actions/settlement.ts` writes the row.
 *
 * Pure, like `lifecycle.ts`, `deposit.ts`, `access.ts` and `commission.ts`: no Prisma, no session,
 * no configuration read from anywhere. Everything arrives as arguments. That is what lets the
 * awkward cases - a withdrawn claim, a deposit entirely consumed by damage, a rate frozen at zero -
 * be asserted directly instead of reconstructed from a settlement that already happened.
 *
 * EVERY FIGURE IS DERIVED, NONE IS ACCEPTED. No caller passes in a payout. The administrator
 * settling a booking decides *that* it settles, never *for how much* - the amounts follow from the
 * verified payment, the rate frozen at verification, and the upheld claim, and there is no input
 * that can bend them. An administrator who believes a figure is wrong has to correct the thing it
 * derives from, which leaves a record; typing a different number into a payout field would not.
 */

import {
  BookingStatus,
  ClaimStatus,
  PaymentStatus,
} from "@/generated/prisma/enums";
import { computeCommission, totalOwnerPayout } from "@/lib/payments/commission";

export interface SettlementInput {
  /** The rental charge in whole PKR, excluding the deposit - `Payment.amount`. */
  rentalAmount: number;
  /**
   * The rate FROZEN AT VERIFICATION, in basis points - `Payment.commissionRateBps`.
   *
   * Never `COMMISSION_RATE_BPS`. The owner was told what they would receive before they handed
   * the item over, and a settlement that read the current configuration would quietly rewrite
   * that promise for every unsettled booking the moment the rate changed.
   */
  rateBps: number;
  /** The deposit the platform collected and is holding - `Payment.securityDeposit`. */
  securityDeposit: number;
  /** What an upheld damage claim awards the owner out of that deposit; 0 when there is no claim. */
  damageCompensationAmount: number;
}

export interface SettlementBreakdown {
  rentalAmount: number;
  commissionRateBps: number;
  commissionAmount: number;
  ownerRentalAmount: number;
  securityDeposit: number;
  damageCompensationAmount: number;
  /** `securityDeposit - damageCompensationAmount`: what goes back to the renter. */
  depositReturnedAmount: number;
  /**
   * `ownerRentalAmount + damageCompensationAmount`, for display only.
   *
   * Derived here and NOT stored - see the note on the `Settlement` model. It is offered so that
   * every screen showing a total shows the same one, while the two components stay separate all
   * the way through: rental income the platform took a cut of, and compensation it did not.
   */
  totalOwnerPayout: number;
}

function assertWholeAmount(value: number, name: string): void {
  if (!Number.isInteger(value)) {
    throw new TypeError(
      `${name} must be a whole number of PKR, received ${value}.`
    );
  }

  if (value < 0) {
    throw new RangeError(`${name} must not be negative, received ${value}.`);
  }
}

/**
 * Splits a finished rental into the four amounts a settlement records.
 *
 * TWO CONSERVATION RULES HOLD BY CONSTRUCTION, not by assertion:
 *
 *     commissionAmount + ownerRentalAmount           === rentalAmount
 *     damageCompensationAmount + depositReturnedAmount === securityDeposit
 *
 * Both by subtraction, never by calculating each side independently - the reasoning is the same
 * as in `computeCommission`, and the consequence is that the platform can never disburse more or
 * less than it collected. Together they give the only property that matters when reconciling a
 * bank account against this table: rental + deposit in equals commission + owner + renter out.
 *
 * THROWS RATHER THAN CLAMPING. Damage compensation above the deposit would pay an owner money the
 * platform never collected, and it cannot arrive through any supported path - `amountClaimed` is
 * capped at the deposit and `amountUpheld` at the claim. If it arrives anyway something upstream
 * is broken, and a refusal is how anybody finds out; quietly reducing it to the deposit would
 * settle the booking at a figure nobody chose.
 */
export function computeSettlement({
  rentalAmount,
  rateBps,
  securityDeposit,
  damageCompensationAmount,
}: SettlementInput): SettlementBreakdown {
  assertWholeAmount(securityDeposit, "securityDeposit");
  assertWholeAmount(damageCompensationAmount, "damageCompensationAmount");

  if (damageCompensationAmount > securityDeposit) {
    throw new RangeError(
      `damageCompensationAmount ${damageCompensationAmount} exceeds the security deposit ${securityDeposit}.`
    );
  }

  // Validates `rentalAmount` and `rateBps`, and owns the commission half of the arithmetic.
  const { commissionAmount, ownerRentalAmount } = computeCommission({
    rentalAmount,
    rateBps,
  });

  return {
    rentalAmount,
    commissionRateBps: rateBps,
    commissionAmount,
    ownerRentalAmount,
    securityDeposit,
    damageCompensationAmount,
    depositReturnedAmount: securityDeposit - damageCompensationAmount,
    totalOwnerPayout: totalOwnerPayout({
      ownerRentalAmount,
      damageCompensationAmount,
    }),
  };
}

/** The claim facts settlement needs, which is two of them. */
export interface SettlementClaim {
  status: ClaimStatus;
  /** `null` while nothing is decided - which is not the same as decided at zero. */
  amountUpheld: number | null;
}

export interface SettlementSubject {
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  /** `Payment.commissionRateBps`; `null` means the payment is not verified. */
  commissionRateBps: number | null;
  /** Whether this collection has been reversed - `Payment.refundedAt !== null`. */
  refunded: boolean;
  /** Whether a `Settlement` row already exists for the booking. */
  settled: boolean;
  /** `null` when no claim was ever filed, which is the overwhelming majority. */
  claim?: SettlementClaim | null;
}

/**
 * The ready branch carries the two derived inputs `computeSettlement` needs.
 *
 * Returning them rather than leaving the caller to re-read them off the payment is not a
 * convenience: `commissionRateBps` is nullable on the row and non-null only because this function
 * refused the null, and handing back the narrowed value is how that refusal reaches the type
 * system. The alternative is a non-null assertion at the call site, which is the same claim made
 * where nothing checks it.
 */
export type SettlementReadiness =
  | {
      ready: true;
      commissionRateBps: number;
      damageCompensationAmount: number;
    }
  | { ready: false; reason: string };

/**
 * Whether a booking's money can be settled, and if so how much of the deposit the owner keeps.
 *
 * Separate from `computeSettlement` because these are different kinds of rule and only one of
 * them is arithmetic. This half is the eligibility policy, and it lives here rather than inline
 * in the action so every branch can be asserted without a database - including the ones that are
 * tedious to reach through real rows, like a claim resolved without an upheld figure.
 *
 * ORDER OF CHECKS IS THE MESSAGE. A cancelled booking whose payment was verified is reported as
 * needing a refund rather than as an unfinished rental, because the booking check runs before the
 * payment one. An administrator reading a refusal has to be told the actionable thing, and for
 * that booking the actionable thing is the refund.
 */
export function settlementReadiness({
  bookingStatus,
  paymentStatus,
  commissionRateBps,
  refunded,
  settled,
  claim = null,
}: SettlementSubject): SettlementReadiness {
  if (settled) {
    return { ready: false, reason: "This booking has already been settled." };
  }

  /**
   * A booking reaches exactly one terminal money outcome: it settles or it refunds, never both -
   * see the note on `Payment.refundedAt`. Enforced here, in the phase that writes settlements,
   * rather than left for the refund phase to retrofit: a check that keeps an invariant is worth
   * nothing if it arrives after the rows it was meant to prevent.
   */
  if (refunded) {
    return {
      ready: false,
      reason:
        "This payment has been refunded, so there is nothing left to settle.",
    };
  }

  const bookingBlocker = settlementBlockedByBooking(bookingStatus);

  if (bookingBlocker) {
    return { ready: false, reason: bookingBlocker };
  }

  if (paymentStatus !== PaymentStatus.COMPLETED) {
    return {
      ready: false,
      reason:
        "The payment on this booking is not verified, so there is nothing to pay out.",
    };
  }

  /**
   * Unreachable through the actions - `verifyPayment` writes the rate in the same statement that
   * sets `COMPLETED`, and `reverseVerification` clears both together. Refused rather than
   * defaulted all the same, because the only ways here are a hand-edited row or a future path
   * that forgot, and settling at whatever rate happens to be configured today is precisely the
   * retroactive rewrite the freeze exists to prevent.
   */
  if (commissionRateBps === null) {
    return {
      ready: false,
      reason:
        "This payment has no commission rate recorded. Reverse and re-verify it before settling.",
    };
  }

  const damage = damageCompensationFromClaim(claim);

  if ("blocked" in damage) {
    return { ready: false, reason: damage.blocked };
  }

  return {
    ready: true,
    commissionRateBps,
    damageCompensationAmount: damage.amount,
  };
}

/**
 * Whether the rental itself is in a state to be settled.
 *
 * Total over `BookingStatus`, so adding one fails `tsc` here rather than falling through into a
 * settlement nobody considered. Returns `null` when nothing blocks.
 */
function settlementBlockedByBooking(status: BookingStatus): string | null {
  switch (status) {
    /**
     * The two finished states. Settlement does not wait on reviews and reviewing does not wait on
     * settlement: an owner should not have to chase a renter for a rating before being paid, and
     * a renter who reviewed promptly must not thereby be settled sooner than one who did not.
     */
    case BookingStatus.COMPLETED:
    case BookingStatus.REVIEWED:
      return null;

    /**
     * The item is still out. Paying the owner now would leave the platform holding a deposit
     * against an item nobody has seen come back - and, if it comes back damaged, nothing left to
     * pay the claim out of.
     */
    case BookingStatus.ACTIVE:
      return "The item has not come back yet. Settle once the rental is complete.";

    case BookingStatus.PENDING:
    case BookingStatus.APPROVED:
    case BookingStatus.PAYMENT_PENDING:
      return "This rental has not started, so there is nothing to settle.";

    /** Money may well have been collected; giving it back is a refund, which is not this. */
    case BookingStatus.DECLINED:
    case BookingStatus.CANCELLED:
    case BookingStatus.EXPIRED:
      return "This rental never ran. Anything collected is a refund, not a settlement.";
  }
}

/**
 * How much of the deposit an upheld claim awards the owner.
 *
 * Total over `ClaimStatus`. A live claim blocks settlement outright rather than paying out the
 * undisputed remainder first: splitting it doubles every transfer and leaves one deposit spread
 * across two decisions, and the pause a claim already puts on the return clock exists to buy
 * exactly this time.
 */
function damageCompensationFromClaim(
  claim: SettlementClaim | null
): { amount: number } | { blocked: string } {
  if (!claim) {
    return { amount: 0 };
  }

  switch (claim.status) {
    case ClaimStatus.OPEN:
    case ClaimStatus.DISPUTED:
      return {
        blocked:
          "The damage claim on this rental is still being decided. Resolve it before settling.",
      };

    /** Withdrawn is a decision: the owner is owed nothing extra and the deposit goes back whole. */
    case ClaimStatus.WITHDRAWN:
      return { amount: 0 };

    case ClaimStatus.ACCEPTED:
    case ClaimStatus.RESOLVED:
      /**
       * Refused rather than read as zero. A settled claim with no figure is a broken row, and
       * treating it as zero would hand the renter the whole deposit while the record says the
       * owner was owed part of it - the one error here that nobody would ever notice.
       */
      return claim.amountUpheld === null
        ? {
            blocked:
              "The damage claim is settled but records no upheld amount. Fix the claim before settling.",
          }
        : { amount: claim.amountUpheld };
  }
}
