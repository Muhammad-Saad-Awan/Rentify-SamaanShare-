import { z } from "zod";

/**
 * Input schema for the wishlist actions.
 *
 * Deliberately NOT `z.cuid()`, even though `Listing.id` is `@default(cuid())`.
 * An id only has to be *shaped* like an identifier for the lookup that follows to
 * be safe - and the demo seed assigns readable ids like `demo-listing-01`, which a
 * cuid check would reject. That would make every seeded listing unsaveable while
 * the schema looked correct.
 *
 * What this does guarantee is that the value is a bounded, opaque token: the
 * charset excludes anything that could be mistaken for a path or an operator, and
 * the length cap keeps a hand-crafted request from sending a megabyte of "id" to
 * Postgres. Whether the listing *exists and is visible* is not a validation
 * question - only the database can answer it, and the actions do ask.
 */
export const savedListingSchema = z.object({
  listingId: z
    .string()
    .min(1, { error: "A listing is required." })
    .max(64, { error: "That listing reference is not valid." })
    .regex(/^[A-Za-z0-9_-]+$/, {
      error: "That listing reference is not valid.",
    }),
});

export type SavedListingInput = z.infer<typeof savedListingSchema>;
