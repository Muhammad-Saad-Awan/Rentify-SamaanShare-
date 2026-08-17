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
  /** Name only - never an email. */
  reviewer: { name: string | null };
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
  await releaseDueReviews(ownerId);

  const currentPage = Math.max(1, Math.trunc(page));

  const where = {
    revieweeId: ownerId,
    type: ReviewType.RENTER_TO_OWNER,
    publishedAt: { not: null },
  } as const;

  // Concurrent reads, not a transaction - see the note in `getActiveListings`.
  const [rows, total, owner] = await Promise.all([
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
        reviewer: { select: { name: true } },
      },
    }),
    prisma.review.count({ where }),
    prisma.user.findUnique({
      where: { id: ownerId },
      select: { ownerRatingAverage: true, ownerRatingCount: true },
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
    average: owner?.ownerRatingAverage ?? null,
    count: owner?.ownerRatingCount ?? 0,
  };
}
