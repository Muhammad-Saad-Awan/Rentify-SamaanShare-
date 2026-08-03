import { HeartIcon } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import {
  ABOVE_FOLD_PRIORITY_COUNT,
  ListingsGrid,
} from "@/components/marketplace/listings-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { getSavedListings } from "@/lib/queries/saved-listings";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Saved Listings",
  description: "Listings you have saved for later on SamaanShare.",
};

interface SavedListingsPageProps {
  searchParams: Promise<{ page?: string | string[] }>;
}

/**
 * The signed-in user's wishlist.
 *
 * Lives at `/saved`, not `/dashboard/saved`, matching `/profile` and `/settings`:
 * the `(dashboard)` route group supplies the sidebar and header without forcing a
 * URL prefix. `/saved` is registered in `PROTECTED_PREFIXES`, so middleware sends a
 * signed-out visitor to login with a `callbackUrl` back here.
 *
 * `requireUser()` runs here as well as in the group layout, deliberately: React
 * reuses a layout across client-side navigations without re-executing it, so the
 * layout's check cannot be relied on for a page reached from another dashboard
 * route.
 *
 * Scoping is by `user.id` from the session and never from a parameter - there is no
 * way to address someone else's wishlist, because no identifier for one is accepted.
 */
export default async function SavedListingsPage({
  searchParams,
}: SavedListingsPageProps) {
  const user = await requireUser();
  const { page: rawPage } = await searchParams;

  const { items, total, page, totalPages } = await getSavedListings({
    userId: user.id,
    page: parsePageParam(rawPage),
  });

  return (
    <>
      <PageHeader
        title="Saved Listings"
        description={
          total === 0
            ? "Items you save while browsing will collect here."
            : `${total === 1 ? "1 item" : `${total} items`} saved for later.`
        }
      />

      {/*
        Every card here is saved by definition, so `savedListingIds` is the set of
        everything on the page. Passing it rather than hardcoding `isSaved` keeps
        the grid's contract identical on all four surfaces that render it.
      */}
      <ListingsGrid
        listings={items}
        savedListingIds={new Set(items.map((item) => item.id))}
        isAuthenticated
        // The page's main content, directly under the title block.
        priorityCount={ABOVE_FOLD_PRIORITY_COUNT}
      />

      {items.length === 0 &&
        (total === 0 ? (
          <EmptyState
            icon={HeartIcon}
            title="Nothing saved yet"
            description="Tap the heart on any listing while browsing and it will appear here, ready for when you need it."
            action={
              <Button size="sm" render={<Link href="/listings" />}>
                Browse listings
              </Button>
            }
          />
        ) : (
          // Reachable by unsaving the last item on a page, or by editing `?page=`.
          <EmptyState
            icon={HeartIcon}
            title="No saved listings on this page"
            description={`There ${totalPages === 1 ? "is only 1 page" : `are only ${totalPages} pages`} of saved listings.`}
            action={
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/saved" />}
              >
                Back to first page
              </Button>
            }
          />
        ))}

      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={(target) => (target > 1 ? `/saved?page=${target}` : "/saved")}
      />
    </>
  );
}

/**
 * Reads `?page=` into a positive integer, defaulting to 1.
 *
 * Anything unusable falls back to the first page rather than erroring: the value
 * comes from a URL the user can edit, and `?page=abc` should show page 1, not a 500.
 */
function parsePageParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw) {
    return 1;
  }

  const parsed = Number.parseInt(raw, 10);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}
