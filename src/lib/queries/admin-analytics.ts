import {
  BookingStatus,
  ListingStatus,
  UserRole,
  UserStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { VISIBLE_LISTING_WHERE } from "@/lib/queries/visibility";

import type {
  AdminActionType,
  ClaimStatus,
  ReportReason,
  ReportType,
} from "@/generated/prisma/enums";

/**
 * Platform analytics. Read-only aggregates for the admin area.
 *
 * WHAT "GMV" MEANS HERE, BECAUSE THE OBVIOUS READING IS WRONG. Payment is offline: the renter hands
 * cash or makes a transfer directly to the owner, and SamaanShare never touches the money, charges no
 * fee and cannot verify that any of it moved. So this is not revenue, and it is not money the
 * platform has seen. It is the rent recorded on bookings that actually reached the point of being a
 * rental. Three consequences, all of them deliberate:
 *
 *   - ONLY ACTIVE, COMPLETED AND REVIEWED COUNT. A PENDING request is a hope; APPROVED and
 *     PAYMENT_PENDING are a commitment that has not started. Those are reported separately as
 *     pipeline, never added in - a number that counts requests as sales flatters itself, and this
 *     screen exists partly to tell someone whether the marketplace is working.
 *   - DEPOSITS ARE EXCLUDED. A security deposit is the renter's money held by the owner and returned
 *     afterwards. Adding it would inflate every figure by the deposit, which on a high-value item
 *     dwarfs the rent itself.
 *   - CANCELLED, DECLINED AND EXPIRED CONTRIBUTE NOTHING, and are counted so the ratio is visible.
 *     A marketplace where most requests expire unanswered is a specific, fixable problem, and it is
 *     invisible in a total.
 *
 * EVERY "LIVE" LISTING COUNT GOES THROUGH `VISIBLE_LISTING_WHERE`. Per the invariant in AGENTS.md, a
 * count computed with a looser predicate than the page it describes advertises items that are not
 * there - and on this screen it would be worse than on a category tile, because somebody would use
 * the number to decide whether the marketplace has enough supply.
 */

/** Booking states where the rental happened, so the rent is real. */
const REALISED_STATUSES: readonly BookingStatus[] = [
  BookingStatus.ACTIVE,
  BookingStatus.COMPLETED,
  BookingStatus.REVIEWED,
];

/** Committed but not started: money expected, not money earned. */
const PIPELINE_STATUSES: readonly BookingStatus[] = [
  BookingStatus.APPROVED,
  BookingStatus.PAYMENT_PENDING,
];

/** Ended without a rental. Counted, never summed. */
const FAILED_STATUSES: readonly BookingStatus[] = [
  BookingStatus.DECLINED,
  BookingStatus.CANCELLED,
  BookingStatus.EXPIRED,
];

export interface PlatformTotals {
  users: {
    /** Accounts that are not soft-deleted. The population that can sign in or be moderated. */
    total: number;
    active: number;
    suspended: number;
    banned: number;
    /** Soft-deleted, excluded from `total` - see decision D3 on why they are never removed. */
    deleted: number;
    /** Identity verified by an administrator, not merely email-confirmed. */
    verified: number;
    admins: number;
  };
  listings: {
    /** Every row, including removed ones. */
    total: number;
    /**
     * What the public can actually see, through `VISIBLE_LISTING_WHERE`.
     *
     * Not the same as `active`: that clause also requires the owner to be active, so a suspended
     * member's ACTIVE listings are counted in one and not the other. The gap between the two numbers
     * is exactly the supply that moderation has taken out of the market.
     */
    live: number;
    active: number;
    paused: number;
    draft: number;
    removed: number;
  };
  bookings: {
    total: number;
    /** Waiting on the owner to answer. */
    pending: number;
    /** Committed but not yet collected. */
    pipeline: number;
    /** Out on rent right now. */
    live: number;
    /** Returned, whether or not reviews followed. */
    completed: number;
    /** Declined, cancelled or expired. */
    failed: number;
  };
  money: {
    /** Rent on bookings that became rentals. See the module note on what this is not. */
    realisedGmv: number;
    /** Rent on bookings committed but not started. Never added to the above. */
    pipelineGmv: number;
    /** Deposits currently recorded against live and completed rentals, for scale only. */
    depositsAtStake: number;
  };
}

/**
 * The headline numbers, in four queries.
 *
 * `groupBy` rather than a count per state: eleven separate counts would be eleven round trips to Neon
 * for one integer each, and the booking `groupBy` returns the sums in the same pass - so the money
 * figures cost nothing beyond the counts they are derived from.
 *
 * Concurrent rather than transactional, like every other read in this codebase: Postgres re-snapshots
 * per statement at READ COMMITTED, so a transaction would buy no consistency here - see the note in
 * `getActiveListings`.
 */
export async function getPlatformTotals(): Promise<PlatformTotals> {
  const [userGroups, listingGroups, bookingGroups, extras] = await Promise.all([
    prisma.user.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.listing.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.booking.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { totalPrice: true, securityDeposit: true },
    }),
    Promise.all([
      prisma.user.count({ where: { deletedAt: { not: null } } }),
      prisma.user.count({ where: { isVerified: true, deletedAt: null } }),
      prisma.user.count({
        where: {
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      }),
      prisma.listing.count({ where: VISIBLE_LISTING_WHERE }),
      prisma.listing.count({ where: { deletedAt: { not: null } } }),
    ]),
  ]);

  const [deletedUsers, verifiedUsers, admins, liveListings, deletedListings] =
    extras;

  const userCount = (status: UserStatus): number =>
    userGroups.find((row) => row.status === status)?._count._all ?? 0;

  const listingCount = (status: ListingStatus): number =>
    listingGroups.find((row) => row.status === status)?._count._all ?? 0;

  const bookingCount = (statuses: readonly BookingStatus[]): number =>
    bookingGroups
      .filter((row) => statuses.includes(row.status))
      .reduce((sum, row) => sum + row._count._all, 0);

  const bookingSum = (
    statuses: readonly BookingStatus[],
    field: "totalPrice" | "securityDeposit"
  ): number =>
    bookingGroups
      .filter((row) => statuses.includes(row.status))
      .reduce((sum, row) => sum + (row._sum[field] ?? 0), 0);

  return {
    users: {
      total: userGroups.reduce((sum, row) => sum + row._count._all, 0),
      active: userCount(UserStatus.ACTIVE),
      suspended: userCount(UserStatus.SUSPENDED),
      banned: userCount(UserStatus.BANNED),
      deleted: deletedUsers,
      verified: verifiedUsers,
      admins,
    },
    listings: {
      total: listingGroups.reduce((sum, row) => sum + row._count._all, 0),
      live: liveListings,
      active: listingCount(ListingStatus.ACTIVE),
      paused: listingCount(ListingStatus.PAUSED),
      draft: listingCount(ListingStatus.DRAFT),
      /**
       * Removed counts a row with the DELETED status OR a deletion timestamp.
       *
       * D3 pairs them and every visibility filter reads both, so the looser of the two would
       * undercount - and `listingCount(DELETED)` alone would miss a row carrying only the timestamp.
       * Taking the larger of the two is the honest floor.
       */
      removed: Math.max(listingCount(ListingStatus.DELETED), deletedListings),
    },
    bookings: {
      total: bookingGroups.reduce((sum, row) => sum + row._count._all, 0),
      pending: bookingCount([BookingStatus.PENDING]),
      pipeline: bookingCount(PIPELINE_STATUSES),
      live: bookingCount([BookingStatus.ACTIVE]),
      completed: bookingCount([
        BookingStatus.COMPLETED,
        BookingStatus.REVIEWED,
      ]),
      failed: bookingCount(FAILED_STATUSES),
    },
    money: {
      realisedGmv: bookingSum(REALISED_STATUSES, "totalPrice"),
      pipelineGmv: bookingSum(PIPELINE_STATUSES, "totalPrice"),
      /**
       * Deposits on rentals that have started, whether or not they have finished.
       *
       * "At stake" rather than "held": the platform holds nothing. It is the amount of renters' money
       * currently sitting with owners on the strength of a record in this database, which is the
       * scale of the obligation the deposit clock is measuring.
       */
      depositsAtStake: bookingSum(REALISED_STATUSES, "securityDeposit"),
    },
  };
}

