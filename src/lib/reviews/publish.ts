import { ratingAggregate } from "@/lib/reviews/rules";

import type { Prisma } from "@/generated/prisma/client";

/**
 * Releasing reviews and keeping the rating aggregate honest.
 *
 * WHY THESE TWO THINGS LIVE TOGETHER. `User.ratingAverage` counts released reviews only - if it
 * moved when a review was written, an owner watching their average drop would know the renter left
 * a bad one before being able to read it, and could retaliate in their own. So publishing a review
 * and recomputing the aggregate are one operation, not two, and they must happen in one transaction:
 * a release without the recompute leaves a visible review that no rating reflects, which is worse
 * than either alone because nothing would ever detect it.
 *
 * Both callers - `createReview` on the second submission, and the lazy sweep at window close - go
 * through {@link publishReviews}. That is deliberate: two code paths releasing reviews by different
 * means is how one of them ends up forgetting the aggregate.
 */

/** The subset of the client this needs, so both `prisma` and a `$transaction` callback satisfy it. */
export type ReviewPublisher = Pick<Prisma.TransactionClient, "review" | "user">;

/**
 * Recomputes one user's stored rating from their released reviews.
 *
 * Reads the ratings rather than trying to adjust the stored average incrementally. An incremental
 * update is tempting and wrong: it drifts as soon as one write is lost or replayed, and there is no
 * way to notice. A full recount is a single indexed read over one user's reviews - `[revieweeId,
 * publishedAt]` covers it exactly - and it is self-healing, so a bad historical value corrects
 * itself the next time anything about that user is reviewed.
 */
export async function recomputeUserRating(
  client: ReviewPublisher,
  userId: string
): Promise<{ average: number | null; count: number }> {
  const rows = await client.review.findMany({
    // `publishedAt: { not: null }` is the whole point - a withheld review must not move the number.
    where: { revieweeId: userId, publishedAt: { not: null } },
    select: { rating: true },
  });

  const aggregate = ratingAggregate(rows.map((row) => row.rating));

  await client.user.update({
    where: { id: userId },
    data: {
      ratingAverage: aggregate.average,
      ratingCount: aggregate.count,
    },
  });

  return aggregate;
}

/**
 * Publishes reviews and refreshes every affected user's rating.
 *
 * Guarded on `publishedAt: null`, so a concurrent submit and sweep cannot both publish the same
 * review and double-stamp its timestamp - the same compare-and-swap the booking transitions use.
 * Returns how many were actually published, which is how the caller knows whether it was the one
 * that won.
 *
 * The aggregate is recomputed for the *reviewees* of the published reviews, deduplicated: a mutual
 * release touches two different users, and a sweep over many bookings can touch the same user twice.
 */
export async function publishReviews(
  client: ReviewPublisher,
  reviewIds: readonly string[],
  now: Date = new Date()
): Promise<number> {
  if (reviewIds.length === 0) {
    return 0;
  }

  // Read the reviewees before publishing: afterwards the same query would still work, but reading
  // first keeps the set stable if another writer is releasing an overlapping batch.
  const affected = await client.review.findMany({
    where: { id: { in: [...reviewIds] }, publishedAt: null },
    select: { id: true, revieweeId: true },
  });

  if (affected.length === 0) {
    return 0;
  }

  const published = await client.review.updateMany({
    where: { id: { in: affected.map((r) => r.id) }, publishedAt: null },
    data: { publishedAt: now },
  });

  if (published.count === 0) {
    return 0;
  }

  for (const userId of new Set(affected.map((r) => r.revieweeId))) {
    await recomputeUserRating(client, userId);
  }

  return published.count;
}
