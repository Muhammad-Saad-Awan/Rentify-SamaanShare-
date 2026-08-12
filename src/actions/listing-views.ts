"use server";

import { headers } from "next/headers";

import { getCurrentUser } from "@/lib/auth/session";
import {
  VIEW_ABUSE_LIMIT,
  VIEW_ABUSE_WINDOW_MS,
  VIEW_DEDUPE_WINDOW_MS,
  viewAbuseKey,
  viewDedupeKey,
} from "@/lib/listings/views";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { VISIBLE_LISTING_WHERE } from "@/lib/queries/visibility";
import { listingIdSchema } from "@/lib/validations/listing";

import type { ActionResult } from "@/types";

/**
 * Records that someone looked at a listing.
 *
 * Called from an effect in the browser rather than during the server render - see the note in
 * `@/lib/listings/views` for why a GET must not do this.
 *
 * ALWAYS REPORTS SUCCESS, whatever happened. A view counter is not something a visitor asked for and
 * has no business producing an error in front of them; the caller ignores the result entirely. The
 * uniform response also means a probe cannot learn from this whether a listing id exists, which
 * matters because it accepts an id from the client.
 *
 * NEVER REVALIDATES. `revalidatePath` here would discard the cached listing page on every view - so
 * the more popular a listing became the less it would be cached, and each fresh render would trigger
 * another view, another revalidation, and so on. The number is read on the owner's dashboard, which
 * renders dynamically and therefore sees it immediately.
 */
export async function recordListingView(input: unknown): Promise<ActionResult> {
  const parsed = listingIdSchema.safeParse(input);

  if (!parsed.success) {
    return { success: true, data: undefined };
  }

  const listingId = parsed.data;

  try {
    /**
     * `getCurrentUser` rather than `getActiveUser`.
     *
     * This writes, so the usual rule would say verify against the database - but the value being
     * written is a counter, not anything a suspended account could exploit, and paying an extra
     * indexed query on every page view to establish that would cost more than the write itself. The
     * session is read only to identify the viewer and to recognise the owner.
     */
    const user = await getCurrentUser();

    /**
     * Who is looking: the account when there is one, the address otherwise.
     *
     * Signed-in users are keyed by id so the same person is deduped across devices and networks.
     * `clientIpFrom` falls back to a shared bucket when no address can be determined, which means
     * anonymous views degrade towards under-counting rather than over-counting. That is the right
     * direction for a number an owner reads as interest.
     */
    const viewerKey = user?.id ?? `ip:${clientIpFrom(await headers())}`;

    // Already counted this viewer for this listing inside the window.
    const dedupe = checkRateLimit(viewDedupeKey(listingId, viewerKey), {
      limit: 1,
      windowMs: VIEW_DEDUPE_WINDOW_MS,
    });

    if (!dedupe.allowed) {
      return { success: true, data: undefined };
    }

    // Catches a script walking the catalogue, which the per-listing key above cannot see.
    const abuse = checkRateLimit(viewAbuseKey(viewerKey), {
      limit: VIEW_ABUSE_LIMIT,
      windowMs: VIEW_ABUSE_WINDOW_MS,
    });

    if (!abuse.allowed) {
      return { success: true, data: undefined };
    }

    /**
     * Must be publicly visible.
     *
     * The shared predicate also covers a suspended owner and a soft-deleted listing, so a paused or
     * removed listing cannot have its count moved by a stale tab still holding the page open.
     */
    const listing = await prisma.listing.findFirst({
      where: { id: listingId, ...VISIBLE_LISTING_WHERE },
      select: { id: true, ownerId: true },
    });

    if (!listing) {
      return { success: true, data: undefined };
    }

    /**
     * An owner viewing their own listing does not count.
     *
     * Checked here as well as on the page, which skips the call entirely for a signed-in owner. Both:
     * the page check saves a round trip, and this one is the actual rule - the action is a public
     * endpoint and the page's decision cannot be trusted to have happened.
     */
    if (user && listing.ownerId === user.id) {
      return { success: true, data: undefined };
    }

    // `increment` is applied by the database, so concurrent views cannot lose each other the way a
    // read-then-write would.
    await prisma.listing.update({
      where: { id: listing.id },
      data: { viewCount: { increment: 1 } },
    });

    return { success: true, data: undefined };
  } catch (error) {
    // Logged, never surfaced. A failed view count must not become a visible error on a page the
    // visitor is trying to read.
    console.error("recordListingView failed", error);

    return { success: true, data: undefined };
  }
}
