import {
  BookingStatus,
  ClaimReason,
  ClaimStatus,
  HandoverCondition,
} from "@/generated/prisma/enums";

/**
 * Damage claims. Pure, so all of this is testable without a database.
 *
 * WHAT A CLAIM CAN AND CANNOT BE. The deposit passes directly between the two people; SamaanShare
 * never holds it, cannot release it and cannot compensate anyone - see the note at the top of
 * `src/lib/bookings/deposit.ts`. So a claim does not move money. It changes the amount the platform
 * STATES is owed back, which is the same job `depositState` already does, applied to a disagreement.
 *
 * FIVE PROPERTIES THIS PROTECTS.
 *
 * 1. A claim is bounded by the deposit. That is the only obligation the platform has standing to
 *    describe; a larger figure would imply an enforcement power that does not exist.
 *
 * 2. Silence is never acceptance. An unanswered claim escalates to a human, it does not succeed by
 *    default. A handover record can sit unanswered forever because nothing turns on it; a claim has
 *    a price attached, and letting a missed notification cost someone money is not a design, it is
 *    a way of collecting from the inattentive.
 *
 * 3. The clock pauses, but not indefinitely. An owner with a live claim should not be branded
 *    overdue for withholding money that is genuinely in dispute - and a claim that could freeze a
 *    renter's deposit forever would be a better weapon than the problem it solves.
 *
 * 4. A claim cannot be filed once the deposit is back. The money has returned, so there is nothing
 *    left for the platform to state, and the alternative invites "return it, then claim it".
 *
 * 5. Nothing here decides anything. A claim is an assertion until the renter accepts it or an
 *    administrator rules on it, and the amount claimed is never the amount upheld until one of
 *    those has happened.
 */

/**
 * How long a renter has to answer, and how long the deposit clock pauses for.
 *
 * ONE CONSTANT USED TWICE, deliberately. Two numbers here would drift: a pause longer than the
 * response window would hold a deposit after the renter's chance to speak had passed, and a shorter
 * one would restart the clock while they were still entitled to answer. Seven days is long enough
 * for someone who rented over a weekend and short enough that a deposit is not in limbo for a month.
 */
export const CLAIM_RESPONSE_DAYS = 7;

/**
 * How long after completion a claim may be filed.
 *
 * The same seven days. Damage tends to be found when the item is next used rather than at the door,
 * so a 48-hour window matching the deposit SLA would be too tight - but a claim arriving a month
 * later is unanswerable, because by then neither party can prove anything about the item's state.
 */
export const CLAIM_FILING_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Bound on the claimant's description. Required, unlike a handover note - a claim asks for money. */
export const CLAIM_DESCRIPTION_MAX = 2000;
export const CLAIM_DESCRIPTION_MIN = 20;

/** Bound on the renter's reply. */
export const CLAIM_RESPONSE_MAX = 2000;

/** Bound on the administrator's determination note. */
export const CLAIM_RESOLUTION_MAX = 2000;

/** Photos per claim, per side. Matches a handover's six. */
export const CLAIM_PHOTOS_MAX = 6;

/** When a claim filed at `filedAt` stops waiting for the renter. */
export function claimResponseDueAt(filedAt: Date): Date {
  return new Date(filedAt.getTime() + CLAIM_RESPONSE_DAYS * DAY_MS);
}

/** When the window to file against a rental completed at `completedAt` shuts. */
export function claimFilingClosesAt(completedAt: Date): Date {
  return new Date(completedAt.getTime() + CLAIM_FILING_DAYS * DAY_MS);
}

export type ClaimEligibility =
  { allowed: true } | { allowed: false; reason: string };

interface FileEligibilityInput {
  status: BookingStatus;
  /** `null` until the rental completes. */
  completedAt: Date | null;
  /** The booking's deposit, in whole PKR. */
  securityDeposit: number;
  /** `null` until the owner records the deposit as returned. */
  depositReturnedAt: Date | null;
  /** Whether a claim already exists for this booking. */
  alreadyClaimed: boolean;
  /** What is being asked for, in whole PKR. */
  amountClaimed: number;
  now?: Date;
}

