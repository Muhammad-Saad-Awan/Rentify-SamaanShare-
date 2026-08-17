"use server";

import { revalidatePath } from "next/cache";

import { BookingStatus, HandoverType } from "@/generated/prisma/enums";
import { getActiveUser } from "@/lib/auth/session";
import { expireStalePendingBookings } from "@/lib/bookings/expire";
import {
  LIFECYCLE_RATE_LIMIT,
  loadBookingForParty,
  releaseHeldDates,
  transitionBooking,
} from "@/lib/bookings/guard";
import {
  canRenterCancel,
  canStartBooking,
  canTransition,
} from "@/lib/bookings/lifecycle";
import { prepareHandover, writeHandoverRecord } from "@/lib/handover/write";
import { emitBookingNotifications } from "@/lib/notifications/create";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { bookingCancelSchema } from "@/lib/validations/booking";
import { handoverRecordSchema } from "@/lib/validations/handover";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ActionResult } from "@/types";

/**
 * The second half of the booking lifecycle: pickup, return, and cancellation.
 *
 * WHY THE OWNER DRIVES PICKUP AND RETURN. Both are physical events the owner witnesses - they
 * hand the item over and they receive it back. A renter-driven "I collected it" would be a claim
 * about someone else's property with nothing behind it, and a renter-driven "I returned it" would
 * let a booking be closed while the owner is still waiting at the door.
 *
 * Neither action re-checks listing visibility, and that is deliberate. `VISIBLE_LISTING_WHERE`
 * guards *booking* a listing, which is where a suspended owner has to be stopped. Applying it
 * here would trap a renter mid-rental: an owner suspended while the camera is out would leave the
 * renter unable to have the return recorded, with the dates held forever and the deposit
 * obligation never starting. An in-flight rental has to be able to finish.
 *
 * THE HANDOVER RECORD IS NOW A CONDITION OF BOTH. Neither transition can happen without a sealed
 * condition record written in the same transaction - see `src/lib/handover/rules.ts`. Requiring it
 * cannot deadlock, because the party performing the transition is the party writing the record; they
 * are not waiting on anybody. The counterparty's agreement is recorded separately and is never
 * required, since blocking on it would let a silent renter freeze an owner's item and calendar.
 */

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

const CONCURRENT_CHANGE_ERROR =
  "This booking was just updated somewhere else. Please refresh and try again.";

/**
 * The owner marks the item as collected, starting the rental.
 *
 * Gated on the payment being *confirmed*, not merely arranged - see `canStartBooking`. Stamps
 * `startedAt`, which `updatedAt` cannot serve as: every later transition overwrites that, so
 * without a dedicated column a completed rental has no record of when it began.
 */
