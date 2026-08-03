import { PackageSearchIcon } from "lucide-react";
import Link from "next/link";

import { ListingsGrid } from "@/components/marketplace/listings-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { getActiveListings } from "@/lib/queries/listings";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse Listings",
  description:
    "Rent tools, electronics, cameras and more from people near you in Karachi, Lahore and Islamabad.",
};

/**
 * `searchParams` is a Promise in Next 15 and must be awaited.
 *
 * That is the breaking change from 14: it was a plain object. Reading a property
 * off it without awaiting yields `undefined` rather than throwing, so the mistake
 * shows up as a filter that silently never applies.
 */
interface BrowseListingsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Public browse view.
 *
 * Dynamic by necessity - it reads `searchParams`, and the header above it reads
 * the session - so there is no static shell to cache. Pagination state lives
 * entirely in the URL, which keeps a given page shareable and lets the back
 * button work without any client state.
 */
export default async function BrowseListingsPage({
  searchParams,
}: BrowseListingsPageProps) {
  const params = await searchParams;
  const requestedPage = parsePageParam(params.page);

  const { items, total, page, totalPages } = await getActiveListings({
    page: requestedPage,
  });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 lg:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Browse Listings
        </h1>
        <p className="text-muted-foreground text-sm">
          {total === 0
            ? "No items are listed for rent yet."
            : `${total} ${total === 1 ? "item" : "items"} available to rent.`}
        </p>
      </div>

      <ListingsGrid listings={items} />

      {items.length === 0 &&
        (total === 0 ? (
          <EmptyState
            icon={PackageSearchIcon}
            title="Nothing listed yet"
            description="No one has published a listing so far. Once items are listed for rent, they will appear here."
          />
        ) : (
          // Reachable by editing `?page=` past the end, or by landing on a
          // bookmarked page after listings were removed. An empty grid with no
          // explanation reads as a broken page, so say what happened.
          <EmptyState
            icon={PackageSearchIcon}
            title="No listings on this page"
            description={`There ${totalPages === 1 ? "is only 1 page" : `are only ${totalPages} pages`} of results.`}
            action={
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/listings" />}
              >
                Back to first page
              </Button>
            }
          />
        ))}

      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={(target) => buildListingsHref(params, target)}
      />
    </div>
  );
}

/**
 * Reads `?page=` into a positive integer, defaulting to 1.
 *
 * Everything unusable falls back to page 1 rather than erroring: the value comes
 * from a URL anyone can edit, and `?page=abc` or `?page=-4` should show the first
 * page, not a 500. A repeated parameter arrives as an array, in which case the
 * first entry wins.
 */
function parsePageParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw) {
    return 1;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

/**
 * A browse URL for `page`, preserving every other query parameter.
 *
 * Filters and sorting land in this same query string, so pagination has to carry
 * whatever is already there instead of rebuilding a bare `?page=`. `page=1` is
 * omitted to keep the canonical first-page URL free of a redundant parameter,
 * which also avoids two URLs serving identical content to a crawler.
 */
function buildListingsHref(
  params: Record<string, string | string[] | undefined>,
  page: number
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        search.append(key, entry);
      }
      continue;
    }

    search.set(key, value);
  }

  if (page > 1) {
    search.set("page", String(page));
  }

  const query = search.toString();

  return query ? `/listings?${query}` : "/listings";
}
