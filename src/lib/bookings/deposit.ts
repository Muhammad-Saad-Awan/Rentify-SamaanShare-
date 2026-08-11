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
  /** Owed, still inside the window. */
  | { kind: "due"; dueAt: Date; hoursRemaining: number }
  /** Owed, past the window. */
  | { kind: "overdue"; dueAt: Date; hoursLate: number };

interface DepositStateInput {
  securityDeposit: number;
  /** `null` until the rental completes. */
  completedAt: Date | null;
  /** `null` until the owner marks the deposit returned. */
  depositReturnedAt: Date | null;
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

  const dueAt = depositReturnDueAt(completedAt);
  const remainingMs = dueAt.getTime() - now.getTime();

  if (remainingMs > 0) {
    return {
      kind: "due",
      dueAt,
      hoursRemaining: Math.ceil(remainingMs / HOUR_MS),
    };
  }

  return {
    kind: "overdue",
    dueAt,
    hoursLate: Math.ceil(-remainingMs / HOUR_MS),
  };
}
