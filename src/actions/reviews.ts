"use server";

import { revalidatePath } from "next/cache";

import { BookingStatus } from "@/generated/prisma/enums";
import { getActiveUser } from "@/lib/auth/session";
import { transitionBooking } from "@/lib/bookings/guard";
import { canTransition } from "@/lib/bookings/lifecycle";
import { emitBookingNotifications } from "@/lib/notifications/create";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { publishReviews } from "@/lib/reviews/publish";
import {
  canReviewBooking,
  releasesOnSubmit,
  reviewTypeFor,
} from "@/lib/reviews/rules";
import { createReviewSchema } from "@/lib/validations/review";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ActionResult } from "@/types";

/**
 * Writing a review.
 *
 * THE DIRECTION IS DERIVED, NEVER ACCEPTED. Which side the caller is on comes from comparing the
 * session against the booking's `ownerId` and `renterId`; `type`, `revieweeId` and `reviewerId` are
 * computed from that. A client-supplied `type` would let a renter file an `OWNER_TO_RENTER` review -
 * their words attached to the owner's record, the rating aimed at themselves.
 *
 * RECIPROCAL RELEASE. The first review is written withheld (`publishedAt: null`). The second releases
 * both, in the same transaction that writes it, so neither party can read the other's before their own
 * is committed. A review that is never answered is released by the lazy sweep once the window closes.
 *
 * The stored rating is recomputed only when a review is released - see `publishReviews`. Moving it on
 * submission would leak the withheld review's content through the average.
 */

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

/** Reviews per user per hour. A person writes one per completed rental; a script would not. */
const REVIEW_RATE_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 };

export async function createReview(
  input: unknown
): Promise<ActionResult<{ published: boolean }>> {
  const parsed = createReviewSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the review.",
    };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(`review:${user.id}`, REVIEW_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many reviews just now. Please try again shortly.",
    };
  }

  const { bookingId, rating, comment } = parsed.data;

  try {
    /**
     * Loaded without scoping to a side, then the side is decided below.
     *
     * Unlike the booking actions, this one serves both parties, so the `where` cannot name a single
     * role column. Membership is still enforced - a caller who is neither owner nor renter gets the
     * same "not found" as a booking that does not exist, so this cannot be used to probe ids.
     */
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        OR: [{ ownerId: user.id }, { renterId: user.id }],
      },
      select: {
        id: true,
        status: true,
        listingId: true,
        ownerId: true,
        renterId: true,
        completedAt: true,
        listing: { select: { title: true } },
        reviews: { select: { id: true, reviewerId: true } },
      },
    });

    if (!booking) {
      return { success: false, error: "That rental was not found." };
    }

    const side = booking.ownerId === user.id ? "owner" : "renter";

    const eligibility = canReviewBooking({
      status: booking.status,
      completedAt: booking.completedAt,
      alreadyReviewed: booking.reviews.some(
        (review) => review.reviewerId === user.id
      ),
    });

    if (!eligibility.allowed) {
      return { success: false, error: eligibility.reason };
    }

    // The counterpart's review, if they have already written one. Its presence is what decides
    // whether this submission releases both.
    const existing = booking.reviews.filter(
      (review) => review.reviewerId !== user.id
    );

    const releases = releasesOnSubmit(existing.length);

    const outcome = await prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          bookingId: booking.id,
          reviewerId: user.id,
          // The other party. Derived, never supplied.
          revieweeId: side === "owner" ? booking.renterId : booking.ownerId,
          type: reviewTypeFor(side),
          rating,
          ...(comment ? { comment } : {}),
          // Withheld on write. Released below only if this is the second review.
          publishedAt: null,
        },
        select: { id: true },
      });

      if (!releases) {
        return { published: false };
      }

      /**
       * Both reviews become visible together, and both ratings are recomputed here.
       *
       * In the same transaction as the write, so there is no instant where one review is readable
       * and the other is not - which is the whole property reciprocal release exists to provide.
       */
      await publishReviews(tx, [created.id, ...existing.map((r) => r.id)]);

      /**
       * Both parties have now reviewed, which is exactly what REVIEWED means.
       *
       * Guarded by the same compare-and-swap as every other transition, and tolerant of failure: if
       * the booking has moved on, the reviews are still correctly published. The status is a
       * convenience for the dashboards, not the source of truth for whether reviews exist.
       */
      if (canTransition(booking.status, BookingStatus.REVIEWED)) {
        await transitionBooking(tx, {
          bookingId: booking.id,
          from: booking.status,
          to: BookingStatus.REVIEWED,
        });
      }

      await emitBookingNotifications(tx, {
        event: "reviews-published",
        bookingId: booking.id,
        listingTitle: booking.listing.title,
        parties: { renterId: booking.renterId, ownerId: booking.ownerId },
      });

      return { published: true };
    });

    revalidateReviewPaths(booking.listingId);

    return { success: true, data: outcome };
  } catch (error) {
    console.error("createReview failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * Refreshes the surfaces a review changes.
 *
 * The listing's public page shows its owner's reviews and rating, and both dashboards show whether a
 * rental still needs one. `/listings` is included because the browse ordering has a sort-by-rating
 * option that reads the aggregate this just moved.
 */
function revalidateReviewPaths(listingId: string): void {
  for (const path of [
    "/dashboard/bookings",
    "/dashboard/requests",
    "/dashboard/notifications",
    `/listings/${listingId}`,
    "/listings",
  ]) {
    revalidatePath(path, "page");
  }

  revalidatePath("/dashboard", "layout");
}
