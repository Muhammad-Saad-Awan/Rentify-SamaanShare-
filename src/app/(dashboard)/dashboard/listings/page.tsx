import { PackageIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { OwnerListingCard } from "@/components/listings/owner-listing-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { getOwnerListings } from "@/lib/queries/owner-listings";
import { parsePageParam } from "@/lib/utils/pagination";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Listings",
  description: "Manage the items you rent out on SamaanShare.",
};

interface MyListingsPageProps {
  searchParams: Promise<{ page?: string | string[] }>;
}

/**
 * Owner-facing listing management.
 *
 * Shows every status the owner can act on - live, paused and draft - which is why it uses
 * `getOwnerListings` rather than the public queries. Everything public goes through
 * `VISIBLE_LISTING_WHERE`, and a management screen that hid paused listings would leave
 * their owner no way to resume them.
 *
 * `requireUser()` runs here as well as in the group layout: React reuses a layout across
 * client-side navigations without re-executing it, so the layout's check cannot be relied
 * on for a page reached from another dashboard route. It verifies against the database, so
 * a suspended owner cannot manage inventory.
 *
 * Scoping is by `user.id` from the session and never from a parameter - there is no way to
 * address another owner's listings, because no identifier for one is accepted.
 */
export default async function MyListingsPage({
  searchParams,
}: MyListingsPageProps) {
  const { page: rawPage } = await searchParams;

  return (
    // In-page Suspense rather than a route-level `loading.tsx`.
    //
    // A `loading.tsx` in this segment covers `/dashboard/listings` AND everything nested
    // under it - `[id]/edit`, `[id]/availability`. Next flushes the shell with a 200 as soon
    // as the fallback is ready, so those routes could no longer return a 404: opening
    // another owner's listing answered 200 with the not-found page. No data leaked - the
    // queries are owner-scoped - but a soft 404 tells a crawler a dead URL is live, and it
    // masks the authorization result from anything reading status codes.
    <Suspense
      key={String(rawPage ?? 1)}
      fallback={<DashboardPageSkeleton cards={3} />}
    >
      <OwnerListings rawPage={rawPage} />
    </Suspense>
  );
}

interface OwnerListingsProps {
  rawPage: string | string[] | undefined;
}

/** Everything on the page that depends on a query. */
async function OwnerListings({ rawPage }: OwnerListingsProps) {
  const user = await requireUser();

  const { items, total, page, totalPages } = await getOwnerListings({
    ownerId: user.id,
    page: parsePageParam(rawPage),
  });

  return (
    <>
      <PageHeader
        title="My Listings"
        description={
          total === 0
            ? "Items you publish will appear here."
            : `${total === 1 ? "1 item" : `${total} items`} published.`
        }
        actions={
          <Button render={<Link href="/listings/new" />}>
            <PlusIcon />
            New listing
          </Button>
        }
      />

      {items.length > 0 && (
        // A list, because that is what this is - it lets a screen reader announce the count
        // and skip the group as a unit.
        <ul className="flex flex-col gap-4">
          {items.map((listing) => (
            <li key={listing.id}>
              <OwnerListingCard listing={listing} />
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 &&
        (total === 0 ? (
          <EmptyState
            icon={PackageIcon}
            title="No listings yet"
            description="Publish something you own and it will show up here, with its views, saves and availability."
            action={
              <Button size="sm" render={<Link href="/listings/new" />}>
                <PlusIcon />
                Create your first listing
              </Button>
            }
          />
        ) : (
          // Reachable by deleting the last item on a page, or by editing `?page=`.
          <EmptyState
            icon={PackageIcon}
            title="No listings on this page"
            description={`There ${totalPages === 1 ? "is only 1 page" : `are only ${totalPages} pages`} of listings.`}
            action={
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/dashboard/listings" />}
              >
                Back to first page
              </Button>
            }
          />
        ))}

      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={(target) =>
          target > 1
            ? `/dashboard/listings?page=${target}`
            : "/dashboard/listings"
        }
      />
    </>
  );
}
