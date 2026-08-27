import {
  BookingStatus,
  ListingStatus,
  ReportType,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

import type { Prisma } from "@/generated/prisma/client";
import type {
  ItemCondition,
  ReportReason,
  ReportStatus,
  UserStatus,
} from "@/generated/prisma/enums";
import type { AdminActionEntry } from "@/lib/queries/admin-users";
import type { PaginatedResult } from "@/types";

/**
 * Listing lookup for the admin area. Read-only.
 *
 * NOTHING HERE GOES THROUGH `VISIBLE_LISTING_WHERE`, and that is the whole difference from
 * `queries/listings.ts`. Moderation has to be able to open a paused listing, a rejected one, a
 * removed one, and one whose owner is suspended - hiding a listing the moment its owner hides it
 * would make "pause it" an effective way to escape moderation, which is the same reasoning the
 * report queue records.
 *
 * BROWSE-FIRST, UNLIKE THE MEMBERS SCREEN. `searchUsers` refuses to list anything without a query
 * because a default listing of every account is a directory of the user base with email addresses
 * attached. A listing is public by construction - anyone can page through `/listings` - so there is
 * no privacy for search-first to protect here, and the task is different: triage means looking at
 * what was posted recently, not looking up something already known by name.
 *
 * REMOVED LISTINGS ARE INCLUDED IN THE DEFAULT VIEW, flagged rather than filtered out. A moderator
 * who has just taken down the wrong listing needs to find it again, and they will search for its
 * title rather than think to apply a status filter first.
 */

/** Listings per page in the admin queue. Matches the reports queue. */
export const ADMIN_LISTINGS_PAGE_SIZE = 20;

export interface AdminListingSummary {
  id: string;
  title: string;
  status: ListingStatus;
  /** True for a soft-deleted row. Read alongside `status` - decision D3 pairs them. */
  isDeleted: boolean;
  condition: ItemCondition;
  pricePerDay: number;
  city: string;
  viewCount: number;
  createdAt: Date;
  /** First image by `order`, or `null` for a listing with none. */
  imageUrl: string | null;
  /**
   * The owner, with their standing.
   *
   * The standing is load-bearing on this screen: a suspended owner's listings are already invisible
   * publicly through `VISIBLE_LISTING_WHERE`, so a moderator seeing an ACTIVE listing here needs to
   * know whether the public can actually see it before deciding it is a problem.
   */
  owner: {
    id: string;
    name: string | null;
    status: UserStatus;
    isDeleted: boolean;
  };
  /**
   * How many reports name this listing.
   *
   * The most useful number on the screen, for the reason the report queue gives: one complaint is a
   * disagreement, six from six people is a pattern.
   */
  reportCount: number;
}

interface AdminListingSearchOptions {
  /** Matched against the title. Empty lists everything, newest first. */
  query?: string | undefined;
  status?: ListingStatus | undefined;
  city?: string | undefined;
  /** Narrow to one owner's inventory, from a member's detail screen. */
  ownerId?: string | undefined;
  /** Only listings with at least one report against them. */
  reportedOnly?: boolean | undefined;
  page?: number;
  pageSize?: number;
}

/**
 * One page of listings for moderation, newest first.
 *
 * Newest-first rather than oldest, matching the report queue: a backlog would otherwise bury today's
 * listings behind a month of stale ones, and the listing that needs attention is the one that just
 * went up.
 *
 * The title is searched but the description is not. A moderator working from a report has the title -
 * it is what the report card shows - and matching 5,000-character bodies with a leading wildcard is
 * a sequential scan of every listing on the platform for a query that would mostly return noise.
 */
export async function searchAdminListings({
  query,
  status,
  city,
  ownerId,
  reportedOnly,
  page = 1,
  pageSize = ADMIN_LISTINGS_PAGE_SIZE,
}: AdminListingSearchOptions = {}): Promise<
  PaginatedResult<AdminListingSummary>
> {
  const trimmed = query?.trim() ?? "";
  const currentPage = Math.max(1, Math.trunc(page));

  const reportedIds = reportedOnly ? await listingIdsWithReports() : null;

  const where: Prisma.ListingWhereInput = {
    ...(trimmed.length > 0
      ? { title: { contains: trimmed, mode: "insensitive" as const } }
      : {}),
    /**
     * The removed filter matches EITHER column; every other status filter also requires
     * `deletedAt: null`.
     *
     * Decision D3 pairs the DELETED status with the timestamp and every visibility filter reads
     * both, so a row carrying one without the other is already hidden from the public. Matching only
     * `status` here would leave such a row out of the removed view while also showing it under
     * "Active" - present in neither place a moderator would look for it, and in one where it does
     * not belong.
     */
    ...(status === ListingStatus.DELETED
      ? {
          OR: [{ status: ListingStatus.DELETED }, { NOT: { deletedAt: null } }],
        }
      : status !== undefined
        ? { status, deletedAt: null }
        : {}),
    ...(city ? { city } : {}),
    ...(ownerId ? { ownerId } : {}),
    ...(reportedIds ? { id: { in: reportedIds } } : {}),
  };

  // Concurrent reads rather than a transaction - see the note in `getActiveListings`.
  const [rows, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        status: true,
        deletedAt: true,
        condition: true,
        pricePerDay: true,
        city: true,
        viewCount: true,
        createdAt: true,
        images: { orderBy: { order: "asc" }, take: 1, select: { url: true } },
        owner: {
          select: { id: true, name: true, status: true, deletedAt: true },
        },
      },
    }),
    prisma.listing.count({ where }),
  ]);

  const reportCounts = await countReportsPerListing(rows.map((row) => row.id));

  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      isDeleted: row.deletedAt !== null,
      condition: row.condition,
      pricePerDay: row.pricePerDay,
      city: row.city,
      viewCount: row.viewCount,
      createdAt: row.createdAt,
      imageUrl: row.images[0]?.url ?? null,
      owner: {
        id: row.owner.id,
        name: row.owner.name,
        status: row.owner.status,
        isDeleted: row.owner.deletedAt !== null,
      },
      reportCount: reportCounts.get(row.id) ?? 0,
    })),
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** One report against a listing, as the detail screen shows it. */
export interface AdminListingReport {
  id: string;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  createdAt: Date;
  /** Name only. A moderator needs to recognise a repeat reporter, not to contact them. */
  reporter: { id: string; name: string | null };
}

