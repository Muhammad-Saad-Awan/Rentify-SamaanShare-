import { cache } from "react";

import { BookingStatus, UserStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { VISIBLE_LISTING_WHERE } from "@/lib/queries/visibility";
import { assessTrust } from "@/lib/trust/score";

import type { ListingCardData } from "@/lib/queries/listings";
import type { TrustAssessment } from "@/lib/trust/score";

/**
 * The public profile of a member.
 *
 * WHO IS VISIBLE, AND WHY THE RULE MATCHES LISTINGS. A suspended, banned or soft-deleted account
 * must 404 here, exactly as `VISIBLE_LISTING_WHERE` hides their listings. Users are never physically
 * deleted (D3), so without this clause a banned account would keep a public page complete with its
 * rating and its history - and moderation would visibly not have worked.
 *
 * WHAT IS NOT SELECTED: `email` and `phone`. A profile is a page anyone can open, and neither is
 * needed to decide whether to rent from someone. `getDisplayName` falls back to the local part of an
 * email address, which is why the column is not fetched at all - the fallback cannot fire on data
 * that was never loaded.
 */

export interface PublicProfile {
  id: string;
  name: string | null;
  bio: string | null;
  city: string | null;
  image: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  memberSince: Date;
  ownerRating: { average: number | null; count: number };
  renterRating: { average: number | null; count: number };
  /** Rentals carried to completion, on either side. The denominator behind everything else. */
  completedRentals: number;
  /** How many listings this person currently has visible. */
  activeListings: number;
  trust: TrustAssessment;
}

/**
 * One publicly visible member, or `null`.
 *
 * Wrapped in React's `cache()` for the same reason as `getListingDetail`: three callers need it per
 * request - the route's layout, which validates the id before anything streams, the page, and
 * `generateMetadata`. Without memoisation that is three identical round trips.
 */
export const getPublicProfile = cache(
  async (id: string): Promise<PublicProfile | null> => {
    const user = await prisma.user.findFirst({
      where: { id, status: UserStatus.ACTIVE, deletedAt: null },
      select: {
        id: true,
        name: true,
        bio: true,
        city: true,
        image: true,
        avatarUrl: true,
        isVerified: true,
        emailVerified: true,
        createdAt: true,
        ownerRatingAverage: true,
        ownerRatingCount: true,
        renterRatingAverage: true,
        renterRatingCount: true,
      },
    });

    if (!user) {
      return null;
    }

    const [completedRentals, cancelledByThem, activeListings] =
      await Promise.all([
        /**
         * Finished rentals on either side.
         *
         * `REVIEWED` counts as well as `COMPLETED` - it is the same finished rental with both
         * reviews written, and omitting it would make the most engaged users look the least
         * experienced, which is precisely backwards.
         */
        prisma.booking.count({
          where: {
            OR: [{ ownerId: user.id }, { renterId: user.id }],
            status: {
              in: [BookingStatus.COMPLETED, BookingStatus.REVIEWED],
            },
          },
        }),
        /**
         * Cancellations this person made themselves.
         *
         * Keyed on `cancelledById`, not on membership of the booking: being cancelled *on* is not
         * evidence about you, and counting it would let one party damage the other's standing by
         * cancelling.
         */
        prisma.booking.count({
          where: {
            cancelledById: user.id,
            status: BookingStatus.CANCELLED,
          },
        }),
        /**
         * Composed from `VISIBLE_LISTING_WHERE` rather than hand-written.
         *
         * The owner is known to be active by this point, so the owner clause is redundant here -
         * but writing the predicate out by hand is exactly how a count comes to advertise more
         * items than the list beneath it shows.
         */
        prisma.listing.count({
          where: { ownerId: user.id, ...VISIBLE_LISTING_WHERE },
        }),
      ]);

    const ownerRating = {
      average: user.ownerRatingAverage,
      count: user.ownerRatingCount,
    };
    const renterRating = {
      average: user.renterRatingAverage,
      count: user.renterRatingCount,
    };

    return {
      id: user.id,
      name: user.name,
      bio: user.bio,
      city: user.city,
      image: user.image,
      avatarUrl: user.avatarUrl,
      isVerified: user.isVerified,
      memberSince: user.createdAt,
      ownerRating,
      renterRating,
      completedRentals,
      activeListings,
      trust: assessTrust({
        ownerRating,
        renterRating,
        completedRentals,
        cancelledByThem,
        isVerified: user.isVerified,
        emailVerified: user.emailVerified !== null,
      }),
    };
  }
);

/** How many of a member's listings the profile shows before pointing at the full list. */
export const PROFILE_LISTINGS_COUNT = 6;

/**
 * A member's publicly visible listings, newest first.
 *
 * Goes through `VISIBLE_LISTING_WHERE` like every other public listing read, so a paused or
 * soft-deleted item never appears here even though the profile already knows the owner is active.
 */
export async function getProfileListings(
  ownerId: string,
  take: number = PROFILE_LISTINGS_COUNT
): Promise<ListingCardData[]> {
  const rows = await prisma.listing.findMany({
    where: { ownerId, ...VISIBLE_LISTING_WHERE },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      title: true,
      pricePerDay: true,
      city: true,
      condition: true,
      category: { select: { name: true } },
      images: { orderBy: { order: "asc" }, take: 1, select: { url: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    pricePerDay: row.pricePerDay,
    city: row.city,
    condition: row.condition,
    categoryName: row.category.name,
    imageUrl: row.images[0]?.url ?? null,
    // No search on this page, so there is nothing to excerpt.
    descriptionSnippet: null,
  }));
}
