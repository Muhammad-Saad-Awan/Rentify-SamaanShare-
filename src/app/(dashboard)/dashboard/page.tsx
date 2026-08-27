import {
  BellIcon,
  CalendarCheckIcon,
  HeartIcon,
  InboxIcon,
  PackageIcon,
  PlusIcon,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListingStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/session";
import { notificationHref } from "@/lib/notifications/messages";
import { getMemberOverview } from "@/lib/queries/member-overview";
import { getRecentNotifications } from "@/lib/queries/notifications";
import { getOwnerListings } from "@/lib/queries/owner-listings";
import { formatPKRPerDay } from "@/lib/utils/currency";
import { formatRelativeTime } from "@/lib/utils/date";
import { getDisplayName } from "@/lib/utils/user";

import type { OwnerListingSummary } from "@/lib/queries/owner-listings";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your SamaanShare activity at a glance.",
};

/** Listings shown in the summary card before it defers to the management screen. */
const LISTING_PREVIEW = 3;

/** Activity rows shown before deferring to the notifications page. */
const ACTIVITY_PREVIEW = 5;

/**
 * Dashboard overview.
 *
 * `requireUser()` is called here as well as in the layout, deliberately. React reuses a layout across
 * client-side navigations without re-running it, so the layout's check cannot be relied on for a page
 * reached from another dashboard route. The cost is re-reading the session cookie - no database
 * query, since `requireUser` reads role and status straight from the JWT.
 *
 * EVERY NUMBER HERE IS NOW REAL. This screen shipped in Phase 2.1 with four em dashes and hints
 * reading "Available in Phase 3", "Available in Phase 4". All of those landed, and a placeholder that
 * outlives its phase is worse than an empty state: it tells a member a working feature does not
 * exist, and they stop looking for it.
 *
 * THE UNREAD-NOTIFICATIONS TILE IS GONE, replaced by requests awaiting an answer. The count of unread
 * notifications is already in the header bell on every page of the app, and two surfaces showing the
 * same number are two surfaces that can disagree. What was missing was the one tile that is actually
 * a task: a request on your listing that nobody has answered.
 */
export default async function DashboardPage() {
  return (
    // The skeleton is wired up here rather than as a route-level `loading.tsx`.
    //
    // A `loading.tsx` in this segment creates a Suspense boundary covering `/dashboard`
    // AND every route nested under it, including `/dashboard/listings/[id]/edit`. Next
    // then flushes the shell with a 200 as soon as the fallback is ready, so those routes'
    // `notFound()` could no longer set a 404 - an owner opening someone else's listing got
    // 200 with the 404 page, which tells a crawler a dead URL is live. Measured both ways.
    <Suspense fallback={<DashboardPageSkeleton withStats cards={2} />}>
      <DashboardOverview />
    </Suspense>
  );
}

