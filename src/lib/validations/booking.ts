import { z } from "zod";

import { MAX_BOOKING_DAYS } from "@/lib/bookings/pricing";
import { calendarDateSchema, listingIdSchema } from "@/lib/validations/listing";

/**
 * Booking request rules.
 *
 * Reuses `calendarDateSchema` and `listingIdSchema` from the listing validations rather than
 * redeclaring them - the date check in particular is the one that rejects `2026-02-31`, which
 * matches the pattern but is not a real day.
 *
 * Note what is NOT here: a total price. The server recomputes it from the listing's own rates,
 * so there is nothing for a client to assert. Nor a payment method: `Booking` has no such
 * column - it lives on `Payment` - and creating that row belongs with the payment slice.
 */

export const NOTES_MAX = 500;

export const createBookingRequestSchema = z
  .object({
    listingId: listingIdSchema,
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
    notes: z.string().trim().max(NOTES_MAX).optional(),
  })
  .superRefine((value, ctx) => {
    // String comparison is safe because both are validated `YYYY-MM-DD`, which sorts
    // chronologically.
    if (value.endDate < value.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The return date cannot be before the start date.",
      });
    }
  });

export type CreateBookingRequestInput = z.infer<
  typeof createBookingRequestSchema
>;

/** An owner's decision on a pending request. */
export const bookingDecisionSchema = z.object({
  bookingId: listingIdSchema,
  /**
   * Sent on approval, shown to the renter afterwards.
   *
   * Optional because an owner may simply accept; the field exists so "where and when to
   * collect" has somewhere to go other than a message the app cannot yet send.
   */
  pickupInstructions: z.string().trim().max(1000).optional(),
});

/** A decline, with an optional reason the renter sees. */
export const bookingDeclineSchema = z.object({
  bookingId: listingIdSchema,
  reason: z.string().trim().max(500).optional(),
});

/** Shared bound so the form and the action agree on the longest rental. */
export { MAX_BOOKING_DAYS };