/**
 * Whether an owner may file this claim now.
 *
 * The order of these checks is the order a person would hit them, so the first failure they see is
 * the most informative one rather than whichever happened to be tested first.
 */
export function canFileClaim({
  status,
  completedAt,
  securityDeposit,
  depositReturnedAt,
  alreadyClaimed,
  amountClaimed,
  now = new Date(),
}: FileEligibilityInput): ClaimEligibility {
  if (alreadyClaimed) {
    return {
      allowed: false,
      reason: "You have already filed a claim on this rental.",
    };
  }

  if (status !== BookingStatus.COMPLETED && status !== BookingStatus.REVIEWED) {
    return {
      allowed: false,
      reason: "Only a completed rental can be claimed against.",
    };
  }

  if (!completedAt) {
    // Defensive: COMPLETED without a timestamp should be unreachable, since `completeBooking` writes
    // both in one transaction. Refusing is safer than dating the window from now.
    return {
      allowed: false,
      reason: "This rental has no completion date recorded.",
    };
  }

  if (securityDeposit <= 0) {
    return {
      allowed: false,
      reason: "There was no security deposit on this rental to claim against.",
    };
  }

  /**
   * The deposit has already gone back.
   *
   * Nothing is left for the platform to state, and without this an owner could return the money,
   * then file a claim against a deposit they no longer hold - which the platform would then be
   * publishing as an obligation on the renter.
   */
  if (depositReturnedAt) {
    return {
      allowed: false,
      reason:
        "You have already returned this deposit, so there is nothing to claim against.",
    };
  }

  if (now.getTime() >= claimFilingClosesAt(completedAt).getTime()) {
    return {
      allowed: false,
      reason: `Claims must be filed within ${CLAIM_FILING_DAYS} days of the rental ending.`,
    };
  }

  if (!Number.isInteger(amountClaimed) || amountClaimed <= 0) {
    return {
      allowed: false,
      reason: "Enter the amount you are claiming, in whole rupees.",
    };
  }

  if (amountClaimed > securityDeposit) {
    return {
      allowed: false,
      reason:
        "A claim cannot exceed the security deposit. Anything beyond it is between you and the renter.",
    };
  }

  return { allowed: true };
}

/** Whether the renter may still answer. */
export function canRespondToClaim(
  status: ClaimStatus,
  isRespondent: boolean
): ClaimEligibility {
  if (!isRespondent) {
    return {
      allowed: false,
      reason: "Only the renter on this booking can answer this claim.",
    };
  }

  if (status !== ClaimStatus.OPEN) {
    return { allowed: false, reason: "This claim has already been answered." };
  }

  return { allowed: true };
}

/** Whether the owner may still withdraw. Open or disputed - anything not yet settled. */
export function canWithdrawClaim(
  status: ClaimStatus,
  isClaimant: boolean
): ClaimEligibility {
  if (!isClaimant) {
    return {
      allowed: false,
      reason: "Only the owner who filed this claim can withdraw it.",
    };
  }

  if (status !== ClaimStatus.OPEN && status !== ClaimStatus.DISPUTED) {
    return {
      allowed: false,
      reason: "This claim has already been settled.",
    };
  }

  return { allowed: true };
}

/**
 * Whether an administrator may rule on this claim, and for how much.
 *
 * DISPUTED only. An accepted claim is already settled by agreement between the two people, and there
 * is nothing left for a third party to decide - overruling it would be the platform inserting itself
 * into a resolution both sides reached without it.
 */
