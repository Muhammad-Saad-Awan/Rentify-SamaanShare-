import { BookingStatus } from "@/generated/prisma/enums";
import { expireStalePendingBookings } from "@/lib/bookings/expire";
import { prisma } from "@/lib/prisma";
import {
  VISIBLE_LISTING_RELATION_WHERE,
  VISIBLE_LISTING_WHERE,
} from "@/lib/queries/visibility";

/**
 * The counts behind one member's dashboard overview.
 *
 * WHY THIS EXISTS AT ALL: the overview shipped in Phase 2.1 with four hardcoded em dashes and hints
 * reading "Available in Phase 3". Every one of those phases has since landed, so the screen was
 * telling members that working features did not exist - which is worse than showing nothing, because
 * somebody reads it and stops looking for the feature.
 *
 * IT SWEEPS, UNLIKE THE ADMIN SCREENS. `expireStalePendingBookings` runs first, for the reason
 * `getOwnerBookingRequests` gives: this is the member's *own* surface, the tile links straight to the
 * requests screen, and that screen sweeps on read. Without it the tile would say "1 request to
 * answer" and the page it links to would show none, having expired it on arrival. The admin queues
 * deliberately do not sweep - see the note in `queries/admin-bookings.ts` - because expiry belongs to
 * the two parties, and this is one of them.
 */

/** Bookings in flight: committed, paid for, or out on rent. */
const IN_PROGRESS_STATUSES: readonly BookingStatus[] = [
  BookingStatus.APPROVED,
  BookingStatus.PAYMENT_PENDING,
  BookingStatus.ACTIVE,
];

export interface MemberOverview {
  /**
   * The member's own listings the public can actually see.
   *
   * Through `VISIBLE_LISTING_WHERE`, which also requires the *owner* to be active - so a suspended
   * member is told zero rather than being shown a count of listings nobody can reach. Telling
   * somebody they have three live listings while the marketplace shows none is the exact failure the
   * shared predicate exists to prevent, and it lands hardest here, on their own dashboard.
   */
  liveListings: number;
  /** Everything they have published and not deleted, so the hint can name the difference. */
  totalListings: number;
  /** Requests on their listings still awaiting their answer. The only tile that is a task. */
  requestsToAnswer: number;
  /** Rentals in flight, on either side - what they are renting and what they have lent out. */
  rentalsInProgress: number;
  /**
   * Wishlist items still visible.
   *
   * Counted through the same relation filter `getSavedListings` uses, so the number matches the page
   * it links to. A saved listing whose owner was suspended drops out of both together.
   */
  savedListings: number;
}

export async function getMemberOverview(
  userId: string
): Promise<MemberOverview> {
  await expireStalePendingBookings();

  // Concurrent reads rather than a transaction: Postgres re-snapshots per statement at READ
  // COMMITTED, so batching them would buy no consistency - see the note in `getActiveListings`.
  const [
    liveListings,
    totalListings,
    requestsToAnswer,
    rentalsInProgress,
    savedListings,
  ] = await Promise.all([
    prisma.listing.count({
      where: { ...VISIBLE_LISTING_WHERE, ownerId: userId },
    }),
    prisma.listing.count({ where: { ownerId: userId, deletedAt: null } }),
    prisma.booking.count({
      where: { ownerId: userId, status: BookingStatus.PENDING },
    }),
    prisma.booking.count({
      where: {
        OR: [{ renterId: userId }, { ownerId: userId }],
        status: { in: [...IN_PROGRESS_STATUSES] },
      },
    }),
    prisma.savedListing.count({
      where: { userId, ...VISIBLE_LISTING_RELATION_WHERE },
    }),
  ]);

  return {
    liveListings,
    totalListings,
    requestsToAnswer,
    rentalsInProgress,
    savedListings,
  };
}