export interface AdminListingDetail extends Omit<
  AdminListingSummary,
  "imageUrl"
> {
  description: string;
  pricePerWeek: number | null;
  pricePerMonth: number | null;
  securityDeposit: number;
  area: string | null;
  categoryName: string;
  subcategoryName: string | null;
  updatedAt: Date;
  deletedAt: Date | null;
  images: readonly { url: string }[];
  /** The owner's email, selected here and nowhere public - see `searchUsers`. */
  ownerEmail: string;
  /** Every booking ever made against this listing. */
  bookingCount: number;
  /**
   * Bookings that are live right now.
   *
   * REMOVAL IS NOT REFUSED WHEN THIS IS NON-ZERO, deliberately - a prohibited or unsafe item has to
   * be able to come down while it is out on rent, which is exactly when it matters most. But a
   * moderator has to *know*: taking the listing down does not cancel the booking or return the
   * deposit, and somebody has to deal with the rental that is already under way.
   */
  activeBookingCount: number;
  /** People with this on a wishlist. */
  saveCount: number;
  /** Reports naming this listing, newest first. */
  reports: AdminListingReport[];
  /** Everything staff have done to this listing. */
  history: AdminActionEntry[];
}

/**
 * One listing, with everything needed to decide about it.
 *
 * `null` for an id that does not exist, so the route can turn it into a real 404 from its layout
 * rather than rendering an empty screen - see the invariant in AGENTS.md.
 *
 * SOFT-DELETED LISTINGS ARE RETURNED. A removal has to be reviewable and reversible after the fact,
 * and the owner's own screens exclude deleted rows - so if this filtered them out too, a listing
 * taken down by mistake would be unreachable by everyone.
 */
