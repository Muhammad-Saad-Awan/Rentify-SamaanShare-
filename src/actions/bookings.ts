"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { BookingStatus } from "@/generated/prisma/enums";
import { getActiveUser } from "@/lib/auth/session";
import { expireStalePendingBookings } from "@/lib/bookings/expire";
import { canTransition } from "@/lib/bookings/lifecycle";
import {
  calculateRentalPrice,
  countRentalDays,
  enumerateRentalDays,
  MAX_BOOKING_DAYS,
} from "@/lib/bookings/pricing";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { VISIBLE_LISTING_WHERE } from "@/lib/queries/visibility";
import { todayInKarachi } from "@/lib/utils/date";
import {
  bookingDeclineSchema,
  bookingDecisionSchema,
  createBookingRequestSchema,
} from "@/lib/validations/booking";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ActionResult } from "@/types";

/**
 * Booking request and the owner's decision on it.
 *
 * All three return results rather than redirecting - they are invoked from forms and buttons
 * that need to render the outcome - and all three verify the caller against the database via
 * `getActiveUser`, so a suspended account cannot book or approve.
 */

/** Requests per renter per hour. A real person books a handful; a script would not. */
const REQUEST_RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };

/** Owner decisions per hour. Generous: working through a backlog is normal. */
const DECISION_RATE_LIMIT = { limit: 100, windowMs: 60 * 60 * 1000 };

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

const DATES_TAKEN_ERROR =
  "Some of those dates were just taken. Please pick another range.";

/**
 * Whether a thrown error is the date-uniqueness constraint firing.
 *
 * NOT just P2002, and that cost a wrong error message. Measured with two concurrent requests
 * for the same days: exactly one succeeded and the loser threw **P2028** - a transaction API
 * error wrapping the inner unique violation - not the bare P2002 the code originally looked
 * for. The loser would have been told "something went wrong" for what is a normal, expected
 * outcome with a precise explanation available.
 *
 * P2028 is matched only when its message names a unique constraint, so a genuine transaction
 * timeout still surfaces as an unexpected failure rather than being mislabelled as a date
 * clash. The only unique constraint reachable inside this transaction is
 * `UnavailableDate(listingId, date)`.
 */
function isDateConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code === "P2002") {
    return true;
  }

  return error.code === "P2028" && /unique constraint/i.test(error.message);
}

/**
 * Creates a PENDING booking request that reserves its dates.
 *
 * THE CONFLICT PROBLEM, AND HOW IT IS SOLVED. Two renters requesting the same dates at the
 * same moment both pass an availability check and both write - the same time-of-check to
 * time-of-use race as the listing photo reuse. Checking harder does not fix it; only the
 * database can decide. `UnavailableDate` has `@@unique([listingId, date])`, so the day rows
 * are inserted in the SAME transaction as the booking and the second writer loses on the
 * constraint. The explicit check that runs first exists purely to give a good error message
 * in the common case, not to prevent the race.
 *
 * PENDING holds the dates deliberately. The alternative - reserving only on approval - lets an
 * owner approve two requests for the same days and tell one renter yes and then no. The cost
 * is that a request occupies a calendar while it waits, which is what the 48-hour expiry is
 * for; stale holds are swept below before availability is judged.
 */
export async function createBookingRequest(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const parsed = createBookingRequestSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the dates.",
    };
  }

  const renter = await getActiveUser();

  if (!renter) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(
    `booking-request:${renter.id}`,
    REQUEST_RATE_LIMIT
  );

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many requests just now. Please try again shortly.",
    };
  }

  const { listingId, startDate, endDate, notes } = parsed.data;

  // A past start date is refused against the market's today, not the server's: on a UTC host
  // it is still "yesterday" in Karachi until 05:00, which would let a renter book a day that
  // has already begun for them.
  if (startDate < todayInKarachi()) {
    return { success: false, error: "That start date has already passed." };
  }

  const days = countRentalDays(startDate, endDate);

  if (days <= 0) {
    return { success: false, error: "Please choose a valid date range." };
  }

  if (days > MAX_BOOKING_DAYS) {
    return {
      success: false,
      error: `A single booking cannot exceed ${MAX_BOOKING_DAYS} days.`,
    };
  }

  try {
    // Sweep first, so dates held by an abandoned request are free before availability is
    // judged. Scoped to this listing - see `expireStalePendingBookings`.
    await expireStalePendingBookings(listingId);

    // Must be publicly visible: the shared predicate also covers a suspended owner, so a
    // banned owner's listing cannot be booked even by a direct call.
    const listing = await prisma.listing.findFirst({
      where: { id: listingId, ...VISIBLE_LISTING_WHERE },
      select: {
        id: true,
        ownerId: true,
        pricePerDay: true,
        pricePerWeek: true,
        pricePerMonth: true,
        securityDeposit: true,
      },
    });

    if (!listing) {
      return { success: false, error: "That listing is not available." };
    }

    // Renting from yourself is not a transaction; it would also let an owner block their own
    // calendar through the booking flow rather than the availability one.
    if (listing.ownerId === renter.id) {
      return { success: false, error: "You cannot book your own listing." };
    }

    const wanted = enumerateRentalDays(startDate, endDate);

    // The friendly pre-check. Covers owner blocks and other bookings alike, because both are
    // rows in the same table.
    const clash = await prisma.unavailableDate.findFirst({
      where: {
        listingId: listing.id,
        date: { in: wanted.map(toUtcDate) },
      },
      select: { date: true },
    });

    if (clash) {
      return {
        success: false,
        error:
          "Some of those dates are not available. Please pick another range.",
      };
    }

    /**
     * Price computed from the listing's own rates, never from the request.
     *
     * The form shows the same figure, but only so the renter is not surprised - the number
     * written to the booking is this one.
     */
    const quote = calculateRentalPrice(days, {
      pricePerDay: listing.pricePerDay,
      pricePerWeek: listing.pricePerWeek,
      pricePerMonth: listing.pricePerMonth,
    });

    const booking = await prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          listingId: listing.id,
          renterId: renter.id,
          ownerId: listing.ownerId,
          startDate: toUtcDate(startDate),
          endDate: toUtcDate(endDate),
          totalPrice: quote.total,
          // Captured at booking time, so a later change to the listing does not rewrite what
          // this renter agreed to.
          securityDeposit: listing.securityDeposit,
          status: BookingStatus.PENDING,
          ...(notes ? { notes } : {}),
        },
        select: { id: true },
      });

      // Same transaction as the booking. This is the line that makes the race impossible:
      // a concurrent request for any overlapping day fails the unique constraint here, and
      // its booking is rolled back with it.
      await tx.unavailableDate.createMany({
        data: wanted.map((day) => ({
          listingId: listing.id,
          date: toUtcDate(day),
          reason: "booked",
          bookingId: created.id,
        })),
      });

      return created;
    });

    revalidateBookingPaths(listing.id);

    return { success: true, data: { id: booking.id } };
  } catch (error) {
    // Another request claimed one of these days between the check and the write. The expected
    // outcome of the race, not a fault - so it gets a clear message rather than a generic one.
    if (isDateConflict(error)) {
      return { success: false, error: DATES_TAKEN_ERROR };
    }

    console.error("createBookingRequest failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * Approves a pending request.
 *
 * The dates are already held from the request, so approval changes status and nothing else -
 * there is no window here where the booking is approved but the calendar is free.
 */
export async function acceptBooking(
  input: unknown
): Promise<ActionResult<{ status: BookingStatus }>> {
  const parsed = bookingDecisionSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: "That request was not found." };
  }

  return decide({
    bookingId: parsed.data.bookingId,
    to: BookingStatus.APPROVED,
    ...(parsed.data.pickupInstructions
      ? { pickupInstructions: parsed.data.pickupInstructions }
      : {}),
  });
}

