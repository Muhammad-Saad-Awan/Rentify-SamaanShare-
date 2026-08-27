import { CalendarSearchIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AdminBookingCard } from "@/components/admin/admin-booking-card";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookingStatus } from "@/generated/prisma/enums";
import { BOOKING_STATUS_LABELS } from "@/lib/bookings/timeline";
import { requireAdmin } from "@/lib/auth/session";
import {
  getAwaitingActionBookingCount,
  searchAdminBookings,
} from "@/lib/queries/admin-bookings";
import { parsePageParam } from "@/lib/utils/pagination";
import { calendarDateSchema } from "@/lib/validations/listing";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bookings",
  description: "Booking oversight.",
  // The admin area should never appear in search results, even if a crawler somehow reaches it
  // while a session cookie is present.
  robots: { index: false, follow: false },
};

/**
 * The statuses offered as filters, in lifecycle order.
 *
 * Not every value in the enum: `REVIEWED` is a completed rental with reviews attached and nobody
 * looks a booking up by it, so it is reachable through search rather than given a button of its own.
 * The order follows the lifecycle rather than the alphabet, because that is how somebody scanning
 * for "where do rentals get stuck" reads it.
 */
const STATUS_FILTERS = [
  BookingStatus.PENDING,
  BookingStatus.APPROVED,
  BookingStatus.PAYMENT_PENDING,
  BookingStatus.ACTIVE,
  BookingStatus.COMPLETED,
  BookingStatus.CANCELLED,
  BookingStatus.DECLINED,
  BookingStatus.EXPIRED,
] as const;

interface AdminBookingsPageProps {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    awaiting?: string | string[];
    from?: string | string[];
    to?: string | string[];
    listing?: string | string[];
    user?: string | string[];
    page?: string | string[];
  }>;
}

/**
 * Booking oversight. Read-only by design - see the note at the top of `queries/admin-bookings.ts`.
 *
 * Every action on a booking belongs to one of the two parties, so this screen answers "what
 * happened" and deliberately cannot change the answer. It also does not run the lazy sweeps the
 * parties' own screens do: an oversight screen that mutates what it reports on cannot be read as
 * evidence.
 */
export default async function AdminBookingsPage({
  searchParams,
}: AdminBookingsPageProps) {
  const params = await searchParams;

  return (
    // In-page Suspense rather than a route-level loading.tsx - see the invariant in AGENTS.md. A
    // `loading.tsx` here would cover `bookings/[id]` too, and Next would have flushed a 200 before
    // that route's layout could 404 on an unknown id.
    <Suspense
      key={JSON.stringify(params)}
      fallback={<DashboardPageSkeleton cards={3} />}
    >
      <BookingQueue params={params} />
    </Suspense>
  );
}

interface BookingQueueProps {
  params: Awaited<AdminBookingsPageProps["searchParams"]>;
}

