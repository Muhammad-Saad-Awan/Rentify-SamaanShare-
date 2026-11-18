import {
  CalendarClockIcon,
  CalendarSearchIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  FlagIcon,
  PackageSearchIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminActionLog } from "@/components/admin/admin-action-log";
import { AwaitingBadge } from "@/components/admin/attention";
import { Fact, FactGrid } from "@/components/admin/fact-grid";
import { ListingModerationPanel } from "@/components/admin/listing-moderation-panel";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge as StatusLabel } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ListingStatus,
  ReportStatus,
  UserStatus,
} from "@/generated/prisma/enums";
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
        <div className="flex flex-col gap-5 px-(--card-spacing)">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {listing.isDeleted ? (
                <StatusLabel
                  variant="destructive"
                  label={`Removed${listing.deletedAt ? ` ${formatDate(listing.deletedAt)}` : ""}`}
                />
              ) : (
                <StatusLabel
                  variant={publiclyVisible ? "default" : "outline"}
                  label={LISTING_STATUS_LABELS[listing.status]}
                />
              )}

              {listing.reportCount > 0 && (
                <AwaitingBadge
                  icon={FlagIcon}
                  label={
                    listing.reportCount === 1
                      ? "1 report"
                      : `${listing.reportCount} reports`
                  }
                />
              )}
            </div>

            {/*
              WHETHER THE PUBLIC CAN SEE IT, stated plainly, because the status badge alone does not
              answer it: `VISIBLE_LISTING_WHERE` also requires the owner to be active, so an ACTIVE
              listing owned by a suspended account is already invisible. A moderator removing something
              that is already gone from the marketplace is deciding on a false premise.
            */}
            <p className="flex items-start gap-1.5 text-xs">
              {publiclyVisible ? (
                <>
                  <EyeIcon
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="font-medium">
                    Publicly visible on the marketplace.
                  </span>
                </>
              ) : (
                <>
                  <EyeOffIcon
                    className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-muted-foreground">
                    Not publicly visible
                    {listing.isDeleted
                      ? " — removed."
                      : ownerHidden
                        ? ` — the owner is ${listing.owner.isDeleted ? "deleted" : listing.owner.status.toLowerCase()}, which hides every listing they own. Reinstating them brings all of them back.`
                        : ` — the listing is ${listing.status.toLowerCase()}.`}
                  </span>
                </>
              )}
            </p>
          </div>

          {listing.images.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {listing.images.map((image) => (
                <li
                  key={image.url}
                  className="bg-muted relative size-20 overflow-hidden rounded-lg border sm:size-24"
                >
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                </li>
              ))}
            </ul>
          )}

          <FactGrid columns={3}>
            <Fact label="Owner">
              <Link
                href={`/admin/users/${listing.owner.id}`}
                className="decoration-foreground/30 hover:decoration-foreground font-medium underline underline-offset-4"
              >
                {listing.owner.name?.trim() || "Unnamed member"}
              </Link>
              {/* Admin area only - see the note in `searchUsers` on why email is selected here. */}
              <span className="text-muted-foreground block text-xs break-all">
                {listing.ownerEmail}
              </span>
            </Fact>
            <Fact label="Category">
              {listing.categoryName}
              {listing.subcategoryName ? ` / ${listing.subcategoryName}` : ""}
            </Fact>
            <Fact label="Location">
              {formatCity(listing.city)}
              {listing.area ? ` — ${listing.area}` : ""}
            </Fact>
            <Fact label="Daily" money>
              {formatPKRPerDay(listing.pricePerDay)}
            </Fact>
            {listing.pricePerWeek !== null && (
              <Fact label="Weekly" money>
                {formatPKR(listing.pricePerWeek)}
              </Fact>
            )}
            {listing.pricePerMonth !== null && (
              <Fact label="Monthly" money>
                {formatPKR(listing.pricePerMonth)}
              </Fact>
            )}
            <Fact label="Deposit" money>
              {formatPKR(listing.securityDeposit)}
            </Fact>
            <Fact label="Condition">{CONDITION_LABELS[listing.condition]}</Fact>
            <Fact label="Posted">{formatDate(listing.createdAt)}</Fact>
            <Fact label="Last changed">{formatDate(listing.updatedAt)}</Fact>
          </FactGrid>

          {/* A string, never HTML - it is user input. */}
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground text-xs">Description</p>
            <p className="max-w-[65ch] text-sm leading-relaxed break-words whitespace-pre-line">
              {listing.description}
            </p>
          </div>

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
            <span>{listing.viewCount} views</span>
            <span>{listing.saveCount} saves</span>
            <span>{listing.bookingCount} bookings</span>
            {/*
              Amber when anything is out: it is the fact a removal decision turns on - see the
              live-booking warning in the moderation panel.
            */}
            {listing.activeBookingCount > 0 ? (
              <Badge variant="warning">
                <CalendarClockIcon aria-hidden="true" />
                {listing.activeBookingCount} live now
              </Badge>
            ) : (
              <span>0 live now</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-4">
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
              <PackageSearchIcon aria-hidden="true" />
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

      {/*
        The controls beside the evidence on a wide screen - the complaints and what has already been
        done - so a removal is decided with both in view rather than a scroll apart.
      */}
      <div className="grid gap-4 lg:grid-cols-5 lg:items-start">
        <Card className="lg:col-span-2">
          <div className="flex flex-col gap-4 px-(--card-spacing)">
            <div className="flex flex-col gap-0.5">
              <h2 className="font-heading text-base font-semibold tracking-tight">
                Moderation
              </h2>
              <p className="text-muted-foreground text-xs">
                Every action is recorded against this listing and its owner,
                with your name and reason.
              </p>
            </div>
            <ListingModerationPanel listing={listing} />
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-3">
          {listing.reports.length > 0 && (
            <Card>
              <div className="flex flex-col gap-4 px-(--card-spacing)">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-heading text-base font-semibold tracking-tight">
                    Reports against this listing
                  </h2>
                  <Link
                    href="/admin/reports"
                    className="text-xs font-medium underline underline-offset-4"
                  >
                    Decide in the report queue
                  </Link>
                </div>

                {/*
                  Shown here as well as in the queue, because this screen is where the decision gets
                  made. A moderator who has to open another tab to read the complaints decides from
                  the reason label alone - which is the reporter's opinion, not evidence.
                */}
                <ul className="flex flex-col divide-y rounded-lg border">
                  {listing.reports.map((report) => (
                    <li
                      key={report.id}
                      className="flex flex-col gap-1 px-3.5 py-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">
                          {REPORT_REASON_LABELS[report.reason]}
                        </span>
                        {report.status === ReportStatus.PENDING ? (
                          <AwaitingBadge label="Pending" />
                        ) : (
                          <StatusLabel
                            variant="outline"
                            label={
                              report.status === ReportStatus.RESOLVED
                                ? "Resolved"
                                : "Dismissed"
                            }
                          />
                        )}
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {formatDate(report.createdAt)} ·{" "}
                        <Link
                          href={`/admin/users/${report.reporter.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          by {report.reporter.name?.trim() || "a member"}
                        </Link>
                      </p>

                      {/* A string, never HTML - a reporter typed it. */}
                      {report.description ? (
                        <p className="text-muted-foreground leading-relaxed break-words whitespace-pre-line">
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
              </div>
            </Card>
          )}

          <Card>
            <div className="flex flex-col gap-4 px-(--card-spacing)">
              <h2 className="font-heading text-base font-semibold tracking-tight">
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
        </div>
      </div>
    </>
  );
}

/** The listing's own status in sentence case. `DELETED` arrives as `isDeleted` and is shown apart. */
const LISTING_STATUS_LABELS: Readonly<Record<ListingStatus, string>> = {
  [ListingStatus.ACTIVE]: "Active",
  [ListingStatus.PAUSED]: "Paused",
  [ListingStatus.DRAFT]: "Draft",
  [ListingStatus.REJECTED]: "Rejected",
  [ListingStatus.DELETED]: "Removed",
};
