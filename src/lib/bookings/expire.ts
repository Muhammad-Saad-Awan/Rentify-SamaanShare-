import { BookingStatus } from "@/generated/prisma/enums";
import { pendingExpiryCutoff } from "@/lib/bookings/lifecycle";
import { buildBookingNotifications } from "@/lib/notifications/messages";
import { prisma } from "@/lib/prisma";

/**
 * Lazy expiry of stale booking requests.
 *
 * WHY LAZY RATHER THAN SCHEDULED. A 48-hour timeout needs something to fire it, and there is
 * no scheduler here. A cron job would be the textbook answer, but a cron that silently stops
 * running leaves PENDING requests holding owners' calendars indefinitely - and nothing in the
 * app would notice. Sweeping on the read and write paths that care means expiry cannot rot:
 * if anyone is looking at a listing's availability or requesting it, stale holds are cleared
 * first, by definition.
 *
 * The cost is a small write on some reads. It is bounded - the sweep is indexed on
 * `(listingId, status)` and usually matches nothing - and idempotent, so concurrent callers
 * cannot double-expire.
 */

/**
 * Expires PENDING requests past the window and releases the dates they held.
 *
 * Scoped to one listing when given an id, which is the common case: a booking request or an
 * availability read only cares about the listing in front of it, and sweeping the whole table
 * on every page view would be wasteful.
 *
 * Returns how many were expired, mostly so callers can log or test it.
 *
 * The status change and the date release are one transaction. Doing them separately risks the
 * worst of both: a booking marked EXPIRED whose dates are still held (a permanently blocked
 * calendar), or dates released while the booking still claims to be live.
 */
export async function expireStalePendingBookings(
  listingId?: string
): Promise<number> {
  const cutoff = pendingExpiryCutoff(new Date());

  const stale = await prisma.booking.findMany({
    where: {
      status: BookingStatus.PENDING,
      createdAt: { lte: cutoff },
      ...(listingId ? { listingId } : {}),
    },
    // Both parties and the item name, because expiry notifies each side and the copy names the
    // listing. Selected here rather than re-read per booking below: the sweep is on a hot path.
    select: {
      id: true,
      renterId: true,
      ownerId: true,
      listing: { select: { title: true } },
    },
  });

  if (stale.length === 0) {
    return 0;
  }

  const ids = stale.map((booking) => booking.id);

  /**
   * Two notifications per expired request, built before the transaction opens.
   *
   * The drafts are pure data, so composing them costs nothing and keeps the transaction to
   * three statements however many requests the sweep caught.
   */
  const drafts = stale.flatMap((booking) =>
    buildBookingNotifications({
      event: "expired",
      bookingId: booking.id,
      listingTitle: booking.listing.title,
      parties: { renterId: booking.renterId, ownerId: booking.ownerId },
    })
  );

  await prisma.$transaction([
    prisma.booking.updateMany({
      where: { id: { in: ids }, status: BookingStatus.PENDING },
      data: {
        status: BookingStatus.EXPIRED,
        statusReason: "The owner did not respond within 48 hours.",
      },
    }),
    /**
     * Deleting the held dates is what actually frees the calendar.
     *
     * The rows are not cascade-deleted, because the booking itself survives as history - only
     * its status changes. So they have to go explicitly, and they are matched by `bookingId`
     * so an owner's own manual block on the same day is left untouched.
     */
    prisma.unavailableDate.deleteMany({ where: { bookingId: { in: ids } } }),
    /**
     * In the same transaction as the expiry itself.
     *
     * An owner who lost a booking by not responding is the one person who can act on that
     * information, and a sweep that expired the request but failed to say so would leave both
     * sides guessing at a calendar that silently changed.
     */
    prisma.notification.createMany({ data: drafts }),
  ]);

  return ids.length;
}