export async function startBooking(
  input: unknown
): Promise<ActionResult<{ status: BookingStatus }>> {
  const parsed = handoverRecordSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        "Please record the item's condition.",
    };
  }

  const owner = await getActiveUser();

  if (!owner) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(
    `booking-lifecycle:${owner.id}`,
    LIFECYCLE_RATE_LIMIT
  );

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many changes just now. Please try again shortly.",
    };
  }

  try {
    const booking = await loadBookingForParty({
      bookingId: parsed.data.bookingId,
      userId: owner.id,
      side: "owner",
    });

    if (!booking) {
      return { success: false, error: "That booking was not found." };
    }

    // Idempotent: already started is the outcome the caller wanted, and re-running must not move
    // `startedAt`.
    if (booking.status === BookingStatus.ACTIVE) {
      return { success: true, data: { status: BookingStatus.ACTIVE } };
    }

    const eligibility = canStartBooking({
      status: booking.status,
      paymentStatus: booking.payment?.status ?? null,
    });

    if (!eligibility.allowed) {
      return { success: false, error: eligibility.reason };
    }

    const handover = await prepareHandover({
      userId: owner.id,
      bookingId: booking.id,
      status: booking.status,
      type: HandoverType.PICKUP,
      input: parsed.data,
    });

    if (!handover.ok) {
      return { success: false, error: handover.error };
    }

    const applied = await prisma.$transaction(async (tx) => {
      const moved = await transitionBooking(tx, {
        bookingId: booking.id,
        from: booking.status,
        to: BookingStatus.ACTIVE,
        data: { startedAt: new Date() },
      });

      if (!moved) {
        return false;
      }

      /**
       * The condition record, in the same transaction as the transition.
       *
       * Not before it and not after: a record without the transition would describe a collection
       * that never happened, and a transition without the record is precisely the evidence-free
       * state this protocol exists to end. Either both land or neither does.
       */
      await writeHandoverRecord(tx, {
        bookingId: booking.id,
        type: HandoverType.PICKUP,
        recordedById: owner.id,
        ...handover.record,
      });

      /**
       * The dates stay held. `ACTIVE` is in `DATE_HOLDING_STATUSES` because the item is
       * physically out - releasing them here would let the listing be booked for days it cannot
       * be delivered on.
       */
      await emitBookingNotifications(tx, {
        event: "picked-up",
        bookingId: booking.id,
        listingTitle: booking.listing.title,
        parties: { renterId: booking.renterId, ownerId: booking.ownerId },
      });

      return true;
    });

    if (!applied) {
      return { success: false, error: CONCURRENT_CHANGE_ERROR };
    }

    revalidateBookingPaths(booking.listingId);

    return { success: true, data: { status: BookingStatus.ACTIVE } };
  } catch (error) {
    console.error("startBooking failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * The owner confirms the item came back, completing the rental.
 *
 * RELEASING THE DATES IS THE ESSENTIAL HALF. `COMPLETED` is not in `DATE_HOLDING_STATUSES`, so a
 * completion that left the `UnavailableDate` rows behind would contradict the one source of truth
 * for whether a booking occupies a calendar - and the availability screen refuses to release
 * booking-held days, so the owner would have no way to clear them. The item is back; the days are
 * bookable again.
 *
 * Stamps `completedAt`, which starts the deposit-return clock and dates the review window.
 */
export async function completeBooking(
  input: unknown
): Promise<ActionResult<{ status: BookingStatus }>> {
  const parsed = handoverRecordSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        "Please record the item's condition.",
    };
  }

  const owner = await getActiveUser();

  if (!owner) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(
    `booking-lifecycle:${owner.id}`,
    LIFECYCLE_RATE_LIMIT
  );

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many changes just now. Please try again shortly.",
    };
  }

  try {
    const booking = await loadBookingForParty({
      bookingId: parsed.data.bookingId,
      userId: owner.id,
      side: "owner",
    });

    if (!booking) {
      return { success: false, error: "That booking was not found." };
    }

    // Idempotent, and re-running must not move `completedAt` - the deposit clock is measured from
    // it, so a second click would silently grant the owner another 48 hours.
    if (
      booking.status === BookingStatus.COMPLETED ||
      booking.status === BookingStatus.REVIEWED
    ) {
      return { success: true, data: { status: booking.status } };
    }

    if (!canTransition(booking.status, BookingStatus.COMPLETED)) {
      return {
        success: false,
        error:
          booking.status === BookingStatus.PAYMENT_PENDING
            ? "Mark the item as collected before completing the rental."
            : "This rental cannot be completed from its current state.",
      };
    }

    const handover = await prepareHandover({
      userId: owner.id,
      bookingId: booking.id,
      status: booking.status,
      type: HandoverType.RETURN,
      input: parsed.data,
    });

    if (!handover.ok) {
      return { success: false, error: handover.error };
    }

    const applied = await prisma.$transaction(async (tx) => {
      const moved = await transitionBooking(tx, {
        bookingId: booking.id,
        from: booking.status,
        to: BookingStatus.COMPLETED,
        data: { completedAt: new Date() },
      });

      if (!moved) {
        return false;
      }

      /**
       * The return condition record, in the same transaction as the completion.
       *
       * This is the one that matters most: `completedAt` starts the 48-hour deposit clock, and the
       * question that clock exists to answer - was anything wrong with the item - had until now no
       * recorded answer at all.
       */
      await writeHandoverRecord(tx, {
        bookingId: booking.id,
        type: HandoverType.RETURN,
        recordedById: owner.id,
        ...handover.record,
      });

      // The item is back, so the days are free. Matched by bookingId, so an owner's own manual
      // block on an overlapping day survives.
      await releaseHeldDates(tx, booking.id);

      await emitBookingNotifications(tx, {
        event: "returned",
        bookingId: booking.id,
        listingTitle: booking.listing.title,
        parties: { renterId: booking.renterId, ownerId: booking.ownerId },
      });

      /**
       * The review prompt, to both sides.
       *
       * This is the Phase 4 half of reviews: the hook that invites them. Writing the review, the
       * `COMPLETED -> REVIEWED` transition and the rating aggregate belong to Phase 5, and the
       * transition table already permits that edge without any action driving it.
       *
       * Sent as a second notification rather than folded into the completion copy, because the
       * two say different things - one is "your rental is finished", the other is a request - and
       * a renter who ignores the first should still see the second in their feed.
       */
      await emitBookingNotifications(tx, {
        event: "review-reminder",
        bookingId: booking.id,
        listingTitle: booking.listing.title,
        parties: { renterId: booking.renterId, ownerId: booking.ownerId },
      });

      return true;
    });

    if (!applied) {
      return { success: false, error: CONCURRENT_CHANGE_ERROR };
    }

    revalidateBookingPaths(booking.listingId);

    return { success: true, data: { status: BookingStatus.COMPLETED } };
  } catch (error) {
    console.error("completeBooking failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * The renter cancels their own booking.
 *
 * Refused once the owner has confirmed receiving payment - see `canRenterCancel` for why that is
 * the honest boundary rather than an arbitrary one. Refused outright once the rental is `ACTIVE`,
 * because there is nothing to cancel when the item is already out.
 *
 * Releases the held dates, which is what makes a cancellation worth anything to the owner.
 */
export async function cancelBooking(
  input: unknown
): Promise<ActionResult<{ status: BookingStatus }>> {
  const parsed = bookingCancelSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: "That booking was not found." };
  }

  const renter = await getActiveUser();

  if (!renter) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(
    `booking-lifecycle:${renter.id}`,
    LIFECYCLE_RATE_LIMIT
  );

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many changes just now. Please try again shortly.",
    };
  }

  const { bookingId, reason } = parsed.data;

  try {
    // A request that expired while the renter had the page open is reported as expired rather
    // than cancelled, so the two outcomes do not get confused in the record.
    await expireStalePendingBookings();

    const booking = await loadBookingForParty({
      bookingId,
      userId: renter.id,
      side: "renter",
    });

    if (!booking) {
      return { success: false, error: "That booking was not found." };
    }

    // Idempotent.
    if (booking.status === BookingStatus.CANCELLED) {
      return { success: true, data: { status: BookingStatus.CANCELLED } };
    }

    const eligibility = canRenterCancel({
      status: booking.status,
      paymentStatus: booking.payment?.status ?? null,
    });

    if (!eligibility.allowed) {
      return { success: false, error: eligibility.reason };
    }

    const applied = await prisma.$transaction(async (tx) => {
      const moved = await transitionBooking(tx, {
        bookingId: booking.id,
        from: booking.status,
        to: BookingStatus.CANCELLED,
        data: {
          cancelledAt: new Date(),
          ...(reason ? { statusReason: reason } : {}),
        },
        // Recorded so the other side can be told who cancelled, which `statusReason` - free text -
        // cannot answer. A nested connect because it is a foreign key; see `transitionBooking`.
        relations: { cancelledBy: { connect: { id: renter.id } } },
      });

      if (!moved) {
        return false;
      }

      await releaseHeldDates(tx, booking.id);

      await emitBookingNotifications(tx, {
        event: "cancelled",
        by: "renter",
        bookingId: booking.id,
        listingTitle: booking.listing.title,
        parties: { renterId: booking.renterId, ownerId: booking.ownerId },
        reason: reason ?? null,
      });

      return true;
    });

    if (!applied) {
      return { success: false, error: CONCURRENT_CHANGE_ERROR };
    }

    revalidateBookingPaths(booking.listingId);

    return { success: true, data: { status: BookingStatus.CANCELLED } };
  } catch (error) {
    console.error("cancelBooking failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * Refreshes the surfaces a lifecycle change touches.
 *
 * `/listings` is included because completion and cancellation both free dates, which changes
 * date-filtered browse results. The layout revalidation is for the unread badge in the header.
 */
function revalidateBookingPaths(listingId: string): void {
  for (const path of [
    "/dashboard/requests",
    "/dashboard/bookings",
    "/dashboard/notifications",
    `/dashboard/listings/${listingId}/availability`,
    "/listings",
  ]) {
    revalidatePath(path, "page");
  }

  revalidatePath("/dashboard", "layout");
}
