import { PackageSearchIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AdminListingCard } from "@/components/admin/admin-listing-card";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAKISTANI_CITIES } from "@/config/cities";
import { ListingStatus } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/auth/session";
import { searchAdminListings } from "@/lib/queries/admin-listings";
import { parsePageParam } from "@/lib/utils/pagination";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Listings",
  description: "Listing moderation.",
  // The admin area should never appear in search results, even if a crawler somehow reaches it
  // while a session cookie is present.
  robots: { index: false, follow: false },
};

interface AdminListingsPageProps {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    city?: string | string[];
    owner?: string | string[];
    reported?: string | string[];
    page?: string | string[];
  }>;
}

/**
 * Listing moderation.
 *
 * BROWSE-FIRST, UNLIKE THE MEMBERS SCREEN, and the difference is deliberate. `/admin/users` shows
 * nothing until a query is entered because a default listing of every account is a directory of the
 * user base with email addresses attached. Listings are public by construction - anyone can page
 * through `/listings` - so there is nothing for that rule to protect here, and triage means looking
 * at what was posted, not looking up something already known by name.
 */
export default async function AdminListingsPage({
  searchParams,
}: AdminListingsPageProps) {
  const params = await searchParams;

  return (
    // In-page Suspense rather than a route-level loading.tsx - see the invariant in AGENTS.md. A
    // `loading.tsx` here would cover `listings/[id]` too, and Next would have flushed a 200 before
    // that route's layout could 404 on an unknown id.
    <Suspense
      key={JSON.stringify(params)}
      fallback={<DashboardPageSkeleton cards={3} />}
    >
      <ListingQueue params={params} />
    </Suspense>
  );
}

interface ListingQueueProps {
  params: Awaited<AdminListingsPageProps["searchParams"]>;
}

async function ListingQueue({ params }: ListingQueueProps) {
  await requireAdmin();

  const query = first(params.q)?.trim() ?? "";
  const status = parseStatus(params.status);
  const city = parseCity(params.city);
  const owner = first(params.owner)?.trim() ?? "";
  const reportedOnly = first(params.reported) === "true";

  const { items, total, page, totalPages } = await searchAdminListings({
    ...(query ? { query } : {}),
    ...(status ? { status } : {}),
    ...(city ? { city } : {}),
    ...(owner ? { ownerId: owner } : {}),
    ...(reportedOnly ? { reportedOnly } : {}),
    page: parsePageParam(params.page),
  });

  /**
   * The current view as a query string, with one part replaced.
   *
   * Filters are links rather than a client-side control, matching the reports, claims and members
   * queues: a filtered view stays shareable and survives the back button, which for a moderation
   * screen means one administrator can hand a view to another.
   */
  const hrefFor = (
    patch: Record<string, string | undefined>,
    targetPage?: number
  ): string => {
    const next = new URLSearchParams();

    if (query) next.set("q", query);
    if (status) next.set("status", status.toLowerCase());
    if (city) next.set("city", city);
    if (owner) next.set("owner", owner);
    if (reportedOnly) next.set("reported", "true");

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }

    // Page is dropped unless one is asked for: changing a filter changes the result set, and staying
    // on page four of a different list is how someone concludes the filter returned nothing.
    if (targetPage !== undefined && targetPage > 1) {
      next.set("page", String(targetPage));
    } else {
      next.delete("page");
    }

    const qs = next.toString();

    return qs ? `/admin/listings?${qs}` : "/admin/listings";
  };

  const unfiltered = !status && !city && !reportedOnly;

  return (
    <>
      <PageHeader
        title="Listings"
        description="Every listing on the platform, newest first, including removed ones and those hidden by their owner's suspension."
      />

      {/*
        A plain GET form, not a client-side filter. The query lands in the URL, so a search is
        shareable and survives the back button - the same reasoning as the browse sort control.
      */}
      <form action="/admin/listings" className="flex flex-wrap gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by title"
          aria-label="Search listings by title"
          className="max-w-xs"
        />
        {/*
          The active owner filter is carried through the search as a hidden field. Without it,
          searching from a member's inventory would silently widen to every listing on the platform.
        */}
        {owner && <input type="hidden" name="owner" value={owner} />}
        <Button type="submit" size="sm">
          <SearchIcon aria-hidden="true" />
          Search
        </Button>
      </form>

      <nav aria-label="Filter listings" className="flex flex-wrap gap-2">
        <FilterLink
          href={hrefFor({
            status: undefined,
            city: undefined,
            reported: undefined,
          })}
          active={unfiltered}
        >
          All
        </FilterLink>
        <FilterLink href={hrefFor({ reported: "true" })} active={reportedOnly}>
          Reported
        </FilterLink>
        <FilterLink
          href={hrefFor({ status: "active" })}
          active={status === ListingStatus.ACTIVE}
        >
          Active
        </FilterLink>
        <FilterLink
          href={hrefFor({ status: "paused" })}
          active={status === ListingStatus.PAUSED}
        >
          Paused
        </FilterLink>
        <FilterLink
          href={hrefFor({ status: "draft" })}
          active={status === ListingStatus.DRAFT}
        >
          Draft
        </FilterLink>
        <FilterLink
          href={hrefFor({ status: "deleted" })}
          active={status === ListingStatus.DELETED}
        >
          Removed
        </FilterLink>
        {PAKISTANI_CITIES.map((entry) => (
          <FilterLink
            key={entry.value}
            href={hrefFor({ city: entry.value })}
            active={city === entry.value}
          >
            {entry.label}
          </FilterLink>
        ))}
      </nav>

      {owner && (
        <p className="text-muted-foreground text-xs">
          Showing one member&apos;s listings.{" "}
          <Link
            href={hrefFor({ owner: undefined })}
            className="underline underline-offset-4"
          >
            Show all listings
          </Link>
        </p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-4">
          {items.map((listing) => (
            <li key={listing.id}>
              <AdminListingCard listing={listing} />
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 && (
        <EmptyState
          icon={PackageSearchIcon}
          title={
            total === 0 ? "No listings match that" : "No listings on this page"
          }
          description={
            total === 0
              ? "Try a fragment of the title. Only titles are searched - a description of 5,000 characters is not something this screen scans."
              : `There ${totalPages === 1 ? "is only 1 page" : `are only ${totalPages} pages`} of results.`
          }
          {...(total > 0
            ? {
                action: (
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={hrefFor({})} />}
                  >
                    Back to first page
                  </Button>
                ),
              }
            : {})}
        />
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={(target) => hrefFor({}, target)}
      />
    </>
  );
}

/** One filter as a link, so every view stays shareable and survives the back button. */
function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant={active ? "default" : "outline"}
      render={<Link href={href} />}
      {...(active ? { "aria-current": "page" as const } : {})}
    >
      {children}
    </Button>
  );
}

/** Repeated query parameters arrive as an array; the first entry wins. */
function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * One `ListingStatus` from the query string, or `undefined`.
 *
 * Falls back to unfiltered rather than 404ing on an unrecognised value: this is a filter on a list,
 * not an identifier, and a mistyped one should show everything rather than an error page.
 */
function parseStatus(
  raw: string | string[] | undefined
): ListingStatus | undefined {
  const value = first(raw)?.toUpperCase();

  return value && value in ListingStatus
    ? ListingStatus[value as keyof typeof ListingStatus]
    : undefined;
}

/** A city slug, checked against the launch cities so it cannot become an arbitrary filter. */
function parseCity(raw: string | string[] | undefined): string | undefined {
  const value = first(raw)?.toLowerCase();

  return PAKISTANI_CITIES.some((entry) => entry.value === value)
    ? value
    : undefined;
}
