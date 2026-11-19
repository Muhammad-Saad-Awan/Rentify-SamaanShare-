"use client";

import {
  CalendarDaysIcon,
  EyeIcon,
  HeartIcon,
  ImageIcon,
  Loader2Icon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  deleteListing,
  updateListingStatus,
} from "@/actions/listing-management";
import { ListingStatusBadge } from "@/components/listings/listing-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { ListingPhoto } from "@/components/marketplace/listing-photo";
import { ListingStatus } from "@/generated/prisma/enums";
import { formatPKRPerDay } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { formatCity } from "@/lib/utils/listing";

import type { OwnerListingSummary } from "@/lib/queries/owner-listings";

interface OwnerListingCardProps {
  listing: OwnerListingSummary;
}

/**
 * One row in the owner's management list.
 *
 * A Client Component because pause, resume and delete are actions with pending states. The
 * server decides what is permitted - `ALLOWED_STATUS_TRANSITIONS` and the ownership check
 * live in the action - so the buttons here are an affordance, not the rule. Hiding a button
 * is never the enforcement.
 *
 * No optimistic state on the status. Unlike a wishlist heart, a status change alters what
 * the whole row means (a paused listing loses its public link), and the row is re-rendered
 * from the server after `revalidatePath` anyway. A spinner for the round trip is honest;
 * flipping the badge before the server agrees would be a guess about a state that governs
 * public visibility.
 *
 * The controls sit in the card's footer strip, the same shell the booking cards use, so the
 * facts about the item read first and the things you can do to it read as a separate row.
 */
function OwnerListingCard({ listing }: OwnerListingCardProps) {
  const [isPending, startTransition] = useTransition();

  const isActive = listing.status === ListingStatus.ACTIVE;
  const isPaused = listing.status === ListingStatus.PAUSED;
  const canToggle = isActive || isPaused;

  function handleStatusChange() {
    startTransition(async () => {
      const result = await updateListingStatus({
        id: listing.id,
        status: isActive ? ListingStatus.PAUSED : ListingStatus.ACTIVE,
      });

      if (!result.success) {
        toast.error(result.error);

        return;
      }

      toast.success(
        result.data.status === ListingStatus.ACTIVE
          ? "Listing is live again."
          : "Listing paused - it is hidden from browse."
      );
    });
  }

  function handleDelete() {
    /**
     * `window.confirm`, deliberately.
     *
     * No dialog primitive exists in this project yet, and a hand-rolled modal needs a focus
     * trap, a scroll lock and an escape handler to be usable - all of which the native
     * dialog already does correctly, including for screen readers. Worth replacing when a
     * real AlertDialog lands; not worth shipping an unguarded destructive button meanwhile.
     */
    const confirmed = window.confirm(
      `Delete "${listing.title}"? It will be removed from the marketplace.`
    );

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const result = await deleteListing(listing.id);

      if (!result.success) {
        toast.error(result.error);

        return;
      }

      toast.success("Listing deleted.");
    });
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 px-(--card-spacing)">
        {/*
          Thumbnail beside the text at every width. A full-width photo on a phone pushed the
          title, the numbers and every control below the fold for each row, on a screen whose job
          is managing several items - the cover photo is for recognition, not the point.
        */}
        <div className="flex gap-4">
          <div className="bg-muted relative aspect-4/3 w-24 shrink-0 self-start overflow-hidden rounded-xl sm:w-36">
            {listing.imageUrl ? (
              <ListingPhoto
                src={listing.imageUrl}
                alt=""
                sizes="(min-width: 640px) 9rem, 6rem"
                className="object-cover"
              />
            ) : (
              <div
                className="text-muted-foreground flex h-full items-center justify-center"
                aria-hidden="true"
              >
                <ImageIcon className="size-5" />
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <ListingStatusBadge status={listing.status} />
              <span className="text-muted-foreground text-xs">
                Listed {formatDate(listing.createdAt)}
              </span>
            </div>

            <h3 className="font-heading line-clamp-2 text-base leading-snug font-semibold tracking-tight break-words">
              {listing.title}
            </h3>

            <p className="text-sm">
              <span className="font-heading font-semibold tabular-nums">
                {formatPKRPerDay(listing.pricePerDay)}
              </span>
              <span className="text-muted-foreground">
                {" "}
                · {formatCity(listing.city)}
              </span>
            </p>
          </div>
        </div>

        {/*
          Stats as a definition list: each is a labelled value, and the icons alone would
          leave a screen reader reading four bare numbers.
        */}
        <dl className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <Stat icon={EyeIcon} label="views" value={listing.viewCount} />
          <Stat icon={HeartIcon} label="saves" value={listing.saveCount} />
          <Stat icon={ImageIcon} label="photos" value={listing.imageCount} />
          <Stat
            icon={CalendarDaysIcon}
            label="days blocked"
            value={listing.blockedDateCount}
          />
        </dl>
      </div>

      <CardFooter className="flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          render={<Link href={`/dashboard/listings/${listing.id}/edit`} />}
        >
          <PencilIcon />
          Edit
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          render={
            <Link href={`/dashboard/listings/${listing.id}/availability`} />
          }
        >
          <CalendarDaysIcon />
          Availability
        </Button>

        {canToggle && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleStatusChange}
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending ? (
              <Loader2Icon className="animate-spin" />
            ) : isActive ? (
              <PauseIcon />
            ) : (
              <PlayIcon />
            )}
            {isActive ? "Pause" : "Resume"}
          </Button>
        )}

        {/*
          Only linked when public. A paused or draft listing 404s on its detail page -
          the public query filters on ACTIVE - so a "View" link would be broken.
        */}
        {isActive && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            render={<Link href={`/listings/${listing.id}`} />}
          >
            View
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={isPending}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive ml-auto"
        >
          <Trash2Icon />
          Delete
        </Button>
      </CardFooter>
    </Card>
  );
}

interface StatProps {
  icon: typeof EyeIcon;
  label: string;
  value: number;
}

function Stat({ icon: Icon, label, value }: StatProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="text-foreground font-medium tabular-nums">
          {value}
        </span>{" "}
        {label}
      </dd>
    </div>
  );
}

export { OwnerListingCard };
