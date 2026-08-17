import { prisma } from "@/lib/prisma";
import { publishReviews } from "@/lib/reviews/publish";
import { reviewWindowCloses } from "@/lib/reviews/rules";

/**
 * Lazy release of withheld reviews whose window has closed.
 *
 * WHY LAZY RATHER THAN SCHEDULED, and this is the same argument as `expireStalePendingBookings`. A
 * review withheld pending its counterpart needs something to release it when that counterpart never
 * arrives. A cron job is the textbook answer, but a cron that silently stops running would leave
 * reviews invisible forever, ratings permanently understated, and nothing in the app would notice.
 * Sweeping on the read paths that care means release cannot rot: if anyone is looking at the reviews
 * for a listing or a person, the overdue ones are published first, by definition.
 *
 * The cost is a small write on some reads. It is bounded - the query is indexed on `publishedAt` and
 * usually matches nothing - and idempotent, because `publishReviews` guards on `publishedAt: null`.
 *
 * WHAT IT DOES NOT DO. It never moves the booking to `REVIEWED`. That status means both parties
 * reviewed; a review released because the other side stayed silent is precisely the case where they
 * did not, so the booking correctly ends at `COMPLETED`.
 */

/**
 * Ceiling on one sweep.
 *
 * A backlog is released over several reads rather than in one long transaction holding a connection
 * while it recomputes hundreds of aggregates. Ordered oldest-first, so the longest-withheld reviews
 * are always the ones that go.
 */
const MAX_RELEASE_BATCH = 50;

/**
 * Publishes withheld reviews past their window and refreshes the affected ratings.
 *
 * Scoped to one reviewee when given an id, which is the common case: a listing page or a profile
 * only cares about the person being shown, and sweeping the whole table on every page view would be
 * wasteful.
 *
 * Returns how many were published, mostly so callers can log or test it.
 */
export async function releaseDueReviews(revieweeId?: string): Promise<number> {
  const now = new Date();

  /**
   * A review is due when its booking completed longer ago than the window.
   *
   * Filtered by `booking.completedAt` rather than by the review's own `createdAt`: the window is
   * measured from the end of the rental, so a review written on day 13 is released on day 14 along
   * with one written on day 1 - not given a fresh fourteen days of its own.
   */
  const due = await prisma.review.findMany({
    where: {
      publishedAt: null,
      // Defensive: only a released review can be reported, so a withheld-and-removed row should not
      // exist. If one ever does, publishing it here would make moderation reversible by waiting.
      removedAt: null,
      ...(revieweeId ? { revieweeId } : {}),
      booking: {
        completedAt: { not: null, lte: cutoffFor(now) },
      },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_RELEASE_BATCH,
    select: { id: true },
  });

  if (due.length === 0) {
    return 0;
  }

  return prisma.$transaction((tx) =>
    publishReviews(
      tx,
      due.map((review) => review.id),
      now
    )
  );
}

/**
 * The latest `completedAt` that is still inside the window.
 *
 * Derived from `reviewWindowCloses` rather than re-deriving the arithmetic, so the query and the
 * pure predicate cannot disagree about the boundary - which would show a review as releasable on one
 * screen and withheld on another.
 */
function cutoffFor(now: Date): Date {
  const windowMs =
    reviewWindowCloses(new Date(0)).getTime() - new Date(0).getTime();

  return new Date(now.getTime() - windowMs);
}
