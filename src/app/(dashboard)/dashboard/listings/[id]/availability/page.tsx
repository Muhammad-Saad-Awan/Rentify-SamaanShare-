import { ChevronLeftIcon, ChevronRightIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { AvailabilityCalendar } from "@/components/listings/availability-calendar";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import {
  getListingAvailability,
  getOwnerListingDetail,
} from "@/lib/queries/owner-listings";
import {
  buildMonthGrid,
  monthBounds,
  parseMonthParam,
  shiftMonth,
} from "@/lib/utils/calendar";
import { todayInKarachi } from "@/lib/utils/date";

import type { Metadata } from "next";

interface AvailabilityPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string | string[] }>;
}

export async function generateMetadata({
  params,
}: AvailabilityPageProps): Promise<Metadata> {
  const user = await requireUser();
  const { id } = await params;
  const listing = await getOwnerListingDetail(id, user.id);

  return {
    title: listing ? `Availability - ${listing.title}` : "Listing not found",
  };
}

/**
 * Availability calendar for one of the owner's listings.
 *
 * The month lives in the URL as `?month=YYYY-MM`, so navigation is server-rendered links and
 * each month's data is fetched on the server - the same URL-as-state approach the browse
 * filters use. The client component only owns the day toggle.
 *
 * Under `/dashboard/...` for the same reason as the edit route: the public `[id]` layout
 * filters to publicly visible listings, and an owner must be able to manage a paused
 * listing's calendar.
 */
export default async function AvailabilityPage({
  params,
  searchParams,
}: AvailabilityPageProps) {
  const user = await requireUser();
  const [{ id }, { month: rawMonth }] = await Promise.all([
    params,
    searchParams,
  ]);

  const listing = await getOwnerListingDetail(id, user.id);

  if (!listing) {
    notFound();
  }

  // "Today" in the market's timezone, not the server's - see `todayInKarachi`. It decides
  // both the default month and which days are past.
  const today = todayInKarachi();
  const { year, month } = parseMonthParam(rawMonth, today);
  const grid = buildMonthGrid(year, month);
  const { from, to } = monthBounds(year, month);

  const { ownerBlocked, bookingHeld } = await getListingAvailability(
    listing.id,
    user.id,
    from,
    to
  );

  return (
    <>
      <PageHeader
        title="Availability"
        description={listing.title}
        actions={
          <Button
            variant="outline"
            render={<Link href={`/dashboard/listings/${listing.id}/edit`} />}
          >
            <PencilIcon />
            Edit listing
          </Button>
        }
      />

      <div className="flex max-w-xl flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          {/*
            Links, not buttons: each month is its own URL, so it is shareable and the back
            button steps through months. Same reasoning as the sort and pagination controls.
          */}
          <Button
            variant="outline"
            size="icon-sm"
            render={
              <Link
                href={`?month=${shiftMonth(year, month, -1)}`}
                aria-label="Previous month"
              />
            }
          >
            <ChevronLeftIcon />
          </Button>

          {/* `aria-live` so a month change is announced - the grid swaps silently. */}
          <h2 className="font-heading text-sm font-medium" aria-live="polite">
            {grid.label}
          </h2>

          <Button
            variant="outline"
            size="icon-sm"
            render={
              <Link
                href={`?month=${shiftMonth(year, month, 1)}`}
                aria-label="Next month"
              />
            }
          >
            <ChevronRightIcon />
          </Button>
        </div>

        <AvailabilityCalendar
          listingId={listing.id}
          grid={grid}
          ownerBlocked={ownerBlocked}
          bookingHeld={bookingHeld}
          today={today}
        />

        <p className="text-muted-foreground text-sm">
          Blocked days are hidden from renters searching by date. Days held by a
          confirmed booking cannot be released here - cancel the booking
          instead.
        </p>
      </div>
    </>
  );
}
