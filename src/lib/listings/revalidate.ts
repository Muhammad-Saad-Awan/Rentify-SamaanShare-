import { revalidatePath } from "next/cache";

/**
 * Cache invalidation for listing writes, in one place.
 *
 * Every surface a listing appears on has to be refreshed together, and the set is easy
 * to under-specify from inside an individual action - a new listing that shows up on
 * browse but not on the homepage looks like a bug in the homepage.
 *
 * These routes are all dynamic, so this is not about a stale full-route cache: it clears
 * the client-side Router Cache, so navigating back to a page already visited shows the
 * change rather than a remembered copy.
 */
export function revalidateListingPaths(listingId?: string): void {
  const paths: { path: string; type: "page" }[] = [
    { path: "/", type: "page" },
    { path: "/listings", type: "page" },
    // Route pattern, not one slug: listing one category would leave the other six stale.
    { path: "/categories/[slug]", type: "page" },
    { path: "/dashboard/listings", type: "page" },
    // The wishlist renders listing cards, and a paused or deleted listing must drop out
    // of it rather than linger until the next hard reload.
    { path: "/saved", type: "page" },
  ];

  if (listingId) {
    // The concrete path, because a visitor may be sitting on exactly this listing - and
    // for an edit or a pause, its own page is the one most obviously wrong if stale.
    paths.push({ path: `/listings/${listingId}`, type: "page" });
  }

  for (const { path, type } of paths) {
    revalidatePath(path, type);
  }
}
