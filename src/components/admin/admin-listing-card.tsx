import { FlagIcon, TrashIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
    <Card>
      <div className="flex gap-3 px-(--card-spacing)">
        {/*
          Cloudinary only - `remotePatterns` in next.config.ts is an allow-list, and `next/image`
          throws on an unlisted host rather than degrading. A listing with no photo renders the
          placeholder rather than an empty box, because "no photos" is itself a moderation signal.
        */}
        <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-md">
          {listing.imageUrl ? (
            <Image
              src={listing.imageUrl}
              alt=""
              fill
              sizes="64px"
              className="object-cover"
            />
          ) : (
            <span className="text-muted-foreground flex h-full items-center justify-center text-[10px]">
              no photo
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/listings/${listing.id}`}
              className="font-heading text-sm font-medium underline-offset-4 hover:underline"
            >
              {listing.title}
            </Link>

            {listing.isDeleted ? (
              <Badge variant="destructive">
                <TrashIcon className="size-3" aria-hidden="true" />
                removed
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
                {listing.reportCount}
              </Badge>
            )}
          </div>

          <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span>{formatPKRPerDay(listing.pricePerDay)}</span>
            <span>{formatCity(listing.city)}</span>
            <span>{CONDITION_LABELS[listing.condition]}</span>
            <span>{listing.viewCount} views</span>
            <span>{formatDate(listing.createdAt)}</span>
          </div>

          <p className="text-muted-foreground text-xs">
            {/*
              The owner's admin screen, not their public profile: a suspended or deleted account has
              no public profile at all, so from a moderation list the public link is the one that
              breaks for exactly the accounts most likely to be clicked.
            */}
            <Link
              href={`/admin/users/${listing.owner.id}`}
              className="underline-offset-4 hover:underline"
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
          </p>

          {/*
            Stated only when it contradicts the status badge. An ACTIVE listing that the public
            cannot see is the case a moderator would otherwise get wrong; saying "publicly visible"
            on every other row would just be noise.
          */}
          {!publiclyVisible && !listing.isDeleted && (
            <p className="text-muted-foreground text-xs italic">
              Not publicly visible.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

export { AdminListingCard };
