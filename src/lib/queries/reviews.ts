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
  /** The stored aggregate, which counts released reviews only. */
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
 * Note the consequence, recorded rather than hidden: `User.ratingAverage` is a single aggregate over
 * *both* directions, so the average returned here can disagree with the listed reviews when someone
 * has rented as well as let out. Splitting the aggregate needs two more columns and a migration; the
 * `[revieweeId, type]` index exists for when that happens.
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
      select: { ratingAverage: true, ratingCount: true },
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
    average: owner?.ratingAverage ?? null,
    count: owner?.ratingCount ?? 0,
  };
}