/** One city's share of the marketplace. */
export interface CityDistributionRow {
  city: string;
  /** Listings the public can see there, through `VISIBLE_LISTING_WHERE`. */
  liveListings: number;
  /** Rent recorded on rentals of items in that city. */
  realisedGmv: number;
  /** Rentals that happened there. */
  realisedBookings: number;
}

/**
 * The marketplace broken down by city.
 *
 * THE CITY SET COMES FROM THE DATA, not from `PAKISTANI_CITIES`. Reading the configured launch cities
 * would silently drop a city that exists in the database ahead of the config - which is exactly what
 * a launch looks like from the inside, and the screen reporting the expansion is the last place that
 * should be blind to it.
 *
 * `Booking` has no city of its own - it is on the listing - and Prisma cannot `groupBy` a relation
 * field, so the rent per city is one aggregate per city rather than one grouped query. Bounded by the
 * number of cities with listings, which is a handful and grows by deliberate expansion; the
 * alternative of loading every realised booking to reduce in memory grows with transactions instead.
 */
export async function getCityDistribution(): Promise<CityDistributionRow[]> {
  const listingGroups = await prisma.listing.groupBy({
    by: ["city"],
    where: VISIBLE_LISTING_WHERE,
    _count: { _all: true },
    orderBy: { _count: { city: "desc" } },
  });

  /**
   * Cities with rentals but no live listings still belong here.
   *
   * An owner whose only listing was removed, or who paused everything, leaves a city with real
   * transaction history and nothing visible. Dropping it would make past GMV disappear from the
   * total when read city by city.
   */
  const bookingCities = await prisma.booking.findMany({
    where: { status: { in: [...REALISED_STATUSES] } },
    distinct: ["listingId"],
    select: { listing: { select: { city: true } } },
    // Bounded: this is a distinct-listing scan, so it is one row per rented item, not per booking.
    take: 500,
  });

  const cities = Array.from(
    new Set([
      ...listingGroups.map((row) => row.city),
      ...bookingCities.map((row) => row.listing.city),
    ])
  );

  const money = await Promise.all(
    cities.map((city) =>
      prisma.booking.aggregate({
        where: {
          status: { in: [...REALISED_STATUSES] },
          listing: { city },
        },
        _sum: { totalPrice: true },
        _count: { _all: true },
      })
    )
  );

  return (
    cities
      .map((city, index) => ({
        city,
        liveListings:
          listingGroups.find((row) => row.city === city)?._count._all ?? 0,
        realisedGmv: money[index]?._sum.totalPrice ?? 0,
        realisedBookings: money[index]?._count._all ?? 0,
      }))
      // Live supply first, which is what the chart is ordered by - a city with more listings than
      // another but fewer rentals is the interesting case, and it is invisible if the order changes
      // between the two charts.
      .sort(
        (a, b) =>
          b.liveListings - a.liveListings || b.realisedGmv - a.realisedGmv
      )
  );
}

