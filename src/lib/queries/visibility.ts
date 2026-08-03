import { ListingStatus, UserStatus } from "@/generated/prisma/enums";

import type { Prisma } from "@/generated/prisma/client";

/**
 * The single definition of "a listing the public may see".
 *
 * Every public read - browse, search, filters, category pages, the homepage, the
 * detail page, the similar-listings row, saved listings, and every count that
 * accompanies them - composes this. It exists as one constant because the failure
 * mode of duplicating it is silent: a count computed with a looser predicate than
 * the page it labels produces a category tile promising items that are not there,
 * and nothing errors.
 *
 * Three conditions, and the owner clause is the one that is easy to forget:
 *
 *   - `status: ACTIVE`     excludes drafts, paused and rejected listings.
 *   - `deletedAt: null`    excludes soft-deleted rows. Both are required: D3 pairs
 *                          the DELETED status with a timestamp, and a row carrying
 *                          one without the other must still stay hidden.
 *   - the owner must be active and not soft-deleted. Users are never physically
 *                          deleted (D3) and `Listing.owner` is `onDelete: Restrict`,
 *                          so a banned or deleted account KEEPS its listings. Without
 *                          this clause, banning someone leaves their inventory
 *                          publicly rentable - which is the normal end state of
 *                          moderation, not an edge case.
 */
export const VISIBLE_LISTING_WHERE = {
  status: ListingStatus.ACTIVE,
  deletedAt: null,
  owner: {
    status: UserStatus.ACTIVE,
    deletedAt: null,
  },
} as const satisfies Prisma.ListingWhereInput;

/**
 * The same rule expressed for a relation named `listing`.
 *
 * Used by `SavedListing` queries, which filter the listing through its relation
 * rather than as the top-level model. Derived from the constant above so the two
 * cannot drift.
 */
export const VISIBLE_LISTING_RELATION_WHERE = {
  listing: VISIBLE_LISTING_WHERE,
} as const satisfies Prisma.SavedListingWhereInput;
