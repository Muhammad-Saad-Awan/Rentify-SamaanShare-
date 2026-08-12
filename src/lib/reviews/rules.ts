import { BookingStatus, ReviewType } from "@/generated/prisma/enums";

/**
 * Review rules. Pure, so all of this is testable without a database.
 *
 * THREE PROPERTIES THIS EXISTS TO PROTECT.
 *
 * 1. A review can only follow a completed rental. Anything earlier is a review of something that
 *    did not happen, and would let a cancelled booking be used to attack someone's rating.
 *
 * 2. Reviews are released reciprocally - withheld until the counterpart submits, or until the
 *    window closes. Whoever writes second would otherwise read the first and answer it, and
 *    ratings compress towards 5 because nobody risks going first. A rating everyone gives 5 to
 *    carries no information, which makes the whole feature decorative.
 *
 * 3. The stored aggregate counts released reviews ONLY. This is the non-obvious one: if
 *    `User.ratingAverage` moved when a review was written, an owner watching their average drop
 *    would know the renter left a bad review before being able to read it - and could retaliate in
 *    their own. That leak would defeat point 2 entirely, which is why release is a stamped event
 *    rather than a predicate.
 */

/**
 * How long after completion a review may still be written.
 *
 * Fourteen days. Long enough that someone who travelled or forgot still gets to say something;
 * short enough that a rental is fresh in mind and a rating reflects the rental rather than a later
 * grievance. It is also the point at which a withheld review is released unanswered - see
 * {@link shouldReleaseOnWindowClose}.
 */
export const REVIEW_WINDOW_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Bounds on the comment, shared by the schema and the form. */
export const REVIEW_COMMENT_MAX = 1000;

/** The rating scale. Integers only - an average is computed, but a vote is a whole star. */
export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** When the review window shuts for a rental completed at `completedAt`. */
export function reviewWindowCloses(completedAt: Date): Date {
  return new Date(completedAt.getTime() + REVIEW_WINDOW_DAYS * DAY_MS);
}

/** Whether the window has shut. Closed at the boundary, matching the booking expiry convention. */
export function isReviewWindowClosed(
  completedAt: Date,
  now: Date = new Date()
): boolean {
  return now.getTime() >= reviewWindowCloses(completedAt).getTime();
}

/**
 * Which direction a review runs, given who is writing it.
 *
 * Derived from the caller's role in the booking, NEVER from input. A client-supplied `type` would
 * let a renter file an `OWNER_TO_RENTER` review - attaching their own words to the owner's record
 * and pointing the rating at themselves.
 */
export function reviewTypeFor(side: "owner" | "renter"): ReviewType {
  return side === "owner"
    ? ReviewType.OWNER_TO_RENTER
    : ReviewType.RENTER_TO_OWNER;
}

export type ReviewEligibility =
  { allowed: true } | { allowed: false; reason: string };

interface ReviewEligibilityInput {
  status: BookingStatus;
  /** `null` until the rental completes. */
  completedAt: Date | null;
  /** Whether this caller has already reviewed this booking. */
  alreadyReviewed: boolean;
  now?: Date;
}

/**
 * Whether this party may write a review for this booking now.
 *
 * `REVIEWED` is permitted as well as `COMPLETED`: the booking reaches `REVIEWED` when *both* sides
 * have written, so by definition a caller who has not yet written cannot be looking at one - but the
 * status is also reached by the release sweep in some orderings, and refusing on status alone would
 * silently drop a legitimate second review. `alreadyReviewed` is the check that actually prevents a
 * duplicate, backed by `@@unique([bookingId, reviewerId])`.
 */
export function canReviewBooking({
  status,
  completedAt,
  alreadyReviewed,
  now = new Date(),
}: ReviewEligibilityInput): ReviewEligibility {
  if (alreadyReviewed) {
    return {
      allowed: false,
      reason: "You have already reviewed this rental.",
    };
  }

  if (status !== BookingStatus.COMPLETED && status !== BookingStatus.REVIEWED) {
    return {
      allowed: false,
      reason:
        status === BookingStatus.ACTIVE
          ? "You can leave a review once the rental is complete."
          : "Only completed rentals can be reviewed.",
    };
  }

  if (!completedAt) {
    // Defensive: COMPLETED without a timestamp should be unreachable, since `completeBooking`
    // writes both in one transaction. Refusing is safer than dating the window from now.
    return {
      allowed: false,
      reason: "This rental has no completion date recorded.",
    };
  }

  if (isReviewWindowClosed(completedAt, now)) {
    return {
      allowed: false,
      reason: `The ${REVIEW_WINDOW_DAYS}-day window for reviewing this rental has closed.`,
    };
  }

  return { allowed: true };
}

/**
 * Whether writing this review releases both.
 *
 * True when it is the second of the two. The caller stamps `publishedAt` on both in the same
 * transaction, so neither side can read the other's before their own is committed.
 */
export function releasesOnSubmit(existingReviewCount: number): boolean {
  return existingReviewCount >= 1;
}

/**
 * Whether a still-withheld review should now be released unanswered.
 *
 * The other side never wrote one, so there is nothing to be influenced by and no reason to keep
 * withholding. Evaluated lazily on the read paths that care, not by a scheduler - a cron that
 * stopped running would leave reviews withheld indefinitely with nothing noticing, which is the
 * same reasoning as `expireStalePendingBookings`.
 */
export function shouldReleaseOnWindowClose(
  completedAt: Date,
  now: Date = new Date()
): boolean {
  return isReviewWindowClosed(completedAt, now);
}

/**
 * The rating aggregate for a set of released ratings.
 *
 * Rounded to two decimal places. `ratingAverage` is a `Float` rather than a `Decimal` deliberately -
 * it is not currency, and an average of integers 1-5 needs no exact decimal representation - but
 * leaving it unrounded would store 4.333333333333333 and render it differently in different places.
 *
 * An empty set yields `null`, not `0`. Zero would sort below every real rating and read as "rated
 * badly" rather than "not yet rated", and the sort-by-rating ordering would bury every new owner
 * beneath the worst-reviewed one.
 */
export function ratingAggregate(ratings: readonly number[]): {
  average: number | null;
  count: number;
} {
  if (ratings.length === 0) {
    return { average: null, count: 0 };
  }

  const total = ratings.reduce((sum, rating) => sum + rating, 0);

  return {
    average: Math.round((total / ratings.length) * 100) / 100,
    count: ratings.length,
  };
}