/**
 * One thing that happened on the platform, for the activity feed.
 *
 * A discriminated union rather than a pre-written sentence: the copy belongs with the component that
 * renders it, and a query module writing prose ends up owning the wording for screens it has never
 * seen.
 */
export type ActivityEvent =
  | { kind: "member"; at: Date; id: string; name: string | null }
  | {
      kind: "listing";
      at: Date;
      id: string;
      title: string;
      ownerName: string | null;
    }
  | {
      kind: "booking";
      at: Date;
      id: string;
      status: BookingStatus;
      listingTitle: string;
    }
  | {
      kind: "report";
      at: Date;
      id: string;
      type: ReportType;
      reason: ReportReason;
    }
  | {
      kind: "claim";
      at: Date;
      id: string;
      status: ClaimStatus;
      amountClaimed: number;
      listingTitle: string;
    }
  | {
      kind: "admin";
      at: Date;
      id: string;
      type: AdminActionType;
      actorName: string | null;
      subjectId: string;
    };

/** How many of each kind the feed reads before merging. */
export const ACTIVITY_PER_SOURCE = 8;

/** How many survive the merge. */
export const ACTIVITY_TOTAL = 15;

export interface RecentActivity {
  events: ActivityEvent[];
  /**
   * Whether any source hit its per-source cap.
   *
   * Surfaced rather than hidden. The feed is the newest {@link ACTIVITY_PER_SOURCE} of each kind
   * merged, not a global log, so a burst of registrations can push everything else out of the
   * window - and a feed that looked complete while quietly truncating would have somebody conclude
   * that nothing else happened.
   */
  truncated: boolean;
}