/**
 * Declines a pending request and releases its dates.
 *
 * Releasing is the essential half. A declined request that kept its hold would block the
 * owner's own calendar with no way to clear it - the availability screen refuses to release
 * booking-held days by design.
 */
export async function declineBooking(
  input: unknown
): Promise<ActionResult<{ status: BookingStatus }>> {
  const parsed = bookingDeclineSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: "That request was not found." };
  }

  return decide({
    bookingId: parsed.data.bookingId,
    to: BookingStatus.DECLINED,
    releaseDates: true,
    ...(parsed.data.reason ? { statusReason: parsed.data.reason } : {}),
  });
}

interface DecideOptions {
  bookingId: string;
  to: BookingStatus;
  releaseDates?: boolean;
  pickupInstructions?: string;
  statusReason?: string;
}

/**
 * The shared owner-decision path.
 *
 * Both decisions need the same four things - an active session, ownership of the booking, a
 * legal transition, and a rate limit - so they share one implementation. A check present in
 * accept and missing in decline is exactly how one of them ends up looser.
 *
 * Ownership is part of the query rather than a comparison afterwards, and a booking that is
 * not the caller's returns the same "not found" as one that does not exist, so this cannot be
 * used to probe for booking ids.
 */
async function decide({
  bookingId,
  to,
  releaseDates = false,
  pickupInstructions,
  statusReason,
}: DecideOptions): Promise<ActionResult<{ status: BookingStatus }>> {
  const owner = await getActiveUser();

  if (!owner) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(
    `booking-decision:${owner.id}`,
    DECISION_RATE_LIMIT
  );

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many changes just now. Please try again shortly.",
    };
  }

  try {
    // Sweep before reading, so a request that expired while the owner had the page open is
    // reported as expired rather than silently approved.
    await expireStalePendingBookings();

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, ownerId: owner.id },
      select: { id: true, status: true, listingId: true },
    });

    if (!booking) {
      return { success: false, error: "That request was not found." };
    }

    // Idempotent: already in the target state is the outcome the caller wanted.
    if (booking.status === to) {
      return { success: true, data: { status: to } };
    }

    if (!canTransition(booking.status, to)) {
      return {
        success: false,
        error:
          booking.status === BookingStatus.EXPIRED
            ? "That request expired before you responded."
            : "That request can no longer be changed.",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: to,
          ...(pickupInstructions ? { pickupInstructions } : {}),
          ...(statusReason ? { statusReason } : {}),
        },
      });

      if (releaseDates) {
        // Matched by `bookingId`, so an owner's own manual block on the same day survives.
        await tx.unavailableDate.deleteMany({
          where: { bookingId: booking.id },
        });
      }
    });

    revalidateBookingPaths(booking.listingId);

    return { success: true, data: { status: to } };
  } catch (error) {
    console.error("booking decision failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/** `YYYY-MM-DD` to UTC midnight, matching the `@db.Date` columns. */
function toUtcDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/**
 * Refreshes the surfaces a booking changes.
 *
 * The owner's requests screen and the renter's bookings screen both list them, and the
 * listing's availability calendar shows the held days. Browse is included because a booking
 * removes the listing from date-filtered results.
 */
function revalidateBookingPaths(listingId: string): void {
  for (const path of [
    "/dashboard/requests",
    "/dashboard/bookings",
    `/dashboard/listings/${listingId}/availability`,
    "/listings",
  ]) {
    revalidatePath(path, "page");
  }
}
