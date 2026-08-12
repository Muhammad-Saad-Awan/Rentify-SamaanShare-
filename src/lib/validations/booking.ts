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

export const PICKUP_INSTRUCTIONS_MAX = 1000;

/** An owner's decision on a pending request. */
export const bookingDecisionSchema = z.object({
  bookingId: listingIdSchema,
  /**
   * Sent on approval, shown to the renter afterwards.
   *
   * Optional because an owner may simply accept; the field exists so "where and when to
   * collect" has somewhere to go other than a message the app cannot yet send.
   */
  pickupInstructions: z.string().trim().max(PICKUP_INSTRUCTIONS_MAX).optional(),
});

/**
 * Editing the pickup details after approval.
 *
 * Required and non-empty here, unlike on the decision above. Approving without instructions is a
 * legitimate choice; deliberately *replacing* them with nothing is not - it would delete the only
 * collection details the renter has, and there is no other channel to ask for them back. An owner
 * who wants them gone can say so in words.
 */
export const bookingInstructionsSchema = z.object({
  bookingId: listingIdSchema,
  pickupInstructions: z
    .string()
    .trim()
    .min(1, "Please say where and when to collect the item.")
    .max(PICKUP_INSTRUCTIONS_MAX),
});

export type BookingInstructionsInput = z.infer<
  typeof bookingInstructionsSchema
>;

/** A decline, with an optional reason the renter sees. */
export const bookingDeclineSchema = z.object({
  bookingId: listingIdSchema,
  reason: z.string().trim().max(500).optional(),
});

/**
 * An action that needs nothing but the booking it applies to.
 *
 * Confirming payment, marking the item collected, marking it returned, and recording the deposit
 * as handed back all take exactly this. One schema rather than four identical ones, so they
 * cannot drift apart.
 */
export const bookingActionSchema = z.object({
  bookingId: listingIdSchema,
});

export const CANCEL_REASON_MAX = 500;

/**
 * A cancellation, with an optional reason the other side sees.
 *
 * Optional rather than required: making someone justify a cancellation before allowing it leads
 * to "asdf", not to honesty. The other party is told a reason was not given, which is at least
 * accurate.
 */
export const bookingCancelSchema = z.object({
  bookingId: listingIdSchema,
  reason: z.string().trim().max(CANCEL_REASON_MAX).optional(),
});

/**
 * The payment methods a renter may actually choose.
 *
 * Narrowed to the two offline ones rather than accepting the whole `PaymentMethod` enum. The
 * wallet and card values exist in the schema for the payment providers in Phase 2, and nothing
 * in this phase can process them - a request naming `CREDIT_CARD` would otherwise write a
 * `Payment` row describing a transaction that no code path can ever complete.
 *
 * Kept as a literal union rather than derived from the enum on purpose: this list must NOT grow
 * automatically when a provider is added to the schema. Adding JazzCash means writing the flow
 * that handles it, and that should be a deliberate edit here.
 */
export const OFFLINE_PAYMENT_METHODS = ["CASH", "BANK_TRANSFER"] as const;

export const offlinePaymentMethodSchema = z.enum(OFFLINE_PAYMENT_METHODS);

export type OfflinePaymentMethod = z.infer<typeof offlinePaymentMethodSchema>;

/** The renter choosing how they will pay the owner. */
export const selectPaymentMethodSchema = z.object({
  bookingId: listingIdSchema,
  method: offlinePaymentMethodSchema,
});

export type SelectPaymentMethodInput = z.infer<
  typeof selectPaymentMethodSchema
>;

/** Shared bound so the form and the action agree on the longest rental. */
export { MAX_BOOKING_DAYS };