/**
 * The newest activity across the platform, merged and ordered newest first.
 *
 * SIX SOURCES, CAPPED PER SOURCE. There is no global event log - the models were never given one, and
 * inventing one now would mean writing to it from every action - so this reads the newest few of each
 * kind and merges. That is honest for recency and wrong for completeness, which is why
 * {@link RecentActivity.truncated} exists.
 *
 * NO EMAIL ADDRESSES, AND NO PAGINATION. `searchUsers` refuses to list accounts without a query
 * because a browsable list of the user base is a directory rather than a tool. This is a bounded
 * window of events with no next page and no search, so it cannot be walked to enumerate anybody -
 * and the names it does show link to the admin screens, which is where an administrator was going.
 */
export async function getRecentActivity(): Promise<RecentActivity> {
  const take = ACTIVITY_PER_SOURCE;

  const [members, listings, bookings, reports, claims, actions] =
    await Promise.all([
      prisma.user.findMany({
        // Soft-deleted accounts are excluded: this answers "what is happening", and a deleted
        // account's registration is no longer something to act on.
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take,
        select: { id: true, name: true, createdAt: true },
      }),
      prisma.listing.findMany({
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          title: true,
          createdAt: true,
          owner: { select: { name: true } },
        },
      }),
      prisma.booking.findMany({
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          status: true,
          createdAt: true,
          listing: { select: { title: true } },
        },
      }),
      prisma.report.findMany({
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          type: true,
          reason: true,
          createdAt: true,
        },
      }),
      prisma.damageClaim.findMany({
        orderBy: { filedAt: "desc" },
        take,
        select: {
          id: true,
          status: true,
          amountClaimed: true,
          filedAt: true,
          booking: { select: { listing: { select: { title: true } } } },
        },
      }),
      prisma.adminAction.findMany({
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          type: true,
          subjectId: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
      }),
    ]);

  const events: ActivityEvent[] = [
    ...members.map((row): ActivityEvent => ({
      kind: "member",
      at: row.createdAt,
      id: row.id,
      name: row.name,
    })),
    ...listings.map((row): ActivityEvent => ({
      kind: "listing",
      at: row.createdAt,
      id: row.id,
      title: row.title,
      ownerName: row.owner.name,
    })),
    ...bookings.map((row): ActivityEvent => ({
      kind: "booking",
      at: row.createdAt,
      id: row.id,
      status: row.status,
      listingTitle: row.listing.title,
    })),
    ...reports.map((row): ActivityEvent => ({
      kind: "report",
      at: row.createdAt,
      id: row.id,
      type: row.type,
      reason: row.reason,
    })),
    ...claims.map((row): ActivityEvent => ({
      kind: "claim",
      at: row.filedAt,
      id: row.id,
      status: row.status,
      amountClaimed: row.amountClaimed,
      listingTitle: row.booking.listing.title,
    })),
    ...actions.map((row): ActivityEvent => ({
      kind: "admin",
      at: row.createdAt,
      id: row.id,
      type: row.type,
      actorName: row.actor?.name ?? null,
      subjectId: row.subjectId,
    })),
  ];

  const sources = [members, listings, bookings, reports, claims, actions];

  return {
    events: events
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, ACTIVITY_TOTAL),
    truncated: sources.some((source) => source.length === take),
  };
}
