import { PackageSearchIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { BrowseSkeleton } from "@/components/marketplace/browse-skeleton";

import { ActiveFilters } from "@/components/marketplace/active-filters";
import { ListingsFilters } from "@/components/marketplace/listings-filters";
import { ListingsFiltersSheet } from "@/components/marketplace/listings-filters-sheet";
import {
  ABOVE_FOLD_PRIORITY_COUNT,
  ListingsGrid,
} from "@/components/marketplace/listings-grid";
import { ListingsSearch } from "@/components/marketplace/listings-search";
import { ListingsSort } from "@/components/marketplace/listings-sort";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import {
  activeFilterCount,
  buildListingsHref,
  clearListingFiltersHref,
  hasActiveFilters,
  parseListingFilters,
} from "@/lib/marketplace/filters";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getCategoryOptions } from "@/lib/queries/categories";
import { getActiveListings } from "@/lib/queries/listings";
import { getSavedListingIds } from "@/lib/queries/saved-listings";

import type {
  ListingFilters,
  RawSearchParams,
} from "@/lib/marketplace/filters";
import type { Metadata } from "next";

/**
 * `searchParams` is a Promise in Next 15 and must be awaited.
 *
 * That is the breaking change from 14: it was a plain object. Reading a property off it
 * without awaiting yields `undefined` rather than throwing, so the mistake shows up as a
 * filter that silently never applies.
 */
interface BrowseListingsPageProps {
  searchParams: Promise<RawSearchParams>;
}

/**
 * Metadata for browse, including whether this particular view should be indexed.
 *
 * `generateMetadata` rather than a static `metadata` export - a page may export one or the
 * other, not both - because the indexing decision depends on the query string.
 *
 * Bare `/listings` is indexable. Anything narrowed by a filter, a search term or a page
 * number is not: every combination renders at this same path, so the set is combinatorially
 * large (q x category x city x price x condition x dates x sort x page) and indexing it is
 * duplicate-content sprawl rather than coverage.
 *
 * `follow` stays on, so the crawler still traverses into the listing detail pages a filtered
 * view links to. These URLs are also NOT blocked in robots.txt, for a related reason: a
 * `Disallow` would stop the fetch, and with it the canonical tag that consolidates them.
 */
export async function generateMetadata({
  searchParams,
}: BrowseListingsPageProps): Promise<Metadata> {
  const filters = parseListingFilters(await searchParams);
  const isNarrowed = hasActiveFilters(filters) || filters.page > 1;

  return {
    title: "Browse Listings",
    description:
      "Rent tools, electronics, cameras and more from people near you in Karachi, Lahore and Islamabad.",
    alternates: { canonical: "/listings" },
    ...(isNarrowed ? { robots: { index: false, follow: true } } : {}),
  };
}

/**
 * Public browse view: keyword search, filters, sorting and pagination.
 *
 * All of that state lives in the URL and nowhere else. There is no client store
 * and no `useState` behind the controls - the page is a pure function of its
 * query string, so any view is shareable, bookmarkable, and reachable with the
 * back button. `@/lib/marketplace/filters` is the only place that reads or writes
 * that query string.
 *
 * Dynamic by necessity: it reads `searchParams`, and the header above it reads
 * the session.
 */
export default async function BrowseListingsPage({
  searchParams,
}: BrowseListingsPageProps) {
  const raw = await searchParams;

  /**
   * A member's default city chooses the STARTING URL, never the results behind one.
   *
   * The alternative - quietly adding the city to `filters` - would break the invariant
   * this page is built on: two people would see different listings at the same address,
   * and a shared link would not show what the sender saw. Redirecting keeps the query
   * string the only state, and the city then appears as a removable chip like any other.
   *
   * ONLY ON A COMPLETELY BARE URL. Any parameter at all - even `?page=2` - means the
   * member is already somewhere specific, and moving them would discard it. `?city=all`
   * is how the city chip says "everywhere", and it is a parameter, so it lands here and
   * is left alone.
   *
   * Anonymous visitors and crawlers never redirect, so `/listings` stays the one
   * indexable, canonical browse URL.
   */
  if (Object.keys(raw).length === 0) {
    const defaultCity = await getDefaultCity();

    if (defaultCity) {
      // Built through the serialiser rather than as a string, so the parameter name
      // comes from `FILTER_PARAM` and cannot drift from what the parser reads back.
      // `raw` is empty here, so this is the default state with one city applied.
      redirect(
        buildListingsHref(parseListingFilters(raw), { city: defaultCity })
      );
    }
  }

  const filters = parseListingFilters(raw);

  return (
    // The skeleton is wired up here rather than as a route-level `loading.tsx` -
    // see the note in `BrowseSkeleton` for why that file cannot exist in this
    // segment without breaking the detail route's 404 status.
    //
    // The `key` is what makes the fallback reappear on a filter change. Without
    // it React reuses the boundary across navigations and the user stares at the
    // previous result set until the new one resolves. Keying on the serialised URL
    // means one key per distinct browse state.
    <Suspense key={buildListingsHref(filters)} fallback={<BrowseSkeleton />}>
      <BrowseResults filters={filters} />
    </Suspense>
  );
}

