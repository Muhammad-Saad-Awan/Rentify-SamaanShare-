import { ListingStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { buildMatchSnippet } from "@/lib/utils/highlight";

import type { Prisma } from "@/generated/prisma/client";
import type { ItemCondition } from "@/generated/prisma/enums";
import type { ListingFilters } from "@/lib/marketplace/filters";
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
 * Deliberately not `Listing` from the generated client: a card needs a handful of
 * columns out of twenty-odd and exactly one image. Naming the projection here also
 * means a change to the card's needs shows up as a type error rather than as an
 * over-fetch nobody notices.
 *
 * `description` is read from the database but never leaves the server whole - it is
 * reduced to `descriptionSnippet` below. That is a change from the original
 * projection, which omitted the column outright to keep prose off the wire; search
 * needs to show *why* a listing matched, and an excerpt is the smallest thing that
 * can. The cost is one extra text column per row on the database-to-server hop; the
 * browser still receives at most ~140 characters, and only when searching.
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
  /**
   * Excerpt around the search term's first occurrence in the description.
   *
   * `null` when there is no search, or when the term appears only in the title -
   * in which case there is nothing worth quoting.
   */
  descriptionSnippet: string | null;
}

interface GetActiveListingsOptions {
  filters: ListingFilters;
  pageSize?: number;
}

/**
 * One page of publicly visible listings matching `filters`.
 *
 * Visibility is `status = ACTIVE` *and* `deletedAt = null`. Both are required:
 * `DELETED` is the soft-delete status by decision D3, but a row could in
 * principle carry a `deletedAt` while some other code path has left the status
 * behind, and a deleted listing leaking into browse is the worse failure.
 *
 * The count runs in the same transaction as the page fetch, so the total cannot
 * be read from a different snapshot than the rows - which is what produces an
 * off-by-one "page 5 of 4" when a listing is published mid-request.
 */
