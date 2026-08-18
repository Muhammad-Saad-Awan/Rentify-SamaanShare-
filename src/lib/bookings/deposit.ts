/**
 * The security-deposit return window.
 *
 * WHAT THIS IS AND IS NOT. The deposit is paid by the renter directly to the owner, in cash or
 * by transfer, and returned the same way. SamaanShare never holds it, cannot release it, and
 * cannot compensate a renter whose deposit does not come back. What the platform *can* do is
 * record that a return is owed, put a visible clock on it, and make an owner who lets that clock
 * run out visible as such.
 *
 * So every function here is about *stating an obligation*, never about custody. The wording the
 * UI hangs off these states has to stay on the right side of that line: "the owner should
 * return", not "your deposit is protected".
 *
 * A DAMAGE CLAIM CHANGES THE OBLIGATION, NOT THE MONEY. Once a claim is settled - by the renter
 * accepting it or an administrator ruling on it - the amount this module says is owed drops by the
 * upheld figure. That is the same act as everything else here: the platform revising what it states,
 * having never held anything. See `DepositClaim`.
 *
 * Pure, with `now` injected, so the states are unit-testable at any point in the window.
 */

/**
 * How long the owner has to return the deposit after the item comes back.
 *
 * 48 hours, matching the request-response window. A same-day requirement would be unrealistic
 * for a bank transfer between two people; a week is long enough that the renter has no idea
 * whether anything is wrong.
 */
export const DEPOSIT_RETURN_SLA_HOURS = 48;

const HOUR_MS = 3_600_000;

/** When the deposit is due back, measured from the moment the rental completed. */
export function depositReturnDueAt(completedAt: Date): Date {
  return new Date(completedAt.getTime() + DEPOSIT_RETURN_SLA_HOURS * HOUR_MS);
}

export type DepositState =
  /** No deposit was agreed, so there is nothing to return. */
  | { kind: "none" }
  /** The rental has not finished, so the clock has not started. */
  | { kind: "not-due" }
  /** The owner has marked it returned. */
  | { kind: "returned"; returnedAt: Date }
  /**
   * A claim is live, so the clock is paused and the amount is not yet settled.
   *
   * Its own state rather than a flag on `due`, because the honest sentence is different: not "you
   * are owed 60,000 in 12 hours" but "how much of this comes back is being decided". Squeezing that
   * into `due` would have every surface printing a figure the platform has stopped standing behind.
   */
  | { kind: "claimed"; amountClaimed: number; pauseEndsAt: Date }
  /** Owed, still inside the window. */
  | { kind: "due"; dueAt: Date; hoursRemaining: number; owed: number }
  /** Owed, past the window. */
  | { kind: "overdue"; dueAt: Date; hoursLate: number; owed: number };

/**
 * A claim's effect on the deposit, reduced to the two things this module needs.
 *
 * Deliberately not the claim row. This module is pure and knows nothing about claims beyond their
 * consequence: how much the owner may keep, and whether the clock is still held. Passing the record
 * would drag `ClaimStatus` in here and invite the deposit rules to start making claim decisions.
 */
export interface DepositClaim {
  /** `null` while nothing is settled - which is not the same as settled at zero. */
  amountUpheld: number | null;
  /** How much is being asked for, shown while a claim is live. */
  amountClaimed: number;
  /** Set while the claim still holds the clock; `null` once it no longer does. */
  pauseEndsAt: Date | null;
}

interface DepositStateInput {
  securityDeposit: number;
  /** `null` until the rental completes. */
  completedAt: Date | null;
  /** `null` until the owner marks the deposit returned. */
  depositReturnedAt: Date | null;
  /** `null` when no claim was ever filed, which is the overwhelming majority. */
  claim?: DepositClaim | null;
  now?: Date;
}

/**
 * Classifies where a booking's deposit stands.
 *
 * Order of checks matters. A zero deposit is "none" even after completion, because rendering a
 * countdown for PKR 0 would be absurd. A recorded return wins over the clock, so a deposit
 * returned late does not keep showing as overdue forever - the record is what happened, the
 * clock only mattered while it was outstanding.
 *
 * `hoursRemaining` and `hoursLate` are rounded *up*, so "1h remaining" covers the last partial
 * hour rather than showing "0h remaining" for the final fifty-nine minutes.
 */
export function depositState({
  securityDeposit,
  completedAt,
  depositReturnedAt,
  claim = null,
  now = new Date(),
}: DepositStateInput): DepositState {
  if (securityDeposit <= 0) {
    return { kind: "none" };
  }

  if (depositReturnedAt) {
    return { kind: "returned", returnedAt: depositReturnedAt };
  }

  if (!completedAt) {
    return { kind: "not-due" };
  }

  /**
   * A live claim pauses the clock, but only until `pauseEndsAt`.
   *
   * The pause exists so an owner is not branded overdue for withholding money genuinely in dispute.
   * The cap exists because a pause with no end would make filing a claim the most effective way to
   * keep a renter's deposit indefinitely - a better weapon than the problem it solves. Once it
   * lapses the clock resumes and the claim carries on being decided; the two are independent.
   */
  if (claim?.pauseEndsAt && now.getTime() < claim.pauseEndsAt.getTime()) {
    return {
      kind: "claimed",
      amountClaimed: claim.amountClaimed,
      pauseEndsAt: claim.pauseEndsAt,
    };
  }

  /**
   * What is actually owed back.
   *
   * A settled claim reduces it. An unsettled one does not - the platform does not act on an
   * assertion, so until the renter accepts or an administrator rules, the full deposit is what is
   * owed and the owner withholding more than that is simply late.
   *
   * Floored at zero: `amountUpheld` is capped at the claim which is capped at the deposit, so this
   * cannot go negative through any supported path, and clamping is cheaper than trusting that
   * chain to hold through every future edit.
   */
  const owed = Math.max(0, securityDeposit - (claim?.amountUpheld ?? 0));

  const dueAt = depositReturnDueAt(completedAt);
  const remainingMs = dueAt.getTime() - now.getTime();

  if (remainingMs > 0) {
    return {
      kind: "due",
      dueAt,
      hoursRemaining: Math.ceil(remainingMs / HOUR_MS),
      owed,
    };
  }

  return {
    kind: "overdue",
    dueAt,
    hoursLate: Math.ceil(-remainingMs / HOUR_MS),
    owed,
  };
}
