import { z } from "zod";

import { listingIdSchema } from "@/lib/validations/listing";
import {
  PAYMENT_REASON_MAX,
  TRANSACTION_REF_MAX,
} from "@/lib/validations/payment";

/**
 * Settlement inputs.
 *
 * WHAT IS CONSPICUOUSLY ABSENT: any amount. No schema here accepts a rental figure, a commission,
 * a payout or a deposit, because none of those is the administrator's to type - they are derived
 * in `lib/payments/settlement.ts` from the verified payment and the resolved claim. A field the
 * form does not have is a field nobody can be talked into filling in wrongly, and a payout
 * override is exactly the field a social-engineering attempt would aim at.
 *
 * What an administrator does supply is the evidence of a transfer they made outside this system:
 * a reference, and free text for whatever the reference cannot carry.
 */

/** Matches `Settlement.notes`, which is `@db.Text` - the cap is editorial, not structural. */
export const SETTLEMENT_NOTES_MAX = 1_000;

/**
 * TWO KINDS OF FREE TEXT, AND THEY GO TO DIFFERENT PLACES.
 *
 * `notes` below is stored on the `Settlement` row: a standing remark about the settlement itself,
 * which any screen showing it will show. `note` on the payout is not stored there at all - it goes
 * into the audit reason, because it describes one act rather than the settlement, and the audit
 * trail is append-only where a column is not. A late transfer explained in the row would be
 * overwritten by the next edit; in the audit it stays.
 */

/**
 * Recording that a finished rental has been settled.
 *
 * Only the booking. See the note above on the absence of amounts.
 */
export const settleBookingSchema = z.object({
  bookingId: listingIdSchema,
  notes: z.string().trim().max(SETTLEMENT_NOTES_MAX).optional(),
});

/**
 * Recording the transfer that actually paid the owner.
 *
 * The reference is REQUIRED, unlike the note on a verification. This is the platform asserting
 * that money left its account, and an assertion with nothing to reconcile against is one nobody
 * can check afterwards - which is the whole reason the column exists.
 */
export const recordOwnerPayoutSchema = z.object({
  bookingId: listingIdSchema,
  payoutRef: z
    .string()
    .trim()
    .min(1, { error: "Enter the reference for the transfer to the owner." })
    .max(TRANSACTION_REF_MAX, {
      error: `A transfer reference is at most ${TRANSACTION_REF_MAX} characters.`,
    }),
  /** Recorded in the audit trail, not on the settlement row - see the note above. */
  note: z.string().trim().max(PAYMENT_REASON_MAX).optional(),
});

export type SettleBookingInput = z.infer<typeof settleBookingSchema>;
export type RecordOwnerPayoutInput = z.infer<typeof recordOwnerPayoutSchema>;