/** Everything on the overview that needs the session. */
async function DashboardOverview() {
  const user = await requireUser();

  const [overview, listings, notifications] = await Promise.all([
    getMemberOverview(user.id),
    getOwnerListings({ ownerId: user.id, pageSize: LISTING_PREVIEW }),
    getRecentNotifications(user.id, ACTIVITY_PREVIEW),
  ]);

  // One instant for the whole page, so two relative timestamps cannot contradict their order.
  const now = new Date();

  const isOwner = overview.totalListings > 0;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${getDisplayName(user)}`}
        description={
          isOwner
            ? "Your listings, your rentals and anything waiting on you."
            : "Rent something you need, or publish something you own."
        }
        actions={
          <Button size="sm" render={<Link href="/listings/new" />}>
            <PlusIcon aria-hidden="true" />
            New listing
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Live listings"
          value={overview.liveListings.toLocaleString()}
          icon={PackageIcon}
          /*
            The hint names the gap rather than leaving it. `liveListings` runs through
            VISIBLE_LISTING_WHERE, which also requires the owner to be active - so a paused listing,
            or a suspended account, makes these two numbers differ, and the member deserves to know
            which one the marketplace is showing.
          */
          hint={
            overview.totalListings === overview.liveListings
              ? "Visible on the marketplace"
              : `of ${overview.totalListings.toLocaleString()} published — the rest are paused or hidden`
          }
        />
        <StatCard
          label="Requests to answer"
          value={overview.requestsToAnswer.toLocaleString()}
          icon={InboxIcon}
          hint={
            overview.requestsToAnswer === 0
              ? "Nothing waiting on you"
              : "Renters are waiting — requests expire in 48 hours"
          }
        />
        <StatCard
          label="Rentals in progress"
          value={overview.rentalsInProgress.toLocaleString()}
          icon={CalendarCheckIcon}
          hint="Approved, awaiting payment, or out on rent"
        />
        <StatCard
          label="Saved listings"
          value={overview.savedListings.toLocaleString()}
          icon={HeartIcon}
          hint="Items still available on your wishlist"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex flex-col gap-3 px-(--card-spacing)">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-heading text-base font-medium">
                Your listings
              </h2>
              {isOwner && (
                <Link
                  href="/dashboard/listings"
                  className="text-muted-foreground text-xs underline-offset-4 hover:underline"
                >
                  Manage all {overview.totalListings}
                </Link>
              )}
            </div>

            {listings.items.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {listings.items.map((listing) => (
                  <ListingRow key={listing.id} listing={listing} />
                ))}
              </ul>
            ) : (
              /*
                An empty state, not a placeholder. The distinction matters: a placeholder says the
                feature is coming, an empty state says it works and there is nothing here yet - and
                offers the way out. This card used to be the former, months after the feature landed.
              */
              <div className="flex flex-col items-start gap-2">
                <p className="text-muted-foreground text-sm">
                  You have not published anything yet. A listing takes a few
                  minutes and one photo.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href="/listings/new" />}
                >
                  <PlusIcon aria-hidden="true" />
                  Create your first listing
                </Button>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-3 px-(--card-spacing)">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-heading text-base font-medium">
                Recent activity
              </h2>
              <Link
                href="/dashboard/notifications"
                className="text-muted-foreground text-xs underline-offset-4 hover:underline"
              >
                All notifications
              </Link>
            </div>

            {/*
              The notification feed IS the activity record for a member - every booking transition,
              handover, claim and review writes one, in the same transaction as the change it
              describes. This card promised "booking requests, approvals and messages as they happen"
              while that feed already existed one click away.
            */}
            {notifications.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {notifications.map((item) => {
                  const href = notificationHref(item.entityType, item.entityId);
                  const content = (
                    <>
                      <span className="flex-1 truncate">{item.title}</span>
                      {!item.readAt && (
                        <Badge variant="secondary" className="shrink-0">
                          new
                        </Badge>
                      )}
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {formatRelativeTime(item.createdAt, now)}
                      </span>
                    </>
                  );

                  return (
                    <li
                      key={item.id}
                      className="flex items-baseline gap-2 text-sm"
                    >
                      <BellIcon
                        className="text-muted-foreground size-3.5 shrink-0 translate-y-0.5"
                        aria-hidden="true"
                      />
                      {/*
                        `notificationHref` returns null for events with no page to open - a resolved
                        report, for instance, since there is no screen listing the reports you filed.
                        Rendered as plain text rather than a dead link.
                      */}
                      {href ? (
                        <Link
                          href={href}
                          className="flex min-w-0 flex-1 items-baseline gap-2 underline-offset-4 hover:underline"
                        >
                          {content}
                        </Link>
                      ) : (
                        <span className="flex min-w-0 flex-1 items-baseline gap-2">
                          {content}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                Nothing yet. Booking requests, approvals and payment
                confirmations will appear here as they happen.
              </p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

/**
 * One listing in the overview's summary.
 *
 * Deliberately not `OwnerListingCard`, which carries pause, resume and delete. Those belong on the
 * management screen: an overview is for noticing something, and a destructive control beside a
 * glanceable row is a control pressed by accident.
 */
function ListingRow({ listing }: { listing: OwnerListingSummary }) {
  return (
    <li className="flex items-baseline gap-2 text-sm">
      <Link
        href={`/listings/${listing.id}`}
        className="min-w-0 flex-1 truncate underline-offset-4 hover:underline"
      >
        {listing.title}
      </Link>
      {listing.status !== ListingStatus.ACTIVE && (
        <Badge variant="outline" className="shrink-0">
          {listing.status.toLowerCase()}
        </Badge>
      )}
      <span className="text-muted-foreground shrink-0 text-xs">
        {formatPKRPerDay(listing.pricePerDay)}
      </span>
      <span className="text-muted-foreground shrink-0 text-xs">
        {listing.viewCount} views
      </span>
    </li>
  );
}