export async function getAdminListingDetail(
  id: string
): Promise<AdminListingDetail | null> {
  const listing = await prisma.listing.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      deletedAt: true,
      condition: true,
      pricePerDay: true,
      pricePerWeek: true,
      pricePerMonth: true,
      securityDeposit: true,
      city: true,
      area: true,
      viewCount: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { name: true } },
      subcategory: { select: { name: true } },
      images: { orderBy: { order: "asc" }, select: { url: true } },
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          deletedAt: true,
        },
      },
      adminActions: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          reason: true,
          previousValue: true,
          newValue: true,
          createdAt: true,
          reportId: true,
          listingId: true,
          actor: { select: { name: true } },
        },
      },
      _count: { select: { bookings: true, savedBy: true } },
    },
  });

  if (!listing) {
    return null;
  }

  /**
   * Reports against this listing cannot come from `_count`.
   *
   * `Report.targetId` is polymorphic with no foreign key (D4), so there is no relation to count or
   * include - the same limitation that made damage claims need their own model. Read separately,
   * matching on the listing's id as a LISTING-type target.
   */
  const [reports, activeBookingCount] = await Promise.all([
    prisma.report.findMany({
      where: { type: ReportType.LISTING, targetId: listing.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reason: true,
        description: true,
        status: true,
        createdAt: true,
        reporter: { select: { id: true, name: true } },
      },
    }),
    prisma.booking.count({
      where: { listingId: listing.id, status: { in: LIVE_BOOKING_STATUSES } },
    }),
  ]);

  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    status: listing.status,
    isDeleted: listing.deletedAt !== null,
    deletedAt: listing.deletedAt,
    condition: listing.condition,
    pricePerDay: listing.pricePerDay,
    pricePerWeek: listing.pricePerWeek,
    pricePerMonth: listing.pricePerMonth,
    securityDeposit: listing.securityDeposit,
    city: listing.city,
    area: listing.area,
    categoryName: listing.category.name,
    subcategoryName: listing.subcategory?.name ?? null,
    viewCount: listing.viewCount,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    images: listing.images,
    owner: {
      id: listing.owner.id,
      name: listing.owner.name,
      status: listing.owner.status,
      isDeleted: listing.owner.deletedAt !== null,
    },
    ownerEmail: listing.owner.email,
    bookingCount: listing._count.bookings,
    activeBookingCount,
    saveCount: listing._count.savedBy,
    reports,
    history: listing.adminActions,
    reportCount: reports.length,
  };
}

/**
 * The booking states that mean the item is committed or already out.
 *
 * PENDING is deliberately absent - a request the owner has not accepted is not an obligation - and
 * everything from COMPLETED onwards is history.
 */
// Not `as const`: Prisma's `in` filter takes a mutable array, and a readonly tuple will not satisfy
// it.
const LIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.APPROVED,
  BookingStatus.PAYMENT_PENDING,
  BookingStatus.ACTIVE,
];

/**
 * Reports per listing for one page of results.
 *
 * `groupBy` on the ids actually present, rather than a count per row: a page of twenty would
 * otherwise be twenty round trips to Neon for a number each. A listing with no reports is simply
 * absent from the result, so callers treat a miss as zero.
 */
async function countReportsPerListing(
  ids: string[]
): Promise<Map<string, number>> {
  if (ids.length === 0) {
    return new Map();
  }

  const groups = await prisma.report.groupBy({
    by: ["targetId"],
    where: { type: ReportType.LISTING, targetId: { in: ids } },
    _count: { _all: true },
  });

  return new Map(groups.map((row) => [row.targetId, row._count._all]));
}

/**
 * Listing ids with at least one report, for the reported-only filter.
 *
 * A separate read because the polymorphic `targetId` cannot be joined (D4), so "listings that have
 * been reported" is not expressible as a Prisma relation filter. Distinct ids only, and the set is
 * bounded by how many reports exist rather than by how many listings do.
 */
async function listingIdsWithReports(): Promise<string[]> {
  const groups = await prisma.report.groupBy({
    by: ["targetId"],
    where: { type: ReportType.LISTING },
  });

  return groups.map((row) => row.targetId);
}
