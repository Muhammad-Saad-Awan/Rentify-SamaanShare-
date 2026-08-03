"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { authorizeListingOwner } from "@/lib/listings/authorize";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { todayInKarachi } from "@/lib/utils/date";
import { availabilityToggleSchema } from "@/lib/validations/listing";

import type { ActionResult } from "@/types";

/**
 * Owner-managed availability.
 *
 * One day per call, rather than "save this month's selection". A range-replace action has
 * to define what happens to days outside the submitted window, and getting that wrong
 * silently deletes blocks the owner cannot see - so the calendar toggles a single day and
 * each call is independently idempotent.
 *
 * `reason` is written as `"owner_blocked"`, matching the vocabulary in the schema comment.
 * Booking-held days carry a `bookingId` instead, and this action never touches them.
 */

/**
 * Toggles per user per minute.
 *
 * High, because blocking a two-week holiday is fourteen clicks and each one is a call.
 * Still bounded, since every call is a write.
 */
const AVAILABILITY_RATE_LIMIT = { limit: 200, windowMs: 60_000 };

const UNEXPECTED_ERROR = "Could not update that date. Please try again.";

export async function toggleListingAvailability(
  input: unknown
): Promise<ActionResult<{ date: string; blocked: boolean }>> {
  const parsed = availabilityToggleSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That date is not valid.",
    };
  }

  const { listingId, date, blocked } = parsed.data;

  const auth = await authorizeListingOwner(listingId);

  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const rate = checkRateLimit(
    `availability:${auth.userId}`,
    AVAILABILITY_RATE_LIMIT
  );

  if (!rate.allowed) {
    return {
      success: false,
      error: `Too many changes at once. Try again in ${rate.retryAfterSeconds}s.`,
    };
  }

  /**
   * Past days are refused.
   *
   * Compared against today in Asia/Karachi, not the server's timezone: a deployed server
   * runs in UTC, so between midnight and 05:00 Karachi time a UTC comparison would still
   * consider it "yesterday" and let an owner block a day that has already begun for them.
   */
  if (date < todayInKarachi()) {
    return { success: false, error: "That date has already passed." };
  }

  // UTC midnight, matching the `@db.Date` column, which stores a calendar day with no
  // time or offset.
  const day = new Date(`${date}T00:00:00.000Z`);

  try {
    if (blocked) {
      await prisma.unavailableDate.upsert({
        // The composite unique makes this idempotent: blocking an already-blocked day is
        // a no-op rather than a constraint violation, which matters because an optimistic
        // UI can send the same toggle twice.
        where: { listingId_date: { listingId: auth.listing.id, date: day } },
        create: {
          listingId: auth.listing.id,
          date: day,
          reason: "owner_blocked",
        },
        // Deliberately empty. If the day is already held by a booking, this must NOT
        // overwrite its `bookingId` and turn it into a releasable owner block.
        update: {},
        select: { id: true },
      });
    } else {
      /**
       * `bookingId: null` is the important half.
       *
       * Without it, an owner could release a day a confirmed booking holds - the item
       * would show as available and be booked twice for the same dates. Only the
       * booking's own lifecycle may free those, which is exactly why the schema records
       * which booking holds each day.
       */
      await prisma.unavailableDate.deleteMany({
        where: { listingId: auth.listing.id, date: day, bookingId: null },
      });
    }
  } catch (error) {
    // A unique violation here would mean two toggles for the same day raced; the outcome
    // the caller asked for is already true, so it is reported as success.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { success: true, data: { date, blocked } };
    }

    console.error("toggleListingAvailability failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }

  // Only the owner's own calendar renders this data today. The public detail page shows no
  // availability yet, so there is nothing else to invalidate.
  revalidatePath(`/dashboard/listings/${auth.listing.id}/availability`, "page");

  return { success: true, data: { date, blocked } };
}
