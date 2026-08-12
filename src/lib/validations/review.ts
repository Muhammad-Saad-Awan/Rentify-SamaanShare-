import { z } from "zod";

import {
  RATING_MAX,
  RATING_MIN,
  REVIEW_COMMENT_MAX,
} from "@/lib/reviews/rules";
import { listingIdSchema } from "@/lib/validations/listing";

/**
 * Review input rules.
 *
 * NOTE WHAT IS ABSENT: `type`, `revieweeId` and `reviewerId`. All three are derived on the server
 * from the caller's role in the booking. Accepting any of them would let a renter file an
 * owner-to-renter review - their words on the owner's record, the rating aimed at themselves - which
 * is the single most damaging thing a client could ask for here.
 */

export const createReviewSchema = z.object({
  bookingId: listingIdSchema,

  /**
   * Whole stars only.
   *
   * `int()` before the range check, so 4.5 is rejected as "not a whole number" rather than passing a
   * bounds test and then being silently truncated by the `Int` column.
   */
  rating: z
    .number()
    .int({ error: "Choose a whole number of stars." })
    .min(RATING_MIN, { error: `Rating must be at least ${RATING_MIN}.` })
    .max(RATING_MAX, { error: `Rating must be at most ${RATING_MAX}.` }),

  /**
   * Optional, and empty is normalised away rather than stored.
   *
   * A rating alone is a legitimate review - forcing prose produces "good" and "ok", which tells the
   * next person nothing. But an empty string in the column would render as an empty quote block, so
   * it becomes `undefined` and the field stays null.
   */
  comment: z
    .string()
    .trim()
    .max(REVIEW_COMMENT_MAX, {
      error: `Keep the review under ${REVIEW_COMMENT_MAX} characters.`,
    })
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
