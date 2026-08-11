import { prisma } from "@/lib/prisma";

import type { Prisma } from "@/generated/prisma/client";
import type {
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/generated/prisma/enums";

/**
 * Shared plumbing for the booking lifecycle actions.
 *
 * WHY THIS EXISTS. Six actions - select payment, confirm payment, start, complete, cancel, mark
 * deposit returned - need the same four things: the booking, proof the caller is a party to it,
 * a status that permits the change, and a write that cannot be overtaken by a concurrent one.
 * Written out six times, one of them ends up looser than the others; that is exactly how
 * `decide()` came to be shared between accept and decline.
 *
 * This module holds no `"use server"` directive on purpose. A Server Action file may only export
 * async functions, so shared types and non-action helpers cannot live beside the actions that
 * use them.
 */

/** Owner decisions and renter actions per hour. Generous - working a backlog is normal. */
export const LIFECYCLE_RATE_LIMIT = { limit: 100, windowMs: 60 * 60 * 1000 };

/**
 * Everything the lifecycle actions read about a booking.
 *
 * One projection for all six rather than a select per action. They overlap almost completely, and
 * a single indexed row read is cheaper than the risk of an action that forgets to load the
 * payment status it is supposed to check.
 */
export interface BookingForAction {
  id: string;
  status: BookingStatus;
  listingId: string;
  renterId: string;
  ownerId: string;
  totalPrice: number;
  securityDeposit: number;
  startedAt: Date | null;
  completedAt: Date | null;
  listing: { title: string };
  payment: {
    id: string;
    status: PaymentStatus;
    method: PaymentMethod;
    amount: number;
    securityDeposit: number;
    confirmedAt: Date | null;
    depositReturnedAt: Date | null;
  } | null;
}

const bookingForActionSelect = {
  id: true,
  status: true,
  listingId: true,
  renterId: true,
  ownerId: true,
  totalPrice: true,
  securityDeposit: true,
  startedAt: true,
  completedAt: true,
  listing: { select: { title: true } },
  payment: {
    select: {
      id: true,
      status: true,
      method: true,
      amount: true,
      securityDeposit: true,
      confirmedAt: true,
      depositReturnedAt: true,
    },
  },
} as const;

/** Which side of the booking the caller claims to be. */
export type BookingSide = "owner" | "renter";

interface LoadBookingOptions {
  bookingId: string;
  userId: string;
  side: BookingSide;
}

/**
 * Loads a booking the caller is a party to, or `null`.
 *
 * AUTHORIZATION IS IN THE PREDICATE, not a comparison afterwards. `ownerId` or `renterId` is
 * part of the `where`, so a booking belonging to someone else is indistinguishable from one that
 * does not exist - which is also why every caller reports both as the same "not found". An
 * action that fetched by id and then compared would be one forgotten `if` away from letting
 * either party drive the other's half of the flow.
 */
export async function loadBookingForParty({
  bookingId,
  userId,
  side,
}: LoadBookingOptions): Promise<BookingForAction | null> {
  return prisma.booking.findFirst({
    where: {
      id: bookingId,
      ...(side === "owner" ? { ownerId: userId } : { renterId: userId }),
    },
    select: bookingForActionSelect,
  });
}

interface TransitionOptions {
  bookingId: string;
  /** The status read before the decision - re-asserted, never trusted. */
  from: BookingStatus;
  to: BookingStatus;
  /** Extra scalar columns to write with the status, e.g. `startedAt` or `completedAt`. */
  data?: Prisma.BookingUpdateManyMutationInput;
  /**
   * Foreign keys to attach, as a nested write.
   *
   * `updateMany` cannot set `paymentId` or `cancelledById`: Prisma excludes a foreign key from
   * `UpdateManyMutationInput` whenever a relation is declared on it, so they have to be connected
   * rather than assigned. That needs `update`, which in turn cannot carry the status guard - its
   * `where` accepts only unique fields.
   *
   * So the two are split: the guarded `updateMany` decides the race, and this runs only after it
   * has been won. Safe by construction, because winning the compare-and-swap means no concurrent
   * caller can also be past this point for the same booking.
   */
  relations?: Prisma.BookingUpdateInput;
}

/**
 * Applies a status change, or reports that someone else got there first.
 *
 * COMPARE AND SWAP, NOT READ THEN WRITE. Every action here reads the booking, decides, and
 * writes. Between the read and the write the row can move - a second tab, the other party acting
 * at the same moment, or the lazy expiry sweep firing on someone else's page view. Naming the
 * expected status in the `where` makes the database the arbiter: the loser matches zero rows and
 * is told to refresh, instead of overwriting an outcome it never saw.
 *
 * This is the same principle as `@@unique([listingId, date])` deciding the date race rather than
 * a pre-check. A check that can be overtaken is not a guarantee.
 *
 * Returns whether this caller was the one that applied the change.
 */
export async function transitionBooking(
  tx: Prisma.TransactionClient,
  { bookingId, from, to, data, relations }: TransitionOptions
): Promise<boolean> {
  const result = await tx.booking.updateMany({
    where: { id: bookingId, status: from },
    data: { status: to, ...data },
  });

  if (result.count !== 1) {
    return false;
  }

  if (relations) {
    await tx.booking.update({ where: { id: bookingId }, data: relations });
  }

  return true;
}

/**
 * Releases the `UnavailableDate` rows a booking was holding.
 *
 * Matched by `bookingId`, never by date range, so an owner's own manual block on an overlapping
 * day survives - the availability screen refuses to release booking-held days, and this is the
 * mirror of that rule.
 *
 * Called on completion and cancellation. Completion matters as much as cancellation: a returned
 * item whose dates were never freed leaves the listing unbookable for a period that has already
 * passed, and nothing would ever notice.
 */
export async function releaseHeldDates(
  tx: Prisma.TransactionClient,
  bookingId: string
): Promise<number> {
  const result = await tx.unavailableDate.deleteMany({ where: { bookingId } });

  return result.count;
}
