import { getActiveUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { listingIdSchema } from "@/lib/validations/listing";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ListingStatus } from "@/generated/prisma/enums";

/**
 * The authorization boundary for every owner-side listing mutation.
 *
 * Server-only. Used by `updateListing`, `updateListingStatus`, `deleteListing` and the
 * availability actions, so all four agree on what "your listing" means - a check
 * present in one and missing in another is how a write path ends up looser than its
 * neighbours.
 */

export interface OwnedListing {
  id: string;
  status: ListingStatus;
}

export type ListingAuthorization =
  | { ok: true; userId: string; listing: OwnedListing }
  | { ok: false; error: string };

/**
 * Deliberately identical for "no such listing" and "not yours".
 *
 * Distinguishing them would turn any mutation into an existence oracle: an attacker
 * could walk ids and learn which ones are real from the difference in wording. It also
 * covers the soft-deleted case, so a deleted listing behaves as gone rather than
 * reporting a state its owner cannot act on.
 */
const NOT_FOUND = "That listing was not found.";

/**
 * Resolves a listing the current user is allowed to modify.
 *
 * Three conditions, and the ordering matters: the session is checked before the
 * database is touched, so an unauthenticated caller costs nothing, and the
 * owner filter is part of the query rather than a comparison afterwards - a
 * `findUnique` followed by `if (listing.ownerId !== user.id)` is the same logic, but it
 * loads someone else's row into memory first and invites a later refactor to forget the
 * comparison.
 *
 * `deletedAt: null` excludes soft-deleted listings. Restoring one is not an owner
 * operation in this phase, so nothing should be able to edit, pause or re-delete it.
 *
 * Uses `getActiveUser()`, so a suspended owner is refused - the same rule the wishlist
 * and create actions apply.
 */
export async function authorizeListingOwner(
  rawListingId: string
): Promise<ListingAuthorization> {
  const parsed = listingIdSchema.safeParse(rawListingId);

  if (!parsed.success) {
    return { ok: false, error: NOT_FOUND };
  }

  const user = await getActiveUser();

  if (!user) {
    return { ok: false, error: UNAUTHENTICATED_ERROR };
  }

  const listing = await prisma.listing.findFirst({
    where: { id: parsed.data, ownerId: user.id, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!listing) {
    return { ok: false, error: NOT_FOUND };
  }

  return { ok: true, userId: user.id, listing };
}
