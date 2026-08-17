import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { VISIBLE_LISTING_WHERE } from "@/lib/queries/visibility";

import type { ItemCondition } from "@/generated/prisma/enums";
import type { ListingCardData } from "@/lib/queries/listings";

/**
 * Read-only queries for a single listing.
 *
 * Split from `queries/listings.ts`, which projects the narrow shape a *card*
 * needs. A detail page needs almost the opposite: one row, but nearly all of it.
 */

export interface ListingDetailData {
  id: string;
  title: string;
  description: string;
  condition: ItemCondition;
  pricePerDay: number;
  /** Longer-term rates are optional in the schema. */
  pricePerWeek: number | null;
  pricePerMonth: number | null;
  securityDeposit: number;
  city: string;
  area: string | null;
  createdAt: Date;
  category: { name: string; slug: string };
  subcategory: { name: string; slug: string } | null;
  images: readonly { id: string; url: string }[];
  owner: ListingOwner;
}

/**
 * The owner, as shown publicly.
 *
 * Note what is absent: `email`. `getDisplayName` falls back to the email's local
 * part when `name` is null, which is correct inside the dashboard and a privacy
 * leak on a page anyone can read. Not selecting the column means that fallback
 * cannot fire here even by accident.
 */
export interface ListingOwner {
  id: string;
  name: string | null;
  image: string | null;
  avatarUrl: string | null;
  city: string | null;
  isVerified: boolean;
  /**
   * The `asOwner` half of the rating, and deliberately not the mixed figure this used to carry: the
   * reviews rendered further down this same page are `RENTER_TO_OWNER` only, so any other aggregate
   * would contradict them. Named for the column rather than aliased, because this object is returned
   * straight out of Prisma and a rename here would be a lie about where the number comes from.
   */
  ownerRatingAverage: number | null;
  ownerRatingCount: number;
  createdAt: Date;
}

/**
 * One publicly visible listing, or `null`.
 *
 * `findFirst`, not `findUnique`: the filter is id *plus* the visibility rule, and
 * `findUnique` only accepts unique fields. That combination is the point - a
 * paused, rejected or soft-deleted listing, or one whose owner has been banned,
 * must 404 rather than render, or a guessed id would expose it.
 *
 * Wrapped in React's `cache()` because three callers need it per request: the
 * route's layout (which validates the id), the page, and `generateMetadata`.
 * Without memoisation that is three identical round trips.
 */
export const getListingDetail = cache(
  async (id: string): Promise<ListingDetailData | null> => {
    return prisma.listing.findFirst({
      where: { id, ...VISIBLE_LISTING_WHERE },
      select: {
        id: true,
        title: true,
        description: true,
        condition: true,
        pricePerDay: true,
        pricePerWeek: true,
        pricePerMonth: true,
        securityDeposit: true,
        city: true,
        area: true,
        createdAt: true,
        category: { select: { name: true, slug: true } },
        subcategory: { select: { name: true, slug: true } },
        images: {
          orderBy: { order: "asc" },
          select: { id: true, url: true },
        },
        owner: {
          select: {
            id: true,
            name: true,
            image: true,
            avatarUrl: true,
            city: true,
            isVerified: true,
            ownerRatingAverage: true,
            ownerRatingCount: true,
            createdAt: true,
          },
        },
      },
    });
  }
);

/** How many related listings to show beneath a listing. */
export const SIMILAR_LISTINGS_COUNT = 4;

interface GetSimilarListingsOptions {
  listingId: string;
  categorySlug: string;
}

/**
 * Other visible listings in the same category.
 *
 * Excludes the listing being viewed - otherwise the most obviously "similar"
 * result is the page you are already on.
 *
 * Matches on category alone rather than trying to score similarity. With a
 * catalogue this size anything cleverer would mostly return nothing, and an empty
 * "similar" row is worse than a loosely related one. Ordered newest-first so the
 * section is not frozen to whatever Postgres returns first.
 *
 * Returns `ListingCardData` so `ListingsGrid` renders it unchanged.
 */
export async function getSimilarListings({
  listingId,
  categorySlug,
}: GetSimilarListingsOptions): Promise<ListingCardData[]> {
  const rows = await prisma.listing.findMany({
    where: {
      ...VISIBLE_LISTING_WHERE,
      category: { slug: categorySlug },
      id: { not: listingId },
    },
    orderBy: { createdAt: "desc" },
    take: SIMILAR_LISTINGS_COUNT,
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