export async function getActiveListings({
  filters,
  pageSize = LISTINGS_PAGE_SIZE,
}: GetActiveListingsOptions): Promise<PaginatedResult<ListingCardData>> {
  const where = buildListingWhere(filters);

  const [rows, total] = await prisma.$transaction([
    prisma.listing.findMany({
      where,
      orderBy: buildListingOrderBy(filters.sort),
      skip: (filters.page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        description: true,
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
    // Reduced here, on the server, so the full body never crosses to the client.
    descriptionSnippet: buildMatchSnippet(row.description, filters.q),
  }));

  return {
    items,
    total,
    page: filters.page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Live listing counts for the homepage's city shortcuts.
 *
 * `groupBy` rather than one count per city: three sequential counts would be
 * three round trips to Neon for a number each, and the list of cities is
 * expected to grow past the three launch markets.
 *
 * Returned as a `Map` keyed by city slug because the caller renders from
 * `PAKISTANI_CITIES` - the configured launch cities, in their configured order -
 * and needs to look each one up. A city with no listings is simply absent from
 * the result, so callers must treat a miss as zero.
 */
export async function getActiveListingCountsByCity(): Promise<
  Map<string, number>
> {
  const groups = await prisma.listing.groupBy({
    by: ["city"],
    where: { status: ListingStatus.ACTIVE, deletedAt: null },
    _count: { _all: true },
  });

  return new Map(groups.map((group) => [group.city, group._count._all]));
}

/**
 * Translates parsed filters into a Prisma `where`.
 *
 * Split out so the page fetch and the count share one definition - two
 * hand-written predicates would eventually disagree and produce a total that
 * does not match the rows.
 */
function buildListingWhere(filters: ListingFilters): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {
    status: ListingStatus.ACTIVE,
    deletedAt: null,
  };

  if (filters.q) {
    // Substring match over title and description. `mode: "insensitive"` is a
    // Postgres ILIKE, so this cannot use the btree indexes - the term length is
    // capped in the filters module for that reason. A trigram or tsvector index
    // is the upgrade path once the corpus is large enough to need it.
    where.OR = [
      { title: { contains: filters.q, mode: "insensitive" } },
      { description: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  if (filters.category) {
    where.category = { slug: filters.category };
  }

  // Only honoured alongside a category, matching the serializer, which drops an
  // orphaned subcategory. Subcategory slugs are unique per category, not
  // globally - "bicycles" exists under both sports and vehicles - so filtering
  // on one without its parent would match listings from either.
  if (filters.category && filters.subcategory) {
    where.subcategory = { slug: filters.subcategory };
  }

  if (filters.city) {
    where.city = filters.city;
  }

  if (filters.minPrice !== null || filters.maxPrice !== null) {
    where.pricePerDay = {
      ...(filters.minPrice !== null ? { gte: filters.minPrice } : {}),
      ...(filters.maxPrice !== null ? { lte: filters.maxPrice } : {}),
    };
  }

  if (filters.conditions.length > 0) {
    where.condition = { in: filters.conditions };
  }

  const availability = buildAvailabilityWindow(filters);

  if (availability) {
    // "Available" means the listing has no blocked date inside the window.
    // Expressed as NOT-some rather than every-not: `every` on an empty relation
    // is vacuously true in SQL, which would be correct here, but NOT-some reads
    // as the question actually being asked and needs no such reasoning.
    //
    // This currently sees only `UnavailableDate` rows. Dates held by a confirmed
    // booking also live there - the model carries a `bookingId` and a
    // reason of "booked" - so this stays correct when bookings land, provided
    // booking creation keeps writing those rows.
    where.NOT = {
      unavailableDates: {
        some: { date: { gte: availability.from, lte: availability.to } },
      },
    };
  }

  return where;
}

/**
 * The availability window as a pair of dates, or `null` when unfiltered.
 *
 * A single supplied bound is treated as a one-day window rather than an open
 * range: someone who sets only a start date is asking "can I have it that day",
 * and reading it as "from then on, forever" would exclude any listing with a
 * single blocked date years later.
 *
 * Dates are built at UTC midnight to match the `@db.Date` column, which stores a
 * calendar day with no time or offset.
 */
function buildAvailabilityWindow(
  filters: ListingFilters
): { from: Date; to: Date } | null {
  const from = filters.availableFrom ?? filters.availableTo;
  const to = filters.availableTo ?? filters.availableFrom;

  if (!from || !to) {
    return null;
  }

  return {
    from: new Date(`${from}T00:00:00.000Z`),
    to: new Date(`${to}T00:00:00.000Z`),
  };
}

/**
 * Maps a sort option onto a Prisma `orderBy`.
 *
 * Every option ends with `createdAt: "desc"` as a tie-breaker. Without one, rows
 * sharing a sort key come back in whatever order Postgres finds convenient, and
 * that order can differ between two pages of the same result set - so a listing
 * can appear on both page 1 and page 2, or on neither.
 */
function buildListingOrderBy(
  sort: ListingFilters["sort"]
): Prisma.ListingOrderByWithRelationInput[] {
  switch (sort) {
    case "price-asc":
      return [{ pricePerDay: "asc" }, { createdAt: "desc" }];

    case "price-desc":
      return [{ pricePerDay: "desc" }, { createdAt: "desc" }];

    case "rating":
      // Sorts on the owner's denormalised `ratingAverage`, which is what the
      // schema's P8 note exists for - a listing has no rating of its own, and
      // averaging reviews inline is not expressible in a paginated query.
      //
      // `nulls: "last"` is essential rather than cosmetic: the column is null
      // until an owner's first review, and Postgres places nulls *first* on a
      // DESC sort by default. Without this, "sort by rating" would lead with
      // every unrated owner - the exact opposite of the request.
      return [
        { owner: { ratingAverage: { sort: "desc", nulls: "last" } } },
        { createdAt: "desc" },
      ];

    case "newest":
    default:
      // Matches the @@index([status, createdAt]) in the schema, so the default
      // browse view is served by an index rather than a sort.
      return [{ createdAt: "desc" }];
  }
}
