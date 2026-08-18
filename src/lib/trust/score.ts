/**
 * The trust score. Pure, so all of this is testable without a database.
 *
 * WHAT A TRUST SCORE IS FOR, AND THE WAY IT USUALLY GOES WRONG.
 *
 * A star average already answers "was this person good to deal with". A trust score that is mostly
 * the star average restates it in a second unit and adds nothing but false authority. This one
 * exists to combine evidence a rating cannot carry: how much of it there is, how consistently the
 * person completes what they start, and whether the account is anchored to a real identity.
 *
 * FOUR PROPERTIES THIS PROTECTS.
 *
 * 1. Absence is not a bad score. A new account scores `null`, not zero - the same argument as
 *    `ratingAggregate` returning null for no reviews. "Not yet established" and "established as
 *    unreliable" are opposite claims, and a number cannot say the first.
 *
 * 2. A perfect average from one rental does not outrank a strong one from fifty. Ratings are shrunk
 *    towards a neutral prior by their own count, so confidence is earned rather than assumed.
 *
 * 3. Volume alone cannot buy trust. Experience saturates: the difference between two rentals and
 *    ten is large, between forty and fifty is nothing.
 *
 * 4. Only positive badges are published. Falling short earns no badge, never a negative one - see
 *    {@link trustBandFor}.
 */

/** The evidence a score is computed from. Every field is derivable from what the app already stores. */
export interface TrustSignals {
  /** Reviews received as an owner - `RENTER_TO_OWNER`. */
  ownerRating: { average: number | null; count: number };
  /** Reviews received as a renter - `OWNER_TO_RENTER`. */
  renterRating: { average: number | null; count: number };
  /** Rentals carried through to completion, on either side. */
  completedRentals: number;
  /** Bookings this person cancelled themselves, on either side. */
  cancelledByThem: number;
  /** Whether identity has been verified by SamaanShare. */
  isVerified: boolean;
  /** Whether the email address has been confirmed. */
  emailVerified: boolean;
}

/**
 * The neutral rating a thin record is pulled towards, and how hard.
 *
 * `PRIOR_RATING` is 3.5 rather than 3: a genuinely average rental on this platform gets four stars,
 * so 3 would drag every honest record downwards and make the shrinkage read as a penalty for being
 * new rather than as uncertainty.
 *
 * `PRIOR_WEIGHT` is the number of imaginary reviews at that value. At 5, a single 5-star review
 * scores as (5 + 5×3.5) / 6 = 3.75 - visibly better than nothing and nowhere near a settled record.
 * Fifty reviews move the prior's share to under a tenth, which is where it should be.
 */
const PRIOR_RATING = 3.5;
const PRIOR_WEIGHT = 5;

/** Completed rentals at which experience stops adding. Ten is a person who clearly does this. */
const EXPERIENCE_SATURATION = 10;

/**
 * The least evidence a score may be computed from.
 *
 * One completed rental. Below that there is nothing to score - an account with a verified email and
 * no history would otherwise be handed a number built entirely out of its verification, which says
 * nothing at all about how it behaves in a rental.
 */
const MIN_COMPLETED_RENTALS = 1;

/**
 * How the four components are weighted.
 *
 * Reputation dominates but cannot win alone: a perfect rating with one rental, no verification and a
 * cancellation reaches 0.45 × ~0.75 = 0.34, well short of any badge. That is the intent - the score
 * is a claim about a *record*, and one rental is not a record.
 */
const WEIGHTS = {
  reputation: 0.45,
  experience: 0.25,
  reliability: 0.2,
  verification: 0.1,
} as const;

/** A published band. Deliberately has no negative member - see {@link trustBandFor}. */
export type TrustBand = "trusted" | "highly-trusted";

export interface TrustAssessment {
  /**
   * 0 to 1, or `null` when there is not enough evidence.
   *
   * Not rendered as a number anywhere. It exists to decide the band and to be testable; printing
   * "0.73" would imply a precision these inputs cannot support.
   */
  score: number | null;
  band: TrustBand | null;
  /** The individual components, for tests and for explaining a band rather than asserting it. */
  components: {
    reputation: number | null;
    experience: number;
    reliability: number;
    verification: number;
  };
}

/**
 * Combines a person's ratings into one shrunk value in 0..1.
 *
 * BOTH DIRECTIONS TOGETHER, which is the opposite of what the listing page does - and deliberately.
 * A listing page shows a number above a list of owner reviews, so mixing directions there would put
 * a figure next to evidence that contradicts it. A trust score makes no such claim: it is about the
 * person, and how they behave as a borrower is real evidence about how they behave.
 *
 * Weighted by each direction's own count, so a person with forty owner reviews and one renter review
 * is not treated as half a borrower.
 *
 * Returns `null` when there are no reviews at all, so the caller can drop the component rather than
 * score it as neutral - an unrated person should not be scored as if they had been rated 3.5.
 */
function reputationComponent(signals: TrustSignals): number | null {
  const rated = [signals.ownerRating, signals.renterRating].filter(
    (side): side is { average: number; count: number } =>
      side.average !== null && side.count > 0
  );

  const totalCount = rated.reduce((sum, side) => sum + side.count, 0);

  if (totalCount === 0) {
    return null;
  }

  const weightedSum = rated.reduce(
    (sum, side) => sum + side.average * side.count,
    0
  );

  // Shrinkage. The prior counts as PRIOR_WEIGHT reviews at PRIOR_RATING, so a thin record sits near
  // neutral and a thick one barely notices it.
  const shrunk =
    (weightedSum + PRIOR_RATING * PRIOR_WEIGHT) / (totalCount + PRIOR_WEIGHT);

  // 1..5 onto 0..1. A 1-star record scores 0, not 0.2 - the bottom of the scale is the bottom.
  return clamp01((shrunk - 1) / 4);
}

