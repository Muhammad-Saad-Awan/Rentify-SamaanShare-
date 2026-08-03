import { CalendarCheckIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { BookingCard } from "@/components/bookings/booking-card";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { getRenterBookings } from "@/lib/queries/bookings";
import { parsePageParam } from "@/lib/utils/pagination";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Bookings",
  description: "Items you have requested to rent on SamaanShare.",
};

interface BookingsPageProps {
  searchParams: Promise<{ page?: string | string[] }>;
}

/**
 * The renter's own bookings.
 *
 * Scoped by `renterId` from the session, so there is no identifier for anyone else's bookings
 * to tamper with.
 *
 * Read-only in this slice. Cancelling is part of the renter-actions work, and a Cancel button
 * that did nothing would be worse than none - the same reasoning that kept "Contact owner"
 * visibly disabled until bookings existed.
 */
export default async function MyBookingsPage({
  searchParams,
}: BookingsPageProps) {
  const { page: rawPage } = await searchParams;

  return (
    <Suspense
      key={String(rawPage ?? 1)}
      fallback={<DashboardPageSkeleton cards={3} />}
    >
      <RenterBookings rawPage={rawPage} />
    </Suspense>
  );
}

interface RenterBookingsProps {
  rawPage: string | string[] | undefined;
}

async function RenterBookings({ rawPage }: RenterBookingsProps) {
  const user = await requireUser();

  const { items, total, page, totalPages } = await getRenterBookings({
    userId: user.id,
    page: parsePageParam(rawPage),
  });

  return (
    <>
      <PageHeader
        title="My Bookings"
        description={
          total === 0
            ? "Items you request to rent will appear here."
            : `${total === 1 ? "1 booking" : `${total} bookings`}.`
        }
      />

      {items.length > 0 && (
        <ul className="flex flex-col gap-4">
          {items.map((booking) => (
            <li key={booking.id}>
              <BookingCard booking={booking} side="renter" />
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 &&
        (total === 0 ? (
          <EmptyState
            icon={CalendarCheckIcon}
            title="No bookings yet"
            description="Find something you need and request the dates. The owner has 48 hours to respond."
            action={
              <Button size="sm" render={<Link href="/listings" />}>
                Browse listings
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={CalendarCheckIcon}
            title="No bookings on this page"
            description={`There ${totalPages === 1 ? "is only 1 page" : `are only ${totalPages} pages`} of bookings.`}
            action={
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/dashboard/bookings" />}
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
            ? `/dashboard/bookings?page=${target}`
            : "/dashboard/bookings"
        }
      />
    </>
  );
}
