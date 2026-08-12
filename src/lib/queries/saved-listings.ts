import { prisma } from "@/lib/prisma";
import { LISTINGS_PAGE_SIZE } from "@/lib/queries/listings";
import { VISIBLE_LISTING_RELATION_WHERE } from "@/lib/queries/visibility";

import type { Prisma } from "@/generated/prisma/client";
import type { ListingCardData } from "@/lib/queries/listings";
import type { PaginatedResult } from "@/types";

/**
 * Read-only wishlist queries.
 *
 * Separate from the mutations in `src/actions/saved-listings.ts`: these are called
 * directly by Server Components on a GET path, so they are not `"use server"` and
 * are not reachable as endpoints.
 */

/**
 * Which of `listingIds` the user has saved.
 *
 * Scoped to the ids actually on screen rather than fetching the user's whole
 * wishlist. A visitor with 400 saved items would otherwise transfer 400 rows to
 * decide twelve heart icons; this reads at most `listingIds.length` rows, served by
 * the `@@unique([userId, listingId])` index.
 *
 * Returns an empty set for a signed-out visitor or an empty page, so callers need
 * no null handling - `has()` on an empty set is simply false.
 */
export async function getSavedListingIds(
  userId: string | undefined,
  listingIds: readonly string[]
): Promise<Set<string>> {
  if (!userId || listingIds.length === 0) {
    return new Set();
  }

  const rows = await prisma.savedListing.findMany({
    where: { userId, listingId: { in: [...listingIds] } },
    select: { listingId: true },
  });

  return new Set(rows.map((row) => row.listingId));
}

interface GetSavedListingsOptions {
  userId: string;
  /** 1-based. */
  page?: number;
  pageSize?: number;
}

/**
 * One page of the user's saved listings, most recently saved first.
 *
 * Hides saves whose listing is no longer publicly visible - paused, rejected,
 * soft-deleted, or owned by a suspended account. The row stays in the database, so the item reappears if its owner
 * republishes it, but a wishlist that renders a listing nobody can open is worse
 * than one that is quietly shorter. The consequence, which is worth knowing: the
 * count here can be lower than the number of rows the user has saved.
 *
 * Ordered by when it was saved rather than by the listing's own `createdAt`: the
 * wishlist is a record of the user's actions, so the thing they just saved belongs
 * at the top.
 */
export async function getSavedListings({
  userId,
  page = 1,
  pageSize = LISTINGS_PAGE_SIZE,
}: GetSavedListingsOptions): Promise<PaginatedResult<ListingCardData>> {
  const currentPage = Math.max(1, Math.trunc(page));

  const where: Prisma.SavedListingWhereInput = {
    userId,
    ...VISIBLE_LISTING_RELATION_WHERE,
  };

  // Concurrent reads rather than a transaction: READ COMMITTED re-snapshots per statement, so the
  // consistency this used to claim was never provided - see the full note in `getActiveListings`.
  const [rows, total] = await Promise.all([
    prisma.savedListing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: {
        listing: {
          select: {
            id: true,
            title: true,
            pricePerDay: true,
            city: true,
            condition: true,
            category: { select: { name: true } },
            images: {
              orderBy: { order: "asc" },
              take: 1,
              select: { url: true },
            },
          },
        },
      },
    }),
    prisma.savedListing.count({ where }),
  ]);

  const items: ListingCardData[] = rows.map((row) => ({
    id: row.listing.id,
    title: row.listing.title,
    pricePerDay: row.listing.pricePerDay,
    city: row.listing.city,
    condition: row.listing.condition,
    categoryName: row.listing.category.name,
    imageUrl: row.listing.images[0]?.url ?? null,
    // No search on this page, so nothing to excerpt. `description` is not even
    // selected above, which keeps the listing bodies off the wire entirely.
    descriptionSnippet: null,
  }));

  return {
    items,
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
