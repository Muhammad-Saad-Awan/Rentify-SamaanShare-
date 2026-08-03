"use server";

import { revalidatePath } from "next/cache";

import { ListingStatus } from "@/generated/prisma/enums";
import { getActiveUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { savedListingSchema } from "@/lib/validations/saved-listing";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ActionResult } from "@/types";

/**
 * Wishlist mutations.
 *
 * These use `getActiveUser()` rather than `requireUser()`, which redirects. A
 * redirect is right for a page and wrong here: a Server Action invoked from a heart
 * button should hand a result back to the component that called it, so the optimistic
 * toggle can roll back and explain itself. A redirect would instead yank the whole
 * page out from under the user mid-click. Both verify against the database.
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

/**
 * Per-user budget for wishlist writes.
 *
 * Generous enough that no real person notices - saving a dozen items while browsing
 * is nothing - and low enough that a script cannot use these endpoints to generate
 * unbounded rows. Keyed on the user id rather than the IP, so it cannot be evaded by
 * rotating addresses and cannot punish several users behind one NAT.
 */
const WISHLIST_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

/** Shown when the database itself fails. Deliberately vague; details go to logs. */
const UNEXPECTED_ERROR =
  "Something went wrong saving that. Please try again in a moment.";

export async function saveListing(
  listingId: string
): Promise<ActionResult<{ saved: true }>> {
  const context = await resolveContext(listingId);

  if (!context.ok) {
    return { success: false, error: context.error };
  }

  try {
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
  } catch (error) {
    // Without this the promise rejects, the client's `await` throws inside its
    // transition, and the optimistic heart silently reverts with nothing said. A
    // returned failure is what lets the button explain itself.
    console.error("saveListing failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }

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

  try {
    // deleteMany, not delete: `delete` throws when the row is absent, and unsaving
    // something already unsaved is a no-op, not an error. This makes the action
    // idempotent, which matters because the optimistic UI can send it twice.
    await prisma.savedListing.deleteMany({
      where: { userId: context.userId, listingId: context.listingId },
    });
  } catch (error) {
    console.error("unsaveListing failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }

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

  // Database-verified rather than read from the token, which is up to 24h stale -
  // so a user banned an hour ago cannot still write rows. Non-redirecting, because
  // an action must hand a result back rather than navigate the page away.
  const user = await getActiveUser();

  if (!user) {
    return { ok: false, error: UNAUTHENTICATED_ERROR };
  }

  // Rated after authentication so the limit is per account, and so an unauthenticated
  // flood is rejected by the cheaper check above without consuming anyone's budget.
  const rate = checkRateLimit(`wishlist:${user.id}`, WISHLIST_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      ok: false,
      error: `Too many changes at once. Try again in ${rate.retryAfterSeconds}s.`,
    };
  }

  let listing;

  try {
    listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { status: true, deletedAt: true },
    });
  } catch (error) {
    console.error("resolveContext listing lookup failed", error);

    return { ok: false, error: UNEXPECTED_ERROR };
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