async function BookingQueue({ params }: BookingQueueProps) {
  await requireAdmin();

  const query = first(params.q)?.trim() ?? "";
  const status = parseStatus(params.status);
  const awaitingOnly = first(params.awaiting) === "true";
  const fromRaw = parseDay(params.from);
  const toRaw = parseDay(params.to);
  const listingId = first(params.listing)?.trim() ?? "";
  const userId = first(params.user)?.trim() ?? "";

  const [{ items, total, page, totalPages }, awaitingCount] = await Promise.all(
    [
      searchAdminBookings({
        ...(query ? { query } : {}),
        ...(status ? { status } : {}),
        ...(awaitingOnly ? { awaitingOnly } : {}),
        ...(fromRaw ? { from: toUtcDay(fromRaw) } : {}),
        ...(toRaw ? { to: toUtcDay(toRaw) } : {}),
        ...(listingId ? { listingId } : {}),
        ...(userId ? { userId } : {}),
        page: parsePageParam(params.page),
      }),
      getAwaitingActionBookingCount(),
    ]
  );

  /**
   * The current view as a query string, with one part replaced.
   *
   * Filters are links rather than a client-side control, matching every other admin queue: a
   * filtered view stays shareable and survives the back button, which is how one administrator hands
   * a view to another mid-conversation.
   */
  const hrefFor = (
    patch: Record<string, string | undefined>,
    targetPage?: number
  ): string => {
    const next = new URLSearchParams();

    if (query) next.set("q", query);
    if (status) next.set("status", status.toLowerCase());
    if (awaitingOnly) next.set("awaiting", "true");
    if (fromRaw) next.set("from", fromRaw);
    if (toRaw) next.set("to", toRaw);
    if (listingId) next.set("listing", listingId);
    if (userId) next.set("user", userId);

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

    return qs ? `/admin/bookings?${qs}` : "/admin/bookings";
  };

  const scoped = Boolean(listingId || userId);
  const unfiltered = !status && !awaitingOnly && !fromRaw && !toRaw;

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Every booking on the platform, newest request first. Read-only: each step belongs to the renter or the owner, and this screen exists to say what happened."
        actions={
          <Badge variant={awaitingCount > 0 ? "secondary" : "outline"}>
            {awaitingCount} awaiting a party
          </Badge>
        }
      />

      {/*
        One GET form for the search and the date range, so a lookup lands in the URL and stays
        shareable - the same reasoning as the listings and members screens. The scoping parameters
        ride along as hidden fields, or searching from a listing's bookings would silently widen to
        the whole platform.
      */}
      <form action="/admin/bookings" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className="text-xs font-medium">
            Booking id, listing, or either party
          </label>
          <Input
            id="q"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Email, name, title, or booking id"
            className="max-w-xs"
          />
        </div>

        {/*
          The dates match the RENTAL PERIOD, not when the booking was made - see the note in
          `searchAdminBookings`. Somebody on the phone is asking about the week they had the item.
        */}
        <div className="flex flex-col gap-1">
          <label htmlFor="from" className="text-xs font-medium">
            Rental on or after
          </label>
          <Input
            id="from"
            type="date"
            name="from"
            defaultValue={fromRaw ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="to" className="text-xs font-medium">
            and on or before
          </label>
          <Input id="to" type="date" name="to" defaultValue={toRaw ?? ""} />
        </div>

        {status && (
          <input type="hidden" name="status" value={status.toLowerCase()} />
        )}
        {awaitingOnly && <input type="hidden" name="awaiting" value="true" />}
        {listingId && <input type="hidden" name="listing" value={listingId} />}
        {userId && <input type="hidden" name="user" value={userId} />}

        <Button type="submit" size="sm">
          <SearchIcon aria-hidden="true" />
          Search
        </Button>
      </form>

      <nav aria-label="Filter bookings" className="flex flex-wrap gap-2">
        <FilterLink
          href={hrefFor({
            status: undefined,
            awaiting: undefined,
            from: undefined,
            to: undefined,
          })}
          active={unfiltered}
        >
          All
        </FilterLink>
        {/*
          "Awaiting a party" rather than one status: PENDING, APPROVED and PAYMENT_PENDING are all a
          booking waiting on a person, and asking "what is stuck" one status at a time misses two
          thirds of it. ACTIVE is deliberately not included - an item out on rent is the system
          working. See `AWAITING_ACTION_STATUSES`.
        */}
        <FilterLink
          href={hrefFor({ awaiting: "true", status: undefined })}
          active={awaitingOnly}
        >
          Awaiting a party
        </FilterLink>
        {STATUS_FILTERS.map((value) => (
          <FilterLink
            key={value}
            href={hrefFor({ status: value.toLowerCase(), awaiting: undefined })}
            active={status === value}
          >
            {BOOKING_STATUS_LABELS[value]}
          </FilterLink>
        ))}
      </nav>

      {scoped && (
        <p className="text-muted-foreground text-xs">
          {listingId
            ? "Showing the bookings on one listing."
            : "Showing one member's bookings, on both sides."}{" "}
          <Link
            href={hrefFor({ listing: undefined, user: undefined })}
            className="underline underline-offset-4"
          >
            Show all bookings
          </Link>
        </p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-4">
          {items.map((booking) => (
            <li key={booking.id}>
              <AdminBookingCard booking={booking} />
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 && (
        <EmptyState
          icon={CalendarSearchIcon}
          title={
            total === 0 ? "No bookings match that" : "No bookings on this page"
          }
          description={
            total === 0
              ? "A booking id must be given in full. Names, emails and listing titles match on a fragment, and the dates cover the rental period rather than when the request was made."
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
 * One `BookingStatus` from the query string, or `undefined`.
 *
 * Falls back to unfiltered rather than 404ing on an unrecognised value: these are filters on a list,
 * not identifiers, and a mistyped one should show everything rather than an error page.
 */
function parseStatus(
  raw: string | string[] | undefined
): BookingStatus | undefined {
  const value = first(raw)?.toUpperCase();

  return value && value in BookingStatus
    ? BookingStatus[value as keyof typeof BookingStatus]
    : undefined;
}

/**
 * A `YYYY-MM-DD` parameter, validated as a real calendar day.
 *
 * Through `calendarDateSchema`, which is the same check the availability calendar uses - it
 * round-trips the date, so `2026-02-31` is rejected rather than silently becoming 3 March and
 * filtering on a day nobody asked about.
 */
function parseDay(raw: string | string[] | undefined): string | undefined {
  const value = first(raw)?.trim();

  if (!value) {
    return undefined;
  }

  return calendarDateSchema.safeParse(value).success ? value : undefined;
}

/**
 * A calendar day as UTC midnight.
 *
 * `Booking.startDate` and `endDate` are `@db.Date`, which Postgres returns as UTC midnight, so the
 * comparison has to be built the same way - constructing from a local-time `new Date("2026-08-12")`
 * would shift the boundary by the server's offset and quietly drop a day's rentals.
 */
function toUtcDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}
