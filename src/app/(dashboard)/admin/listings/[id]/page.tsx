import {
  CalendarSearchIcon,
  ExternalLinkIcon,
  FlagIcon,
  TrashIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminActionLog } from "@/components/admin/admin-action-log";
import { ListingModerationPanel } from "@/components/admin/listing-moderation-panel";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListingStatus, UserStatus } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminListingDetail } from "@/lib/queries/admin-listings";
import { REPORT_REASON_LABELS } from "@/lib/reports/rules";
import { formatPKR, formatPKRPerDay } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { CONDITION_LABELS, formatCity } from "@/lib/utils/listing";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Listing",
  description: "Listing detail and moderation history.",
  robots: { index: false, follow: false },
};

interface AdminListingPageProps {
  params: Promise<{ id: string }>;
}

/**
 * One listing, with everything needed to decide about it.
 *
 * The id is validated in `layout.tsx`, which runs before the first byte - see the note there. This
 * still handles `null`, because the layout's guarantee is about *ordering*, not about types, and a
 * page that assumed non-null would be one refactor away from a crash.
 *
 * NO IN-PAGE SUSPENSE. The whole page is one listing's record and there is nothing worth showing
 * before the rest arrives.
 */
export default async function AdminListingPage({
  params,
}: AdminListingPageProps) {
  await requireAdmin();
  const { id } = await params;

  const listing = await getAdminListingDetail(id);

  if (!listing) {
    notFound();
  }

  const ownerHidden =
    listing.owner.status !== UserStatus.ACTIVE || listing.owner.isDeleted;

  const publiclyVisible =
    listing.status === ListingStatus.ACTIVE &&
    !listing.isDeleted &&
    !ownerHidden;

  return (
    <>
      <PageHeader
        title={listing.title}
        description="Listing detail, moderation controls and the full administrator history."
        actions={
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/admin/listings" />}
          >
            Back to listings
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 px-(--card-spacing)">
          <div className="flex flex-wrap items-center gap-2">
            {listing.isDeleted ? (
              <Badge variant="destructive">
                <TrashIcon className="size-3" aria-hidden="true" />
                removed
                {listing.deletedAt ? ` ${formatDate(listing.deletedAt)}` : ""}
              </Badge>
            ) : (
              <Badge
                variant={
                  listing.status === ListingStatus.ACTIVE
                    ? "outline"
                    : "secondary"
                }
              >
                {listing.status.toLowerCase()}
              </Badge>
            )}

            {listing.reportCount > 0 && (
              <Badge variant="destructive">
                <FlagIcon className="size-3" aria-hidden="true" />
                {listing.reportCount === 1
                  ? "1 report"
                  : `${listing.reportCount} reports`}
              </Badge>
            )}
          </div>

          {/*
            WHETHER THE PUBLIC CAN SEE IT, stated plainly, because the status badge alone does not
            answer it: `VISIBLE_LISTING_WHERE` also requires the owner to be active, so an ACTIVE
            listing owned by a suspended account is already invisible. A moderator removing something
            that is already gone from the marketplace is deciding on a false premise.
          */}
          <p className="text-xs">
            {publiclyVisible ? (
              <span className="text-emerald-700 dark:text-emerald-400">
                Publicly visible on the marketplace.
              </span>
            ) : (
              <span className="text-muted-foreground">
                Not publicly visible
                {listing.isDeleted
                  ? " — removed."
                  : ownerHidden
                    ? ` — the owner is ${listing.owner.isDeleted ? "deleted" : listing.owner.status.toLowerCase()}, which hides every listing they own. Reinstating them brings all of them back.`
                    : ` — the listing is ${listing.status.toLowerCase()}.`}
              </span>
            )}
          </p>

          {listing.images.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {listing.images.map((image) => (
                <li
                  key={image.url}
                  className="bg-muted relative size-20 overflow-hidden rounded-md"
                >
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </li>
              ))}
            </ul>
          )}

          <dl className="text-muted-foreground grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            <div>
              <dt className="inline font-medium">Owner: </dt>
              <dd className="inline">
                <Link
                  href={`/admin/users/${listing.owner.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {listing.owner.name?.trim() || "Unnamed member"}
                </Link>{" "}
                {/* Admin area only - see the note in `searchUsers` on why email is selected here. */}
                <span className="break-all">({listing.ownerEmail})</span>
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Category: </dt>
              <dd className="inline">
                {listing.categoryName}
                {listing.subcategoryName ? ` / ${listing.subcategoryName}` : ""}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Condition: </dt>
              <dd className="inline">{CONDITION_LABELS[listing.condition]}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Location: </dt>
              <dd className="inline">
                {formatCity(listing.city)}
                {listing.area ? ` — ${listing.area}` : ""}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Daily: </dt>
              <dd className="inline">{formatPKRPerDay(listing.pricePerDay)}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Deposit: </dt>
              <dd className="inline">{formatPKR(listing.securityDeposit)}</dd>
            </div>
            {listing.pricePerWeek !== null && (
              <div>
                <dt className="inline font-medium">Weekly: </dt>
                <dd className="inline">{formatPKR(listing.pricePerWeek)}</dd>
              </div>
            )}
            {listing.pricePerMonth !== null && (
              <div>
                <dt className="inline font-medium">Monthly: </dt>
                <dd className="inline">{formatPKR(listing.pricePerMonth)}</dd>
              </div>
            )}
            <div>
              <dt className="inline font-medium">Posted: </dt>
              <dd className="inline">{formatDate(listing.createdAt)}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Last changed: </dt>
              <dd className="inline">{formatDate(listing.updatedAt)}</dd>
            </div>
          </dl>

          {/* A string, never HTML - it is user input. */}
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {listing.description}
          </p>

          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>{listing.viewCount} views</span>
            <span>{listing.saveCount} saves</span>
            <span>{listing.bookingCount} bookings</span>
            <span
              className={
                listing.activeBookingCount > 0
                  ? "text-destructive font-medium"
                  : ""
              }
            >
              {listing.activeBookingCount} live now
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {/*
              The public page, offered only when there is one to reach. A removed or paused listing
              404s for everyone including an administrator - `getListingDetail` filters through the
              shared visibility rule - so the link would break for exactly the listings most likely
              to be opened from here.
            */}
            {publiclyVisible && (
              <Button
                variant="outline"
                size="sm"
                render={<Link href={`/listings/${listing.id}`} />}
              >
                <ExternalLinkIcon aria-hidden="true" />
                View public page
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              render={
                <Link href={`/admin/listings?owner=${listing.owner.id}`} />
              }
            >
              Other listings by this member
            </Button>
            {/*
              The rentals on this item. Offered whenever any exist, because "is anything out on this
              right now" is the question a removal decision turns on - see the live-booking warning
              in the moderation panel.
            */}
            {listing.bookingCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                render={<Link href={`/admin/bookings?listing=${listing.id}`} />}
              >
                <CalendarSearchIcon aria-hidden="true" />
                {listing.bookingCount === 1
                  ? "1 booking"
                  : `${listing.bookingCount} bookings`}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3 px-(--card-spacing)">
          <h2 className="font-heading text-base font-medium">Moderation</h2>
          <ListingModerationPanel listing={listing} />
        </div>
      </Card>

      {listing.reports.length > 0 && (
        <Card>
          <div className="flex flex-col gap-3 px-(--card-spacing)">
            <h2 className="font-heading text-base font-medium">
              Reports against this listing
            </h2>

            {/*
              Shown here as well as in the queue, because this screen is where the decision gets
              made. A moderator who has to open another tab to read the complaints decides from the
              reason label alone - which is the reporter's opinion, not evidence.
            */}
            <ul className="flex flex-col gap-2.5">
              {listing.reports.map((report) => (
                <li
                  key={report.id}
                  className="flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">
                      {REPORT_REASON_LABELS[report.reason]}
                    </span>
                    <Badge variant="outline">
                      {report.status.toLowerCase()}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {formatDate(report.createdAt)}
                    </span>
                    <Link
                      href={`/admin/users/${report.reporter.id}`}
                      className="text-muted-foreground text-xs underline-offset-4 hover:underline"
                    >
                      by {report.reporter.name?.trim() || "a member"}
                    </Link>
                  </div>

                  {/* A string, never HTML - a reporter typed it. */}
                  {report.description ? (
                    <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                      {report.description}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs italic">
                      No description given.
                    </p>
                  )}
                </li>
              ))}
            </ul>

            <Link
              href="/admin/reports"
              className="text-primary text-xs underline-offset-4 hover:underline"
            >
              Open the report queue to record a decision
            </Link>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-col gap-3 px-(--card-spacing)">
          <h2 className="font-heading text-base font-medium">
            Administrator history
          </h2>
          {/*
            This listing's own history, read through `AdminAction.listingId`. The owner's account
            history at `/admin/users/[id]` shows these same rows alongside everything else done to
            them - the audit subject is the owner, and `listingId` is what lets both screens ask a
            narrower question of the same log.
          */}
          <AdminActionLog
            history={listing.history}
            emptyMessage="No administrator has acted on this listing."
          />
        </div>
      </Card>
    </>
  );
}
