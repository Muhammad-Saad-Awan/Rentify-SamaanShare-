import {
  ArrowRightIcon,
  BellIcon,
  CalendarCheckIcon,
  HeartIcon,
  ImageIcon,
  InboxIcon,
  PackageIcon,
  PlusIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { ListingStatusBadge } from "@/components/listings/listing-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
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
import type { ReactNode } from "react";

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
    <Suspense
      fallback={<DashboardPageSkeleton withStats cards={2} variant="split" />}
    >
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
  const hasRequests = overview.requestsToAnswer > 0;

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

      {/*
        The one task on this page, said first and in words. The tile below carries the same count,
        but a number in a grid of four is something you notice; a sentence with a button is
        something you do. Amber, not red: nothing has gone wrong, somebody is waiting on you.
      */}
      {hasRequests && (
        <div className="border-warning/40 bg-warning-soft text-warning-soft-foreground flex flex-col gap-3 rounded-xl border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2.5 text-sm">
            <TriangleAlertIcon
              className="text-warning mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>
              <span className="font-semibold">
                {overview.requestsToAnswer === 1
                  ? "1 booking request is waiting for your answer."
                  : `${overview.requestsToAnswer.toLocaleString()} booking requests are waiting for your answer.`}
              </span>{" "}
              Requests expire 48 hours after they are made.
            </span>
          </p>
          <Button
            size="sm"
            className="w-full sm:w-auto"
            render={<Link href="/dashboard/requests" />}
          >
            Review requests
            <ArrowRightIcon aria-hidden="true" />
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Live listings"
          value={overview.liveListings.toLocaleString()}
          icon={PackageIcon}
          href="/dashboard/listings"
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
          href="/dashboard/requests"
          tone={hasRequests ? "attention" : "default"}
          hint={
            hasRequests
              ? "Renters are waiting — requests expire in 48 hours"
              : "Nothing waiting on you"
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
          href="/saved"
          hint="Items still available on your wishlist"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryCard
          title="Your listings"
          footer={
            isOwner ? (
              <FooterLink href="/dashboard/listings">
                Manage all {overview.totalListings}
              </FooterLink>
            ) : null
          }
        >
          {listings.items.length > 0 ? (
            <ul className="-my-1 flex flex-col divide-y">
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
            <div className="flex flex-col items-start gap-3">
              <p className="text-muted-foreground text-sm leading-relaxed">
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
        </SummaryCard>

        <SummaryCard
          title="Recent activity"
          footer={
            <FooterLink href="/dashboard/notifications">
              All notifications
            </FooterLink>
          }
        >
          {/*
            The notification feed IS the activity record for a member - every booking transition,
            handover, claim and review writes one, in the same transaction as the change it
            describes. This card promised "booking requests, approvals and messages as they happen"
            while that feed already existed one click away.
          */}
          {notifications.length > 0 ? (
            <ul className="-my-1 flex flex-col divide-y">
              {notifications.map((item) => {
                const href = notificationHref(item.entityType, item.entityId);
                const unread = !item.readAt;
                const content = (
                  <>
                    <span
                      className={
                        unread
                          ? "min-w-0 flex-1 truncate font-medium"
                          : "min-w-0 flex-1 truncate"
                      }
                    >
                      {item.title}
                    </span>
                    {unread && <span className="sr-only">(new)</span>}
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {formatRelativeTime(item.createdAt, now)}
                    </span>
                  </>
                );

                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 py-2.5 text-sm"
                  >
                    {/*
                      A filled navy dot for unread, the bell for read: shape and weight carry the
                      state alongside the sr-only "(new)", so it never rests on colour alone.
                    */}
                    <span
                      className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-full"
                      aria-hidden="true"
                    >
                      {unread ? (
                        <span className="bg-primary size-2 rounded-full" />
                      ) : (
                        <BellIcon className="text-muted-foreground size-3.5" />
                      )}
                    </span>
                    {/*
                      `notificationHref` returns null for events with no page to open - a resolved
                      report, for instance, since there is no screen listing the reports you filed.
                      Rendered as plain text rather than a dead link.
                    */}
                    {href ? (
                      <Link
                        href={href}
                        className="flex min-w-0 flex-1 items-baseline gap-3 underline-offset-4 hover:underline"
                      >
                        {content}
                      </Link>
                    ) : (
                      <span className="flex min-w-0 flex-1 items-baseline gap-3">
                        {content}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm leading-relaxed">
              Nothing yet. Booking requests, approvals and payment confirmations
              will appear here as they happen.
            </p>
          )}
        </SummaryCard>
      </div>
    </>
  );
}

interface SummaryCardProps {
  title: string;
  /** A link to the full screen, in the card's footer strip. `null` hides the strip. */
  footer: ReactNode;
  children: ReactNode;
}

/** One of the two summary panels: a titled card whose footer leads to the full screen. */
function SummaryCard({ title, footer, children }: SummaryCardProps) {
  return (
    <Card>
      <div className="flex flex-1 flex-col gap-4 px-(--card-spacing)">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {children}
      </div>
      {footer && <CardFooter className="mt-auto">{footer}</CardFooter>}
    </Card>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2"
    >
      {children}
      <ArrowRightIcon className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

/**
 * One listing in the overview's summary.
 *
 * Deliberately not `OwnerListingCard`, which carries pause, resume and delete. Those belong on the
 * management screen: an overview is for noticing something, and a destructive control beside a
 * glanceable row is a control pressed by accident.
 *
 * Linked to the public page only while live - a paused or draft listing 404s there, so those rows
 * go to the edit screen instead, which is where the owner would deal with them anyway.
 */
function ListingRow({ listing }: { listing: OwnerListingSummary }) {
  const isLive = listing.status === ListingStatus.ACTIVE;

  return (
    <li className="flex items-center gap-3 py-2.5 text-sm">
      <span className="bg-muted relative aspect-4/3 w-14 shrink-0 overflow-hidden rounded-md">
        {listing.imageUrl ? (
          <Image
            src={listing.imageUrl}
            alt=""
            fill
            sizes="3.5rem"
            className="object-cover"
          />
        ) : (
          <span
            className="text-muted-foreground flex h-full items-center justify-center"
            aria-hidden="true"
          >
            <ImageIcon className="size-4" />
          </span>
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={
            isLive
              ? `/listings/${listing.id}`
              : `/dashboard/listings/${listing.id}/edit`
          }
          className="truncate font-medium underline-offset-4 hover:underline"
        >
          {listing.title}
        </Link>
        <span className="text-muted-foreground truncate text-xs">
          <span className="font-heading text-foreground font-semibold tabular-nums">
            {formatPKRPerDay(listing.pricePerDay)}
          </span>{" "}
          · {listing.viewCount.toLocaleString()} views
        </span>
      </div>

      {!isLive && <ListingStatusBadge status={listing.status} />}
    </li>
  );
}
