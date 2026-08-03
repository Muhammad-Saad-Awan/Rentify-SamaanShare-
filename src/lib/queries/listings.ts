import { ListingStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

import type { ItemCondition } from "@/generated/prisma/enums";
import type { PaginatedResult } from "@/types";

/**
 * Read-only queries behind the public marketplace.
 *
 * Kept out of `src/actions` on purpose: those are Server Actions, which are
 * POST endpoints exposed to the network and reserved for mutations. Browse is a
 * GET path - these functions are called directly by Server Components, so they
 * are never reachable as an endpoint and need no `"use server"`.
 */

/** Cards per browse page. Also the page size the pagination control assumes. */
export const LISTINGS_PAGE_SIZE = 12;

/**
 * The exact shape a listing card renders.
 *
 * Deliberately not `Listing` from the generated client. A card needs eleven
 * columns out of twenty-odd and exactly one image; selecting the whole row would
 * ship a listing's full `description` text to the browser for every card in the
 * grid. Naming the projection here also means a change to the card's needs shows
 * up as a type error rather than as an over-fetch nobody notices.
 */
export interface ListingCardData {
  id: string;
  title: string;
  pricePerDay: number;
  city: string;
  condition: ItemCondition;
  categoryName: string;
  /** First image by `order`, or `null` for a listing with none yet. */
  imageUrl: string | null;
}

interface GetActiveListingsOptions {
  /** 1-based. Values below 1 are clamped rather than rejected. */
  page?: number;
  pageSize?: number;
}

/**
 * One page of publicly visible listings, newest first.
 *
 * Visibility is `status = ACTIVE` *and* `deletedAt = null`. Both are required:
 * `DELETED` is the soft-delete status by decision D3, but a row could in
 * principle carry a `deletedAt` while some other code path has left the status
 * behind, and a deleted listing leaking into browse is the worse failure. The
 * ordering matches the `@@index([status, createdAt])` in the schema, so the
 * common case is served by an index rather than a sort.
 *
 * The count runs in the same transaction as the page fetch, so the total cannot
 * be read from a different snapshot than the rows - which is what produces an
 * off-by-one "page 5 of 4" when a listing is published mid-request.
 */
export async function getActiveListings({
  page = 1,
  pageSize = LISTINGS_PAGE_SIZE,
}: GetActiveListingsOptions = {}): Promise<PaginatedResult<ListingCardData>> {
  const currentPage = Math.max(1, Math.trunc(page));

  const where = {
    status: ListingStatus.ACTIVE,
    deletedAt: null,
  };

  const [rows, total] = await prisma.$transaction([
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        pricePerDay: true,
        city: true,
        condition: true,
        category: { select: { name: true } },
        // `order` is the author's chosen sequence; the first is the cover image.
        images: {
          orderBy: { order: "asc" },
          take: 1,
          select: { url: true },
        },
      },
    }),
    prisma.listing.count({ where }),
  ]);

  const items: ListingCardData[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    pricePerDay: row.pricePerDay,
    city: row.city,
    condition: row.condition,
    categoryName: row.category.name,
    // `[0]` is `T | undefined` under noUncheckedIndexedAccess; `?? null` keeps
    // the field's type honest instead of asserting the array is non-empty.
    imageUrl: row.images[0]?.url ?? null,
  }));

  return {
    items,
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
