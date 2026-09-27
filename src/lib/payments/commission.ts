/**
 * SamaanShare's commission on a rental.
 *
 * Pure: no Prisma, no request context, no configuration read from anywhere. Everything it needs
 * arrives as arguments, which is what lets the rounding rules be asserted directly rather than
 * inferred from a settlement that already happened. Same shape as `lifecycle.ts`, `deposit.ts`
 * and `access.ts`.
 *
 * WHAT THIS MODULE DELIBERATELY CANNOT SEE. It takes a rental amount and nothing else - no
 * security deposit, no damage compensation. That is not an omission, it is the enforcement:
 * commission applies to the rental and only to the rental, and a function that never receives the
 * other two figures cannot take a cut of them by accident. A later caller that wants to commission
 * a deposit would have to change this signature, which is exactly the review it should require.
 */

/** 1% = 100 bps. The divisor is here rather than inline so the arithmetic below reads as a rate. */
export const BASIS_POINTS_DIVISOR = 10_000;

/** 100%. A rate above this would owe the owner a negative amount. */
export const MAX_RATE_BPS = BASIS_POINTS_DIVISOR;

export interface CommissionInput {
  /** The rental charge in whole PKR, excluding the security deposit. */
  rentalAmount: number;
  /**
   * The platform's cut in basis points.
   *
   * BASIS POINTS RATHER THAN A PERCENTAGE, because every money value in this codebase is an `Int`
   * and a percentage is not. 7.5% has no integer representation; 750 bps does. Storing the rate
   * the same way it is stored everywhere else removes a float from the one calculation that must
   * never carry one.
   */
  rateBps: number;
}

export interface CommissionBreakdown {
  /** Echoed back so a caller writing a settlement row records what it actually charged against. */
  rentalAmount: number;
  rateBps: number;
  /** What SamaanShare retains, in whole PKR. */
  commissionAmount: number;
  /**
   * What the owner receives FOR THE RENTAL, in whole PKR.
   *
   * Named for the rental specifically because an owner's total payout may also include damage
   * compensation from an upheld claim, and those two must stay visibly separate all the way to
   * the admin screen. Adding them together here would be the easiest place to lose that
   * distinction and the hardest place to notice it had gone.
   */
  ownerRentalAmount: number;
}

function assertWholeAmount(value: number, name: string): void {
  if (!Number.isInteger(value)) {
    throw new TypeError(
      `${name} must be a whole number of PKR, received ${value}.`
    );
  }
}

/**
 * Splits a rental charge into the platform's commission and the owner's share.
 *
 * ROUNDS DOWN, AND THE OWNER KEEPS THE REMAINDER. 7.5% of PKR 333 is 24.975, and somebody has to
 * get that rupee. It goes to the owner: they are the side of this marketplace that is harder to
 * recruit, and a platform that rounds in its own favour on every transaction is a platform owners
 * eventually notice rounding in its own favour.
 *
 * THE INVARIANT HOLDS BY CONSTRUCTION, NOT BY ASSERTION. The owner's share is derived by
 * subtraction, never calculated independently. Computing both from the rate and rounding each one
 * is how `commission + owner !== rental` happens: two roundings, two remainders, and a rupee that
 * exists in neither column. There is exactly one rounding here, and the other figure absorbs it.
 *
 * THROWS ON BAD INPUT rather than clamping or returning zero. Every argument comes from an `Int`
 * column or a checked configuration value, so a fractional or negative one is a programming error
 * upstream - and a money function that quietly corrects its inputs turns that error into a wrong
 * payout nobody investigates.
 *
 * @example
 * computeCommission({ rentalAmount: 5000, rateBps: 1000 })
 * // { commissionAmount: 500, ownerRentalAmount: 4500, ... }
 */
export function computeCommission({
  rentalAmount,
  rateBps,
}: CommissionInput): CommissionBreakdown {
  assertWholeAmount(rentalAmount, "rentalAmount");
  assertWholeAmount(rateBps, "rateBps");

  if (rentalAmount < 0) {
    throw new RangeError(
      `rentalAmount must not be negative, received ${rentalAmount}.`
    );
  }

  if (rateBps < 0 || rateBps > MAX_RATE_BPS) {
    throw new RangeError(
      `rateBps must be between 0 and ${MAX_RATE_BPS}, received ${rateBps}.`
    );
  }

  /**
   * A rate of zero is a supported, expected state - not a disabled feature.
   *
   * The commission percentage is deliberately unset while the platform launches, and every part
   * of settlement has to work at 0: the owner simply receives the whole rental. Special-casing it
   * would be redundant, since the arithmetic below already produces exactly that, but it is worth
   * saying out loud that nothing downstream may treat 0 as "not configured yet".
   */
  /**
   * The float division here is safe, and that was checked rather than assumed.
   *
   * `Math.floor` on a quotient is the classic place a money calculation loses a rupee: if the
   * true value sits a hair below an integer and the division rounds up to it, the floor returns
   * one too many. It cannot happen at these magnitudes. The product is an exact integer -
   * PKR 10,000,000 at 10,000 bps is 10^11, against a safe-integer ceiling of 9.007 x 10^15 - and
   * IEEE-754 division is correctly rounded, so an exactly-divisible case returns exactly the
   * integer and an inexact one stays below it. Verified against exact integer arithmetic over
   * every rate from 0 to 10,000 bps across amounts up to ten million: no disagreement.
   */
  const commissionAmount = Math.floor(
    (rentalAmount * rateBps) / BASIS_POINTS_DIVISOR
  );

  return {
    rentalAmount,
    rateBps,
    commissionAmount,
    ownerRentalAmount: rentalAmount - commissionAmount,
  };
}

/**
 * The owner's total payout, kept as a separate function on purpose.
 *
 * Damage compensation from an upheld claim is money the renter owes the owner, not revenue the
 * platform helped generate, so it is never commissioned. Keeping the addition out of
 * `computeCommission` means the two figures reach the settlement row - and the admin screen -
 * as separate numbers that happen to be summed for display, rather than as one number nobody can
 * take apart afterwards.
 */
export function totalOwnerPayout({
  ownerRentalAmount,
  damageCompensationAmount,
}: {
  ownerRentalAmount: number;
  damageCompensationAmount: number;
}): number {
  assertWholeAmount(ownerRentalAmount, "ownerRentalAmount");
  assertWholeAmount(damageCompensationAmount, "damageCompensationAmount");

  if (ownerRentalAmount < 0 || damageCompensationAmount < 0) {
    throw new RangeError("Payout components must not be negative.");
  }

  return ownerRentalAmount + damageCompensationAmount;
}
