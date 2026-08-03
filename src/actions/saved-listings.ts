"use server";

import { revalidatePath } from "next/cache";

import { ListingStatus, UserStatus } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { savedListingSchema } from "@/lib/validations/saved-listing";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ActionResult } from "@/types";

/**
 * Wishlist mutations.
 *
 * These deliberately do NOT call `requireUser()` / `requireActiveUser()`. Those
 * helpers `redirect()`, which is right for a page but wrong here: a Server Action
 * invoked from a heart button should hand a result back to the component that
 * called it, so the optimistic toggle can roll back and explain itself. A redirect
 * would instead yank the whole page out from under the user mid-click.
 *
 * Authorization is still enforced here rather than trusted from the UI. The button
 * is only rendered for signed-in users, but a Server Action is a POST endpoint -
 * anyone can call it directly - so the session check below is the real boundary,
 * not a formality.
 */

/**
 * Every surface that renders a saved state, refreshed after a change.
 *
 * `/categories/[slug]` is given as its route pattern rather than a concrete path,
 * which is how `revalidatePath` invalidates all pages of a dynamic segment at once
 * - listing one slug would leave the other six stale.
 */
const AFFECTED_PATHS = [
  { path: "/saved", type: "page" },
  { path: "/listings", type: "page" },
  { path: "/categories/[slug]", type: "page" },
  { path: "/", type: "page" },
] as const;

export async function saveListing(
  listingId: string
): Promise<ActionResult<{ saved: true }>> {
  const context = await resolveContext(listingId);

  if (!context.ok) {
    return { success: false, error: context.error };
  }

  // Upsert rather than create: two rapid clicks, or a stale UI that thinks the
  // listing is unsaved, would otherwise collide with @@unique([userId, listingId])
  // and surface a database error for what is a no-op. `update: {}` makes the
  // second call succeed without touching `createdAt`, so the wishlist's ordering
  // does not jump when a save is repeated.
  await prisma.savedListing.upsert({
    where: {
      userId_listingId: {
        userId: context.userId,
        listingId: context.listingId,
      },
    },
    create: { userId: context.userId, listingId: context.listingId },
    update: {},
    select: { id: true },
  });

  revalidate();

  return { success: true, data: { saved: true } };
}

export async function unsaveListing(
  listingId: string
): Promise<ActionResult<{ saved: false }>> {
  const context = await resolveContext(listingId, {
    // Unsaving must work even for a listing that has since been paused or
    // deleted. Requiring visibility here would trap those rows in the user's
    // wishlist with no way to remove them.
    requireVisibleListing: false,
  });

  if (!context.ok) {
    return { success: false, error: context.error };
  }

  // deleteMany, not delete: `delete` throws when the row is absent, and unsaving
  // something already unsaved is a no-op, not an error. This makes the action
  // idempotent, which matters because the optimistic UI can send it twice.
  await prisma.savedListing.deleteMany({
    where: { userId: context.userId, listingId: context.listingId },
  });

  revalidate();

  return { success: true, data: { saved: false } };
}

type ActionContext =
  | { ok: true; userId: string; listingId: string }
  | { ok: false; error: string };

interface ResolveContextOptions {
  /** Whether the listing must currently be publicly visible. */
  requireVisibleListing?: boolean;
}

/**
 * Validates the input, the session and the listing, in that order.
 *
 * Shared by both actions so the two cannot drift on what they accept - a check
 * present in one and missing in the other is exactly how a write path ends up
 * looser than its counterpart.
 */
async function resolveContext(
  rawListingId: string,
  { requireVisibleListing = true }: ResolveContextOptions = {}
): Promise<ActionContext> {
  const parsed = savedListingSchema.safeParse({ listingId: rawListingId });

  if (!parsed.success) {
    return { ok: false, error: "That listing reference is not valid." };
  }

  const { listingId } = parsed.data;

  const user = await getCurrentUser();

  if (!user) {
    return { ok: false, error: UNAUTHENTICATED_ERROR };
  }

  // The account's *current* state, not the snapshot in the JWT. `status` in the
  // token is up to 24h stale, so without this a user banned an hour ago could
  // still write rows. Same reasoning as `requireActiveUser`, minus the redirect.
  const [account, listing] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { status: true, deletedAt: true },
    }),
    prisma.listing.findUnique({
      where: { id: listingId },
      select: { status: true, deletedAt: true },
    }),
  ]);

  if (!account || account.deletedAt || account.status !== UserStatus.ACTIVE) {
    return { ok: false, error: UNAUTHENTICATED_ERROR };
  }

  if (!listing) {
    return { ok: false, error: "That listing no longer exists." };
  }

  if (
    requireVisibleListing &&
    (listing.deletedAt || listing.status !== ListingStatus.ACTIVE)
  ) {
    // Without this, a guessed id would let anyone pin a draft or rejected listing
    // to their wishlist and watch for it to go live.
    return { ok: false, error: "That listing is not available to save." };
  }

  return { ok: true, userId: user.id, listingId };
}

/**
 * Refreshes the pages whose rendered output depends on saved state.
 *
 * `/saved` because its contents change outright; the browse, category and home
 * routes because each card there renders a filled or empty heart.
 *
 * These routes are all dynamic, so this is not about a stale full-route cache - it
 * clears the client-side Router Cache, so a soft navigation back to a page the user
 * already visited shows the new state instead of a remembered heart. It also
 * refreshes the current route, which is what lets `useOptimistic` hand back to real
 * server state rather than staying optimistic indefinitely.
 */
function revalidate(): void {
  for (const { path, type } of AFFECTED_PATHS) {
    revalidatePath(path, type);
  }
}