interface BrowseResultsProps {
  filters: ListingFilters;
}

/**
 * Everything on the browse page that depends on a query.
 *
 * Split from the page so the whole view - heading, toolbar, sidebar and grid - sits
 * behind one Suspense boundary. A narrower boundary would leave the toolbar waiting
 * on the category query anyway, since it renders the filter selects.
 */
async function BrowseResults({ filters }: BrowseResultsProps) {
  // Independent reads, so they overlap rather than waiting on each other. The
  // category list is needed by the sidebar whether or not any listing matches.
  const [{ items, total, page, totalPages }, categories, user] =
    await Promise.all([
      getActiveListings({ filters }),
      getCategoryOptions(),
      getCurrentUser(),
    ]);

  // Sequential by necessity: which saves matter depends on which listings came
  // back. Scoped to this page's ids, so it is one bounded indexed read rather than
  // the user's entire wishlist.
  const savedListingIds = await getSavedListingIds(
    user?.id,
    items.map((item) => item.id)
  );

  const filtered = hasActiveFilters(filters);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 lg:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Browse Listings
        </h1>
        <p className="text-muted-foreground text-sm">
          {resultSummary(total, filtered, filters.q)}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <ListingsSearch filters={filters} className="sm:flex-1" />

        <div className="flex items-center justify-between gap-2 sm:justify-end">
          {/*
            The drawer trigger is hidden at `lg`, where the sidebar below is
            visible instead. Both render the same form component; only the
            container differs, exactly as the dashboard nav does.
          */}
          <ListingsFiltersSheet activeCount={activeFilterCount(filters)}>
            <ListingsFilters
              filters={filters}
              categories={categories}
              idPrefix="mobile"
            />
          </ListingsFiltersSheet>

          <ListingsSort
            filters={filters}
            hrefFor={(sort) => buildListingsHref(filters, { sort, page: 1 })}
          />
        </div>
      </div>

      <div className="flex gap-6">
        <aside className="hidden w-64 shrink-0 lg:block">
          {/*
            `sticky` so a long result grid does not scroll the filters out of
            reach. `top-20` clears the 14-unit sticky site header plus a gap.
          */}
          <div className="sticky top-20">
            <ListingsFilters
              filters={filters}
              categories={categories}
              idPrefix="desktop"
            />
          </div>
        </aside>

        {/*
          `min-w-0` is load-bearing on a flex child: without it the column adopts
          its content's intrinsic width and a long unbroken title pushes the grid
          past the viewport.
        */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <ActiveFilters filters={filters} categories={categories} />

          <ListingsGrid
            listings={items}
            searchTerm={filters.q}
            savedListingIds={savedListingIds}
            isAuthenticated={user !== null}
            // The only grid on this page and the first thing below the toolbar.
            priorityCount={ABOVE_FOLD_PRIORITY_COUNT}
          />

          {items.length === 0 && (
            <BrowseEmptyState
              // Whether anything *besides* the search term is narrowing the
              // results. `hasActiveFilters` counts `q` as a filter - correct for
              // the chip row and the clear-all affordance - but the empty state
              // has to tell "no results for a term" apart from "no results for a
              // term with filters on", or it offers to clear filters that are not
              // set. Nulling `q` and re-asking is cheaper than a second helper.
              otherFiltersActive={hasActiveFilters({ ...filters, q: null })}
              query={filters.q}
              total={total}
              totalPages={totalPages}
              clearHref={clearListingFiltersHref(filters)}
              firstPageHref={buildListingsHref(filters, { page: 1 })}
            />
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            hrefFor={(target) => buildListingsHref(filters, { page: target })}
          />
        </div>
      </div>
    </div>
  );
}

interface BrowseEmptyStateProps {
  /** True when a filter other than the search term is narrowing the results. */
  otherFiltersActive: boolean;
  /** The active search term, which gets its own wording when present. */
  query: string | null;
  total: number;
  totalPages: number;
  clearHref: string;
  firstPageHref: string;
}

/**
 * Picks the right explanation for an empty grid.
 *
 * Four different situations produce zero cards, and collapsing them into one
 * message misinforms: a user whose filters matched nothing would be told the
 * marketplace is empty, and would have no reason to try clearing them.
 */
function BrowseEmptyState({
  otherFiltersActive,
  query,
  total,
  totalPages,
  clearHref,
  firstPageHref,
}: BrowseEmptyStateProps) {
  // A search term is named back to the user, because "no results" without it
  // leaves them unsure whether the term was even received - especially after a
  // header search, where the box that submitted it is small and easy to mistype.
  if (total === 0 && query) {
    return (
      <EmptyState
        icon={SearchXIcon}
        title={`No results for “${query}”`}
        description={
          otherFiltersActive
            ? "Nothing matched that term with the current filters. Try a different word, or clear the filters to search everything."
            : "Nothing matched that term. Check the spelling, or try a broader word - “camera” rather than a model number."
        }
        action={
          <Button
            variant="outline"
            size="sm"
            render={<Link href={clearHref} />}
          >
            {otherFiltersActive ? "Clear search and filters" : "Clear search"}
          </Button>
        }
      />
    );
  }

  // Filters alone excluded everything. The only useful action is to widen, so the
  // empty state carries it.
  if (total === 0 && otherFiltersActive) {
    return (
      <EmptyState
        icon={SearchXIcon}
        title="No listings match your filters"
        description="Nothing matched this combination. Try removing a filter, widening the price range, or searching for a different term."
        action={
          <Button
            variant="outline"
            size="sm"
            render={<Link href={clearHref} />}
          >
            Clear all filters
          </Button>
        }
      />
    );
  }

  // Genuinely nothing published. Offering "clear filters" here would be a dead
  // end, since there are none to clear.
  if (total === 0) {
    return (
      <EmptyState
        icon={PackageSearchIcon}
        title="Nothing listed yet"
        description="No one has published a listing so far. Once items are listed for rent, they will appear here."
      />
    );
  }

  // Matches exist, just not on the requested page - reachable by editing `?page=`
  // past the end, or from a bookmark taken when there were more results.
  return (
    <EmptyState
      icon={PackageSearchIcon}
      title="No listings on this page"
      description={`There ${totalPages === 1 ? "is only 1 page" : `are only ${totalPages} pages`} of results.`}
      action={
        <Button
          variant="outline"
          size="sm"
          render={<Link href={firstPageHref} />}
        >
          Back to first page
        </Button>
      }
    />
  );
}

/**
 * Result count line, phrased for whether the number is a filtered subset.
 *
 * A search term is quoted back rather than folded into "your filters", so the
 * heading area always confirms what was actually searched for.
 */
function resultSummary(
  total: number,
  filtered: boolean,
  query: string | null
): string {
  if (total === 0) {
    if (query) {
      return `No results for “${query}”.`;
    }

    return filtered
      ? "No listings match your filters."
      : "No items are listed for rent yet.";
  }

  if (query) {
    const noun = total === 1 ? "result" : "results";

    return `${total} ${noun} for “${query}”.`;
  }

  if (filtered) {
    // The verb agrees with the count, not just the noun: "1 item match" reads as
    // a bug to anyone who notices it.
    return total === 1
      ? "1 item matches your filters."
      : `${total} items match your filters.`;
  }

  return `${total} ${total === 1 ? "item" : "items"} available to rent.`;
}

/**
 * This member's default browse city, or null.
 *
 * Costs one primary-key read, and only on a bare `/listings` for a signed-in member - the
 * one request where the answer can change anything. Every filtered view skips it entirely.
 *
 * Read from the database rather than the session for the reason the profile page gives:
 * the JWT is minted at sign-in, so a preference changed in Settings would not take effect
 * until the token refreshed, up to 24 hours later. A setting that appears to save and then
 * does nothing is worse than no setting.
 */
async function getDefaultCity(): Promise<string | null> {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: { defaultCity: true },
  });

  return current?.defaultCity ?? null;
}
