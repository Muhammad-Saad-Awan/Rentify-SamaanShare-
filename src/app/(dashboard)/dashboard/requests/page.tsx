import { InboxIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { BookingCard } from "@/components/bookings/booking-card";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { getOwnerBookingRequests } from "@/lib/queries/bookings";
import { parsePageParam } from "@/lib/utils/pagination";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Booking Requests",
  description: "Requests to rent the items you have listed.",
};

interface RequestsPageProps {
  searchParams: Promise<{ page?: string | string[] }>;
}

/**
 * The owner's inbox of booking requests.
 *
 * Scoped by `ownerId` from the session - no identifier for anyone else's requests is accepted.
 * The query sweeps expired requests before reading, so a stale one is shown as expired rather
 * than offering an Approve button that would fail on submit.
 */
export default async function RequestsPage({
  searchParams,
}: RequestsPageProps) {
  const { page: rawPage } = await searchParams;

  return (
    // In-page Suspense rather than a route-level loading.tsx - see the invariant in AGENTS.md
    // about a boundary above a route breaking its status code.
    <Suspense
      key={String(rawPage ?? 1)}
      fallback={<DashboardPageSkeleton cards={3} />}
    >
      <OwnerRequests rawPage={rawPage} />
    </Suspense>
  );
}

interface OwnerRequestsProps {
  rawPage: string | string[] | undefined;
}

async function OwnerRequests({ rawPage }: OwnerRequestsProps) {
  const user = await requireUser();

  const { items, total, page, totalPages, pendingCount } =
    await getOwnerBookingRequests({
      userId: user.id,
      page: parsePageParam(rawPage),
    });

  return (
    <>
      <PageHeader
        title="Booking requests"
        description={
          total === 0
            ? "Requests to rent your items will appear here."
            : pendingCount > 0
              ? `${pendingCount} awaiting your decision, ${total} in total.`
              : `${total === 1 ? "1 request" : `${total} requests`}, none awaiting a decision.`
        }
      />

      {items.length > 0 && (
        <ul className="flex flex-col gap-4">
          {items.map((booking) => (
            <li key={booking.id}>
              <BookingCard booking={booking} side="owner" />
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 &&
        (total === 0 ? (
          <EmptyState
            icon={InboxIcon}
            title="No requests yet"
            description="When someone asks to rent one of your items, it will show up here with 48 hours to respond."
            action={
              <Button size="sm" render={<Link href="/dashboard/listings" />}>
                View my listings
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={InboxIcon}
            title="No requests on this page"
            description={`There ${totalPages === 1 ? "is only 1 page" : `are only ${totalPages} pages`} of requests.`}
            action={
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/dashboard/requests" />}
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
            ? `/dashboard/requests?page=${target}`
            : "/dashboard/requests"
        }
      />
    </>
  );
}
