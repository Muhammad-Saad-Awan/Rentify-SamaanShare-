import { FlagIcon } from "lucide-react";
import Link from "next/link";

import { AwaitingBadge } from "@/components/admin/attention";
import { StatusBadge as StatusLabel } from "@/components/shared/status-badge";
import { Card } from "@/components/ui/card";
import { ListingPhoto } from "@/components/marketplace/listing-photo";
import { ListingStatus, UserStatus } from "@/generated/prisma/enums";
import { formatPKRPerDay } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { CONDITION_LABELS, formatCity } from "@/lib/utils/listing";

import type { AdminListingSummary } from "@/lib/queries/admin-listings";

interface AdminListingCardProps {
  listing: AdminListingSummary;
}

/**
 * One listing in the moderation queue.
 *
 * A Server Component. Every control lives on the detail screen, deliberately: a Remove button in a
 * list is a button pressed against the wrong row, and every removal here requires a written reason
 * anyway - which is not something to type into a list of twenty.
 *
 * SHOWS WHETHER THE PUBLIC CAN ACTUALLY SEE IT, not just the listing's own status. `ACTIVE` is not
 * the same as visible: `VISIBLE_LISTING_WHERE` also requires the owner to be active, so an ACTIVE
 * listing belonging to a suspended account is already invisible. A moderator about to remove
 * something that is already gone from the marketplace is making a decision on a false premise.
 */
function AdminListingCard({ listing }: AdminListingCardProps) {
  const ownerHidden =
    listing.owner.status !== UserStatus.ACTIVE || listing.owner.isDeleted;

  const publiclyVisible =
    listing.status === ListingStatus.ACTIVE &&
    !listing.isDeleted &&
    !ownerHidden;

  return (
    <Card size="sm">
      <div className="flex gap-3 px-(--card-spacing) sm:gap-4">
        {/*
          Cloudinary only - `remotePatterns` in next.config.ts is an allow-list, and `next/image`
          throws on an unlisted host rather than degrading. A listing with no photo renders the
          placeholder rather than an empty box, because "no photos" is itself a moderation signal.
        */}
        <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-xl border sm:size-20">
          {listing.imageUrl ? (
            <ListingPhoto
              src={listing.imageUrl}
              alt=""
              sizes="80px"
              className="object-cover"
            />
          ) : (
            <span className="text-muted-foreground flex h-full items-center justify-center text-xs">
              no photo
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
            <Link
              href={`/admin/listings/${listing.id}`}
              className="font-heading decoration-foreground/30 min-w-0 text-base leading-snug font-semibold break-words underline-offset-4 hover:underline"
            >
              {listing.title}
            </Link>

            <div className="flex flex-wrap items-center gap-1.5">
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

              {listing.isDeleted ? (
                <StatusLabel variant="destructive" label="Removed" />
              ) : (
                <StatusLabel
                  variant={publiclyVisible ? "default" : "outline"}
                  label={LISTING_STATUS_LABELS[listing.status]}
                />
              )}
            </div>
          </div>

          <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
            <span className="font-heading text-foreground text-sm font-semibold tabular-nums">
              {formatPKRPerDay(listing.pricePerDay)}
            </span>
            <span>{formatCity(listing.city)}</span>
            <span>{CONDITION_LABELS[listing.condition]}</span>
            <span className="tabular-nums">{listing.viewCount} views</span>
            <span>Posted {formatDate(listing.createdAt)}</span>
          </div>

          <p className="text-muted-foreground text-xs">
            {/*
              The owner's admin screen, not their public profile: a suspended or deleted account has
              no public profile at all, so from a moderation list the public link is the one that
              breaks for exactly the accounts most likely to be clicked.
            */}
            By{" "}
            <Link
              href={`/admin/users/${listing.owner.id}`}
              className="text-foreground underline-offset-4 hover:underline"
            >
              {listing.owner.name?.trim() || "Unnamed member"}
            </Link>
            {ownerHidden && (
              <span>
                {" "}
                — owner{" "}
                {listing.owner.isDeleted
                  ? "deleted"
                  : listing.owner.status.toLowerCase()}
              </span>
            )}
            {/*
              Stated only when it contradicts the status. An ACTIVE listing that the public cannot
              see is the case a moderator would otherwise get wrong; saying "publicly visible" on
              every other row would just be noise. The badge is emerald only when it IS visible.
            */}
            {!publiclyVisible && !listing.isDeleted && (
              <span className="italic"> · Not publicly visible.</span>
            )}
          </p>
        </div>
      </div>
    </Card>
  );
}

/** The listing's own status in sentence case. `DELETED` is shown as "Removed" by the caller. */
const LISTING_STATUS_LABELS: Readonly<Record<ListingStatus, string>> = {
  [ListingStatus.ACTIVE]: "Active",
  [ListingStatus.PAUSED]: "Paused",
  [ListingStatus.DRAFT]: "Draft",
  [ListingStatus.REJECTED]: "Rejected",
  [ListingStatus.DELETED]: "Removed",
};

export { AdminListingCard };
