import { BadgeCheckIcon, MapPinIcon, StarIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/date";
import { formatCity } from "@/lib/utils/listing";

import type { ListingOwner } from "@/lib/queries/listing-detail";

interface OwnerCardProps {
  owner: ListingOwner;
}

/**
 * Who is renting the item out.
 *
 * Names the owner without `getDisplayName`, deliberately. That helper falls back to
 * the local part of the email address, which is right in the dashboard - where you
 * are looking at your own account - and a privacy leak on a page anyone can read.
 * The query does not even select `email`, so this falls back to a neutral label.
 *
 * The rating is only rendered once at least one review exists. "0.0 (0)" reads as a
 * bad score rather than as an absent one, which is unfair to a new owner.
 */
function OwnerCard({ owner }: OwnerCardProps) {
  const name = owner.name?.trim() || "SamaanShare member";
  const avatarSrc = owner.avatarUrl ?? owner.image;
  const hasRating = owner.ratingAverage !== null && owner.ratingCount > 0;

  return (
    <Card>
      <div className="flex items-start gap-3 px-(--card-spacing)">
        <Avatar className="size-10 shrink-0">
          {avatarSrc && <AvatarImage src={avatarSrc} alt="" />}
          {/*
            Initials come from the resolved display name, so an owner with no name
            gets "SM" rather than a fallback derived from a hidden email.
          */}
          <AvatarFallback>{initialsFor(name)}</AvatarFallback>
        </Avatar>

        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="font-heading text-sm font-medium">{name}</span>

            {owner.isVerified && (
              <span
                className="text-primary flex items-center gap-1 text-xs"
                // The icon is decorative; the word carries the meaning.
                title="Identity verified by SamaanShare"
              >
                <BadgeCheckIcon className="size-3.5" aria-hidden="true" />
                Verified
              </span>
            )}
          </div>

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {hasRating && (
              <span className="flex items-center gap-1">
                <StarIcon
                  className="size-3.5 fill-current text-amber-500"
                  aria-hidden="true"
                />
                {/*
                  One decimal place: the column is a Float average of integers
                  1-5, and rendering it raw would show 4.333333333333333.
                */}
                {owner.ratingAverage?.toFixed(1)}
                <span className="sr-only"> out of 5, from </span>
                <span aria-hidden="true">·</span>
                {owner.ratingCount === 1
                  ? "1 review"
                  : `${owner.ratingCount} reviews`}
              </span>
            )}

            {owner.city && (
              <span className="flex items-center gap-1">
                <MapPinIcon className="size-3.5" aria-hidden="true" />
                {formatCity(owner.city)}
              </span>
            )}

            <span>Member since {formatDate(owner.createdAt)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Initials from an already-resolved display name. */
function initialsFor(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const first = words.at(0)?.at(0) ?? "";
  const last = words.length >= 2 ? (words.at(-1)?.at(0) ?? "") : "";

  return `${first}${last}`.toUpperCase() || "?";
}

export { OwnerCard };
