import { ReviewType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { releaseDueReviews } from "@/lib/reviews/release";

/**
 * Public review reads.
 *
 * Every one of these sweeps overdue releases first - see `releaseDueReviews`. That is the other half
 * of lazy publication: without it a review whose window closed last week would stay invisible until
 * something else happened to trigger a sweep, and the rating shown would be permanently understated.
 *
 * PUBLISHED ONLY, everywhere. `publishedAt: { not: null }` is not a display preference; a withheld
 * review must not leave the server, or reciprocal release is decorative.
 */

/** Reviews shown per page on a listing. */
export const REVIEWS_PAGE_SIZE = 5;

export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  publishedAt: Date;
  /**
   * Name only - never an email.
   *
   * The id is here so the page can hide its own Report button from the person who wrote the review.
   * The server refuses a self-report regardless; this only avoids offering a form that would then
   * be rejected. An id is not sensitive - the owner's is already on this page - but the email is,
   * and it is still not selected.
   */
  reviewer: { id: string; name: string | null };
}

export interface OwnerReviewSummary {
  items: PublicReview[];
  total: number;
  /**
   * The stored `asOwner` aggregate: released reviews only, and this direction only, so it describes
   * precisely the reviews in `items`.
   */
  average: number | null;
  count: number;
}

/**
 * The reviews an owner has received as an owner, for their listing pages.
 *
 * Filtered to `RENTER_TO_OWNER`. A person can be reviewed in both directions - as an owner letting
 * an item out, and as a renter borrowing one - and mixing them on a listing page would answer the
 * wrong question: a browser wants to know what it is like to rent *from* this person, not what they
 * are like as a customer.
 *
 * The average returned alongside them is `ownerRatingAverage`, which aggregates exactly the same set
 * of reviews the list is drawn from. That correspondence is the point: while a single mixed
 * aggregate was stored, this function returned a number computed over reviews it was not showing, so
 * a reader could see 4.8 above a list averaging 3.2 with nothing to explain the gap.
 */
export async function getOwnerReviews(
  ownerId: string,
  page = 1,
  pageSize = REVIEWS_PAGE_SIZE
): Promise<OwnerReviewSummary> {
  return getReceivedReviews({
    userId: ownerId,
    type: ReviewType.RENTER_TO_OWNER,
    page,
    pageSize,
  });
}

interface ReceivedReviewsOptions {
  userId: string;
  type: ReviewType;
  page?: number;
  pageSize?: number;
}

/**
 * Reviews received in one direction, with the matching stored aggregate.
 *
 * The general form of {@link getOwnerReviews}, added for the public profile, which shows both
 * directions as separate sections. The aggregate returned is always the one for the direction being
 * listed - `ownerRating*` for `RENTER_TO_OWNER`, `renterRating*` for `OWNER_TO_RENTER` - so the
 * figure above a list always describes that list. Passing the wrong pair here would reintroduce
 * exactly the mismatch the directional split removed.
 */
export async function getReceivedReviews({
  userId,
  type,
  page = 1,
  pageSize = REVIEWS_PAGE_SIZE,
}: ReceivedReviewsOptions): Promise<OwnerReviewSummary> {
  await releaseDueReviews(userId);

  const currentPage = Math.max(1, Math.trunc(page));
  const asOwner = type === ReviewType.RENTER_TO_OWNER;

  const where = {
    revieweeId: userId,
    type,
    publishedAt: { not: null },
    // Moderator-removed reviews are gone from every public surface. The same predicate governs the
    // stored aggregate, so the count above the list and the list itself stay in agreement.
    removedAt: null,
  } as const;

  // Concurrent reads, not a transaction - see the note in `getActiveListings`.
  const [rows, total, subject] = await Promise.all([
    prisma.review.findMany({
      where,
      // Newest first: the most recent experience of this owner is the most useful one.
      orderBy: { publishedAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        rating: true,
        comment: true,
        publishedAt: true,
        reviewer: { select: { id: true, name: true } },
      },
    }),
    prisma.review.count({ where }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        ownerRatingAverage: true,
        ownerRatingCount: true,
        renterRatingAverage: true,
        renterRatingCount: true,
      },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      // Non-null by the predicate; asserted here so the public type has no nullable date.
      publishedAt: row.publishedAt as Date,
      reviewer: row.reviewer,
    })),
    total,
    // The pair matching the direction being listed, never the other one.
    average:
      (asOwner ? subject?.ownerRatingAverage : subject?.renterRatingAverage) ??
      null,
    count:
      (asOwner ? subject?.ownerRatingCount : subject?.renterRatingCount) ?? 0,
  };
}

/**
 * Both directions of a person's rating at once, for the profile header and the trust score.
 *
 * This is `getUserReviewStats` from docs/API.md:691, finally implementable: it specified
 * `asOwner`/`asRenter` from the start, and until the directional split there were no columns to
 * answer it with.
 *
 * DEVIATES FROM THAT SPEC IN ONE WAY. The document types the averages as `number`; they are
 * `number | null` here, because an unrated person is not rated zero - zero would sort below every
 * real rating and read as "rated badly" rather than "not yet rated". The same decision the aggregate
 * itself makes.
 */
export interface UserReviewStats {
  asOwner: { average: number | null; count: number };
  asRenter: { average: number | null; count: number };
  /** Reviews received in total, across both directions. */
  totalReviews: number;
}

export async function getUserReviewStats(
  userId: string
): Promise<UserReviewStats> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ownerRatingAverage: true,
      ownerRatingCount: true,
      renterRatingAverage: true,
      renterRatingCount: true,
    },
  });

  const asOwner = {
    average: user?.ownerRatingAverage ?? null,
    count: user?.ownerRatingCount ?? 0,
  };
  const asRenter = {
    average: user?.renterRatingAverage ?? null,
    count: user?.renterRatingCount ?? 0,
  };

  return {
    asOwner,
    asRenter,
    // A count, not an average. Averaging the two averages would weight one review as heavily as
    // fifty, and there is no honest single number to report here anyway.
    totalReviews: asOwner.count + asRenter.count,
  };
}
