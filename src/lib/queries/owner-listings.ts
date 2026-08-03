import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { LISTINGS_PAGE_SIZE } from "@/lib/queries/listings";

import type { ItemCondition, ListingStatus } from "@/generated/prisma/enums";
import type { PaginatedResult } from "@/types";

/**
 * Read-only queries for an owner's own listings.
 *
 * Separate from `queries/listings.ts`, which is the *public* view and filters everything
 * through `VISIBLE_LISTING_WHERE`. These deliberately do not: an owner must see their
 * own paused and draft listings, which is the whole point of a management screen. Every
 * function here therefore scopes by `ownerId` instead - that scoping is the only thing
 * standing between one owner and another's inventory, so it is never optional and never
 * derived from a parameter the client controls.
 */

export interface OwnerListingSummary {
  id: string;
  title: string;
  status: ListingStatus;
  condition: ItemCondition;
  pricePerDay: number;
  city: string;
  viewCount: number;
  createdAt: Date;
  imageUrl: string | null;
  imageCount: number;
  /** How many people have this on a wishlist - the only demand signal available yet. */
  saveCount: number;
  /** Owner-blocked days still in the future. */
  blockedDateCount: number;
}

interface GetOwnerListingsOptions {
  ownerId: string;
  page?: number;
  pageSize?: number;
}

/**
 * One page of the owner's listings, newest first.
 *
 * Soft-deleted rows are excluded. They still exist - bookings and reviews reference
 * them - but a management list is for listings the owner can act on, and a "deleted"
 * row with no restore path would just be noise.
 *
 * Counts come from `_count` rather than loading the relations: the screen shows numbers,
 * not rows, and fetching every SavedListing to call `.length` on it would be the
 * classic N+1 dressed up as convenience.
 */
export async function getOwnerListings({
  ownerId,
  page = 1,
  pageSize = LISTINGS_PAGE_SIZE,
}: GetOwnerListingsOptions): Promise<PaginatedResult<OwnerListingSummary>> {
  const currentPage = Math.max(1, Math.trunc(page));
  const where = { ownerId, deletedAt: null };

  // Rows and count in one transaction, so the total cannot come from a different
  // snapshot than the page - what otherwise produces "page 3 of 2" after a delete.
  const [rows, total] = await prisma.$transaction([
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        status: true,
        condition: true,
        pricePerDay: true,
        city: true,
        viewCount: true,
        createdAt: true,
        images: { orderBy: { order: "asc" }, take: 1, select: { url: true } },
        _count: {
          select: {
            images: true,
            savedBy: true,
            // Future days only: a count that includes last month's blocks tells the
            // owner nothing about what is currently unavailable.
            unavailableDates: { where: { date: { gte: startOfTodayUtc() } } },
          },
        },
      },
    }),
    prisma.listing.count({ where }),
  ]);

  const items: OwnerListingSummary[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    condition: row.condition,
    pricePerDay: row.pricePerDay,
    city: row.city,
    viewCount: row.viewCount,
    createdAt: row.createdAt,
    imageUrl: row.images[0]?.url ?? null,
    imageCount: row._count.images,
    saveCount: row._count.savedBy,
    blockedDateCount: row._count.unavailableDates,
  }));

  return {
    items,
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export interface OwnerListingDetail {
  id: string;
  title: string;
  description: string;
  status: ListingStatus;
  condition: ItemCondition;
  pricePerDay: number;
  pricePerWeek: number | null;
  pricePerMonth: number | null;
  securityDeposit: number;
  city: string;
  area: string | null;
  categorySlug: string;
  subcategorySlug: string | null;
  images: readonly { publicId: string; url: string }[];
}

/**
 * One of the owner's listings, shaped for the edit form.
 *
 * Returns slugs rather than ids because that is what the form and the action speak -
 * see the note on `createListingSchema`. Images come back with their public ids, so an
 * edit that keeps an existing photo re-submits the same id and the action recognises it
 * as already-owned rather than as a fresh upload.
 *
 * Scoped by `ownerId`, and `null` covers both "no such listing" and "not yours" so the
 * route cannot accidentally become an existence oracle. Wrapped in `cache()` because the
 * edit route's page and `generateMetadata` both need it.
 */
export const getOwnerListingDetail = cache(
  async (
    listingId: string,
    ownerId: string
  ): Promise<OwnerListingDetail | null> => {
    const listing = await prisma.listing.findFirst({
      where: { id: listingId, ownerId, deletedAt: null },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        condition: true,
        pricePerDay: true,
        pricePerWeek: true,
        pricePerMonth: true,
        securityDeposit: true,
        city: true,
        area: true,
        category: { select: { slug: true } },
        subcategory: { select: { slug: true } },
        images: {
          orderBy: { order: "asc" },
          select: { publicId: true, url: true },
        },
      },
    });

    if (!listing) {
      return null;
    }

    return {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      status: listing.status,
      condition: listing.condition,
      pricePerDay: listing.pricePerDay,
      pricePerWeek: listing.pricePerWeek,
      pricePerMonth: listing.pricePerMonth,
      securityDeposit: listing.securityDeposit,
      city: listing.city,
      area: listing.area,
      categorySlug: listing.category.slug,
      subcategorySlug: listing.subcategory?.slug ?? null,
      images: listing.images,
    };
  }
);

export interface ListingAvailability {
  /** `YYYY-MM-DD` days the owner has blocked and can release. */
  ownerBlocked: string[];
  /** `YYYY-MM-DD` days held by a booking, which the owner cannot release. */
  bookingHeld: string[];
}

/**
 * Blocked days for a listing, split by who holds them.
 *
 * The split is the point. `UnavailableDate` carries a `bookingId` that is null for an
 * owner's own block and set when a booking holds the day, and the calendar must not
 * offer to release the second kind - cancelling a booking is the only thing that frees
 * those, and letting an owner clear them here would double-book the item.
 *
 * Scoped to a date range so opening the calendar loads one month rather than a listing's
 * entire history.
 */
export async function getListingAvailability(
  listingId: string,
  ownerId: string,
  from: Date,
  to: Date
): Promise<ListingAvailability> {
  const rows = await prisma.unavailableDate.findMany({
    // Filtered through the listing relation, so an id belonging to someone else returns
    // nothing rather than another owner's calendar.
    where: {
      listing: { id: listingId, ownerId, deletedAt: null },
      date: { gte: from, lte: to },
    },
    orderBy: { date: "asc" },
    select: { date: true, bookingId: true },
  });

  const ownerBlocked: string[] = [];
  const bookingHeld: string[] = [];

  for (const row of rows) {
    // `@db.Date` comes back as UTC midnight, so slicing the ISO string yields the
    // calendar day without any timezone conversion to get wrong.
    const day = row.date.toISOString().slice(0, 10);

    if (row.bookingId) {
      bookingHeld.push(day);
    } else {
      ownerBlocked.push(day);
    }
  }

  return { ownerBlocked, bookingHeld };
}

/** UTC midnight today, for comparing against `@db.Date` columns. */
function startOfTodayUtc(): Date {
  const now = new Date();

  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}