export function canResolveClaim(
  status: ClaimStatus,
  amountUpheld: number,
  amountClaimed: number
): ClaimEligibility {
  if (status !== ClaimStatus.DISPUTED) {
    return {
      allowed: false,
      reason:
        status === ClaimStatus.OPEN
          ? "This claim is still with the renter to answer."
          : "This claim has already been settled.",
    };
  }

  if (!Number.isInteger(amountUpheld) || amountUpheld < 0) {
    return {
      allowed: false,
      reason: "Enter the amount upheld, in whole rupees.",
    };
  }

  /**
   * Never more than was asked for.
   *
   * An administrator awarding beyond the claim would be deciding something nobody put to them, and
   * the renter would have had no opportunity to answer the larger figure.
   */
  if (amountUpheld > amountClaimed) {
    return {
      allowed: false,
      reason: "The amount upheld cannot exceed the amount claimed.",
    };
  }

  return { allowed: true };
}

/**
 * Whether an open claim has waited long enough to go to a human.
 *
 * Evaluated lazily on the read paths that care, never by a scheduler - the same reasoning as booking
 * expiry and review release. A cron that silently stopped would leave claims open forever, the
 * deposit clock paused behind them, and nothing in the app noticing.
 */
export function shouldEscalateClaim(
  status: ClaimStatus,
  filedAt: Date,
  now: Date = new Date()
): boolean {
  return (
    status === ClaimStatus.OPEN &&
    now.getTime() >= claimResponseDueAt(filedAt).getTime()
  );
}

/**
 * How much of the deposit the owner may keep, given the claim's state.
 *
 * `null` means "not settled" rather than zero, so the caller can distinguish a claim still in
 * progress from one decided in the renter's favour. Those produce different statements: one says the
 * amount is undecided, the other says the full deposit is owed.
 */
export function upheldAmount(
  status: ClaimStatus,
  amountUpheld: number | null
): number | null {
  switch (status) {
    case ClaimStatus.ACCEPTED:
    case ClaimStatus.RESOLVED:
      return amountUpheld ?? 0;
    case ClaimStatus.OPEN:
    case ClaimStatus.DISPUTED:
      return null;
    case ClaimStatus.WITHDRAWN:
      // Withdrawn is settled at nothing: the owner took the claim back, so the whole deposit is owed.
      return 0;
  }
}

/** Whether a claim is still live, and therefore still holding the deposit clock. */
export function isClaimOpen(status: ClaimStatus): boolean {
  return status === ClaimStatus.OPEN || status === ClaimStatus.DISPUTED;
}

/**
 * Whether the return condition record supports this claim.
 *
 * Not a gate. An owner who graded the item `AS_EXPECTED` at the door and now claims damage is not
 * refused - genuinely hidden faults exist, and an item is often only found broken when it is next
 * used. But the contradiction is recorded and shown to whoever resolves the claim, because an owner
 * arguing against their own written record is close to the strongest evidence available either way.
 */
export function claimSupportedByHandover(
  condition: HandoverCondition | null
): boolean {
  return (
    condition === HandoverCondition.MINOR_WEAR ||
    condition === HandoverCondition.DAMAGED
  );
}

/** What each reason says, in the words an owner would use. */
export const CLAIM_REASON_LABELS: Readonly<Record<ClaimReason, string>> = {
  [ClaimReason.DAMAGED]: "The item came back damaged",
  [ClaimReason.MISSING_PARTS]: "Parts or accessories are missing",
  [ClaimReason.NOT_RETURNED]: "The item was never returned",
  [ClaimReason.LATE_RETURN]: "It came back late and cost me a booking",
  [ClaimReason.CLEANING_REQUIRED]: "It needed cleaning or servicing",
  [ClaimReason.OTHER]: "Something else",
};

/** How a claim's state reads to the two people in it. */
export const CLAIM_STATUS_LABELS: Readonly<Record<ClaimStatus, string>> = {
  [ClaimStatus.OPEN]: "Awaiting the renter's response",
  [ClaimStatus.ACCEPTED]: "Agreed by both parties",
  [ClaimStatus.DISPUTED]: "Disputed — with SamaanShare to decide",
  [ClaimStatus.RESOLVED]: "Decided by SamaanShare",
  [ClaimStatus.WITHDRAWN]: "Withdrawn by the owner",
};
