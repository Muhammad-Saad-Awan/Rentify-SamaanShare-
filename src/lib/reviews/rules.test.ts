import { describe, expect, it } from "vitest";

import { BookingStatus, ReviewType } from "@/generated/prisma/enums";
import {
  canReviewBooking,
  isReviewWindowClosed,
  RATING_MAX,
  RATING_MIN,
  ratingAggregate,
  ratingAggregatesByDirection,
  releasesOnSubmit,
  REVIEW_WINDOW_DAYS,
  reviewTypeFor,
  reviewWindowCloses,
  shouldReleaseOnWindowClose,
} from "@/lib/reviews/rules";

/**
 * Review rules.
 *
 * The load-bearing assertions here are the eligibility gate (a review must follow a real completed
 * rental) and the aggregate's treatment of an empty set - `0` would sort a brand-new owner below the
 * worst-reviewed one on a shipped filter.
 */

const completedAt = new Date("2026-08-01T12:00:00.000Z");
const daysAfter = (d: number) =>
  new Date(completedAt.getTime() + d * 24 * 60 * 60 * 1000);

describe("reviewWindowCloses", () => {
  it("is exactly the window after completion", () => {
    expect(reviewWindowCloses(completedAt).toISOString()).toBe(
      daysAfter(REVIEW_WINDOW_DAYS).toISOString()
    );
  });
});

describe("isReviewWindowClosed", () => {
  it("is open inside the window", () => {
    expect(isReviewWindowClosed(completedAt, daysAfter(13))).toBe(false);
  });

  it("is closed at the boundary", () => {
    // `>=`, matching the booking expiry convention rather than contradicting it.
    expect(
      isReviewWindowClosed(completedAt, daysAfter(REVIEW_WINDOW_DAYS))
    ).toBe(true);
  });

  it("is closed after the window", () => {
    expect(isReviewWindowClosed(completedAt, daysAfter(30))).toBe(true);
  });
});

describe("reviewTypeFor", () => {
  /**
   * Derived from the caller's role, never from input. A client-supplied type would let a renter file
   * an OWNER_TO_RENTER review - attaching their words to the owner's record and aiming the rating at
   * themselves.
   */
  it("maps each side to the direction it can write", () => {
    expect(reviewTypeFor("owner")).toBe(ReviewType.OWNER_TO_RENTER);
    expect(reviewTypeFor("renter")).toBe(ReviewType.RENTER_TO_OWNER);
  });

  it("covers both directions of the enum", () => {
    expect(new Set([reviewTypeFor("owner"), reviewTypeFor("renter")])).toEqual(
      new Set(Object.values(ReviewType))
    );
  });
});

describe("canReviewBooking", () => {
  const base = {
    status: BookingStatus.COMPLETED,
    completedAt,
    alreadyReviewed: false,
    now: daysAfter(1),
  };

  it("allows a first review inside the window", () => {
    expect(canReviewBooking(base)).toEqual({ allowed: true });
  });

  it("allows a review when the booking already reached REVIEWED", () => {
    // Reachable in some orderings; `alreadyReviewed` is what actually prevents a duplicate.
    expect(
      canReviewBooking({ ...base, status: BookingStatus.REVIEWED }).allowed
    ).toBe(true);
  });

  it("refuses a second review from the same person", () => {
    expect(canReviewBooking({ ...base, alreadyReviewed: true })).toMatchObject({
      allowed: false,
      reason: expect.stringContaining("already reviewed"),
    });
  });

  it("tells an active renter to wait rather than refusing flatly", () => {
    expect(
      canReviewBooking({ ...base, status: BookingStatus.ACTIVE })
    ).toMatchObject({
      allowed: false,
      reason: expect.stringContaining("once the rental is complete"),
    });
  });

  /**
   * The rule that stops a rating being a weapon: a booking that never happened cannot be reviewed.
   * A cancelled or declined request would otherwise be a free shot at someone's record.
   */
  it("refuses every status that is not a finished rental", () => {
    for (const status of [
      BookingStatus.PENDING,
      BookingStatus.APPROVED,
      BookingStatus.PAYMENT_PENDING,
      BookingStatus.ACTIVE,
      BookingStatus.DECLINED,
      BookingStatus.CANCELLED,
      BookingStatus.EXPIRED,
    ]) {
      expect(canReviewBooking({ ...base, status }).allowed).toBe(false);
    }
  });

  it("refuses once the window has closed", () => {
    expect(
      canReviewBooking({ ...base, now: daysAfter(REVIEW_WINDOW_DAYS) })
    ).toMatchObject({
      allowed: false,
      reason: expect.stringContaining("window"),
    });
  });

  it("refuses a completed booking with no completion timestamp", () => {
    // Unreachable in practice - `completeBooking` writes both in one transaction - but dating the
    // window from `now` instead would silently grant a fresh fourteen days.
    expect(canReviewBooking({ ...base, completedAt: null }).allowed).toBe(
      false
    );
  });
});