/**
 * Completed rentals, saturating.
 *
 * Linear growth would make trust purchasable with volume, and on a marketplace where an owner can
 * list ten cheap items that is a real route rather than a theoretical one.
 */
function experienceComponent(completedRentals: number): number {
  return clamp01(Math.max(0, completedRentals) / EXPERIENCE_SATURATION);
}

/**
 * The share of this person's finished business they did not cancel.
 *
 * Only counts cancellations they made themselves - being cancelled *on* is not evidence about you.
 * With no history at all this is 1 rather than 0: someone who has cancelled nothing has not
 * demonstrated unreliability, and starting everyone at zero here would punish inexperience twice,
 * once through this component and once through experience.
 */
function reliabilityComponent(signals: TrustSignals): number {
  const decided = signals.completedRentals + signals.cancelledByThem;

  if (decided === 0) {
    return 1;
  }

  return clamp01(signals.completedRentals / decided);
}

/**
 * How firmly the account is anchored to a real person.
 *
 * A confirmed email is worth something and nothing like identity verification - it proves control of
 * an inbox, which is minutes of work, where `isVerified` is meant to mean a document was checked. The
 * gap between 0.4 and 1 is that difference, and it is the smallest weight of the four because an
 * anchored identity says who someone is, not how they behave. Its real force is not this weight at
 * all but the gate in {@link trustBandFor}, which withholds the top band without it.
 */
function verificationComponent(signals: TrustSignals): number {
  if (signals.isVerified) {
    return 1;
  }

  return signals.emailVerified ? 0.4 : 0;
}

/**
 * Scores a person, or declines to.
 *
 * Returns `null` for the score when the record is too thin to support one, and the caller shows
 * "new to SamaanShare" rather than a low number. When reputation is absent but the rest is not - a
 * completed rental that nobody reviewed - the reputation weight is redistributed across the
 * remaining components rather than scored as zero, which would read as bad reviews rather than as
 * none.
 */
export function assessTrust(signals: TrustSignals): TrustAssessment {
  const reputation = reputationComponent(signals);
  const experience = experienceComponent(signals.completedRentals);
  const reliability = reliabilityComponent(signals);
  const verification = verificationComponent(signals);

  const components = { reputation, experience, reliability, verification };

  if (signals.completedRentals < MIN_COMPLETED_RENTALS) {
    return { score: null, band: null, components };
  }

  const parts: Array<[number, number]> =
    reputation === null
      ? [
          [experience, WEIGHTS.experience],
          [reliability, WEIGHTS.reliability],
          [verification, WEIGHTS.verification],
        ]
      : [
          [reputation, WEIGHTS.reputation],
          [experience, WEIGHTS.experience],
          [reliability, WEIGHTS.reliability],
          [verification, WEIGHTS.verification],
        ];

  const totalWeight = parts.reduce((sum, [, weight]) => sum + weight, 0);
  const score = clamp01(
    parts.reduce((sum, [value, weight]) => sum + value * weight, 0) /
      totalWeight
  );

  return {
    score,
    band: trustBandFor(score, signals.isVerified),
    components,
  };
}

/**
 * The badge a score earns, if any.
 *
 * ONLY POSITIVE BANDS EXIST, and that is the decision worth defending. A "low trust" badge on a
 * public profile is a published accusation, assembled by an algorithm out of proxies - a cancelled
 * booking might have been the other party's fault, and a thin record is mostly a statement about
 * time. Falling short earns no badge; the ratings and the rental count are still on the page, and a
 * reader can draw their own conclusion from evidence rather than from a label.
 *
 * THE TOP BAND REQUIRES A VERIFIED IDENTITY, as a gate rather than as arithmetic. Weighting
 * verification at 0.1 does not achieve this on its own - the other three components carry 0.9 of the
 * weight between them, so a flawless unverified record reaches ~0.94 and clears any threshold worth
 * setting. Expressing it as a condition says what is meant; tuning the weights until the numbers
 * happened to exclude it would hide the same rule somewhere nobody could find it.
 *
 * The distinction is real: everything else here is behaviour reported by other users, which a
 * determined person can manufacture. "Highly trusted" is the strongest claim this platform makes
 * about a stranger, and it should rest on something outside the reputation system.
 */
export function trustBandFor(
  score: number,
  isVerified: boolean
): TrustBand | null {
  if (score >= 0.8 && isVerified) {
    return "highly-trusted";
  }

  if (score >= 0.6) {
    return "trusted";
  }

  return null;
}

/** What each band says on a profile. */
export const TRUST_BAND_LABELS: Readonly<Record<TrustBand, string>> = {
  trusted: "Trusted member",
  "highly-trusted": "Highly trusted",
};

/**
 * What each band means, for the tooltip.
 *
 * Describes the evidence rather than promising anything. SamaanShare does not hold deposits or
 * guarantee rentals, and a badge whose explanation implied otherwise would be a promise the platform
 * cannot keep - the same line the payment copy draws.
 */
export const TRUST_BAND_DESCRIPTIONS: Readonly<Record<TrustBand, string>> = {
  trusted:
    "A solid record of completed rentals and good reviews from the people on the other side of them.",
  "highly-trusted":
    "A long record of completed rentals, consistently good reviews, and a verified identity.",
};

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}