describe("releasesOnSubmit", () => {
  it("does not release the first review", () => {
    expect(releasesOnSubmit(0)).toBe(false);
  });

  it("releases once the second arrives", () => {
    expect(releasesOnSubmit(1)).toBe(true);
  });
});

describe("shouldReleaseOnWindowClose", () => {
  it("keeps a review withheld while the other side can still answer", () => {
    expect(shouldReleaseOnWindowClose(completedAt, daysAfter(5))).toBe(false);
  });

  it("releases it unanswered once the window shuts", () => {
    expect(
      shouldReleaseOnWindowClose(completedAt, daysAfter(REVIEW_WINDOW_DAYS))
    ).toBe(true);
  });
});

describe("ratingAggregate", () => {
  /**
   * The important case. `0` would sort below every real rating on the shipped sort-by-rating filter,
   * burying a brand-new owner beneath the worst-reviewed one - "not yet rated" is not "rated badly".
   */
  it("reports null, not zero, for no reviews", () => {
    expect(ratingAggregate([])).toEqual({ average: null, count: 0 });
  });

  it("averages a single rating to itself", () => {
    expect(ratingAggregate([4])).toEqual({ average: 4, count: 1 });
  });

  it("rounds to two decimal places", () => {
    // Unrounded this is 4.333333333333333, which renders differently in different places.
    expect(ratingAggregate([4, 4, 5])).toEqual({ average: 4.33, count: 3 });
  });

  it("handles the extremes of the scale", () => {
    expect(ratingAggregate([RATING_MIN, RATING_MAX])).toEqual({
      average: 3,
      count: 2,
    });
  });

  it("counts every rating it was given", () => {
    expect(ratingAggregate([5, 5, 5, 1]).count).toBe(4);
    expect(ratingAggregate([5, 5, 5, 1]).average).toBe(4);
  });
});

describe("ratingAggregatesByDirection", () => {
  const asOwner = (rating: number) => ({
    rating,
    type: ReviewType.RENTER_TO_OWNER,
  });
  const asRenter = (rating: number) => ({
    rating,
    type: ReviewType.OWNER_TO_RENTER,
  });

  /**
   * THE REASON THIS FUNCTION EXISTS.
   *
   * One mixed average over both directions meant a listing page could print a figure that
   * contradicted the reviews printed directly beneath it - here, 4.0 over a list averaging 2.0.
   */
  it("keeps a strong renter record out of the owner average", () => {
    const split = ratingAggregatesByDirection([
      asOwner(2),
      asOwner(2),
      asRenter(5),
      asRenter(5),
    ]);

    expect(split.asOwner).toEqual({ average: 2, count: 2 });
    expect(split.asRenter).toEqual({ average: 5, count: 2 });
  });

  /**
   * Direction is named from the reviewee's side. A `RENTER_TO_OWNER` review was *written by* a renter
   * and rates its subject as an owner; reading it the other way would file every rating on the wrong
   * half of the profile, and every average would still look plausible.
   */
  it("files a RENTER_TO_OWNER review under asOwner", () => {
    const split = ratingAggregatesByDirection([asOwner(3)]);

    expect(split.asOwner.count).toBe(1);
    expect(split.asRenter.count).toBe(0);
  });

  it("files an OWNER_TO_RENTER review under asRenter", () => {
    const split = ratingAggregatesByDirection([asRenter(3)]);

    expect(split.asRenter.count).toBe(1);
    expect(split.asOwner.count).toBe(0);
  });

  /** Both halves inherit the empty-set rule, so an unrented owner is not "rated 0" on either side. */
  it("reports null on a direction with no reviews", () => {
    const split = ratingAggregatesByDirection([asOwner(4)]);

    expect(split.asRenter).toEqual({ average: null, count: 0 });
  });

  it("reports null on both sides for someone never reviewed", () => {
    expect(ratingAggregatesByDirection([])).toEqual({
      asOwner: { average: null, count: 0 },
      asRenter: { average: null, count: 0 },
    });
  });

  /** Rounding is delegated, so the two halves cannot round differently from each other. */
  it("rounds each direction to two places independently", () => {
    const split = ratingAggregatesByDirection([
      asOwner(4),
      asOwner(4),
      asOwner(5),
      asRenter(1),
      asRenter(2),
      asRenter(2),
    ]);

    expect(split.asOwner.average).toBe(4.33);
    expect(split.asRenter.average).toBe(1.67);
  });
});
