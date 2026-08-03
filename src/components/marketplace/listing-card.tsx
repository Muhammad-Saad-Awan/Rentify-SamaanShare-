import { ImageOffIcon, MapPinIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { HighlightText } from "@/components/shared/highlight-text";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatPKRPerDay } from "@/lib/utils/currency";
import { CONDITION_LABELS, formatCity } from "@/lib/utils/listing";

import type { ListingCardData } from "@/lib/queries/listings";

interface ListingCardProps {
  listing: ListingCardData;
  /**
   * Active search term, highlighted in the title and excerpt.
   *
   * `null` on the homepage and category pages, which do not search - the card then
   * renders its text unchanged.
   */
  searchTerm?: string | null;
  /**
   * Whether the card links to its detail page.
   *
   * Off by default because `/listings/[id]` does not exist yet - it arrives with
   * Phase 3. A card linking to a 404 is worse than one that does not link, and
   * the same reasoning already governs the disabled "New listing" button on the
   * dashboard. Flip this on with the detail route, do not add a second card.
   */
  linkToDetail?: boolean;
  /**
   * Set on the first few cards above the fold. Next only honours `priority` on
   * a handful of images per page, so the grid passes it selectively rather than
   * every card claiming it.
   */
  priority?: boolean;
}

/**
 * A single listing in the browse grid.
 *
 * Presentation only - it receives `ListingCardData` and never queries. That
 * projection is a deliberately narrow slice of `Listing` (no `description`), so
 * a grid of twelve cards does not ship twelve bodies of prose to the client.
 */
function ListingCard({
  listing,
  searchTerm = null,
  linkToDetail = false,
  priority = false,
}: ListingCardProps) {
  const body = (
    <Card className="h-full gap-0 pt-0 transition-shadow hover:shadow-md">
      <div className="bg-muted relative aspect-4/3 w-full overflow-hidden rounded-t-xl">
        {listing.imageUrl ? (
          <Image
            src={listing.imageUrl}
            // The title *is* the description of the image here. An empty alt
            // would hide the only identifying text from a screen reader when
            // the card is read as a link.
            alt={listing.title}
            fill
            // Mirrors the grid's breakpoints below, so the browser does not
            // download a full-width image for a quarter-width slot.
            sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
            priority={priority}
          />
        ) : (
          <div
            className="text-muted-foreground flex h-full items-center justify-center"
            // Decorative: the absence of a photo is not information a screen
            // reader user needs announced.
            aria-hidden="true"
          >
            <ImageOffIcon className="size-6" />
          </div>
        )}

        <Badge
          variant="secondary"
          className="absolute top-2 right-2 shadow-sm backdrop-blur"
        >
          {CONDITION_LABELS[listing.condition]}
        </Badge>
      </div>

      <div className="flex flex-col gap-2 px-(--card-spacing) pt-(--card-spacing)">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs">
            {listing.categoryName}
          </p>

          {/*
            `line-clamp-2` with a fixed two-line box: titles vary in length and
            an unclamped one pushes the price row down, leaving a grid of cards
            whose prices no longer line up across a row.
          */}
          <h3 className="font-heading line-clamp-2 min-h-10 text-sm leading-snug font-medium">
            <HighlightText text={listing.title} term={searchTerm} />
          </h3>
        </div>

        {/*
          Only present when the term was found in the description, so this row
          appears exactly on the cards where the title alone does not explain the
          match - and never shifts the layout of an unsearched grid.
        */}
        {listing.descriptionSnippet && (
          <p className="text-muted-foreground line-clamp-2 text-xs">
            <HighlightText
              text={listing.descriptionSnippet}
              term={searchTerm}
            />
          </p>
        )}

        <div className="flex items-end justify-between gap-2">
          <span className="font-heading text-sm font-semibold tracking-tight">
            {formatPKRPerDay(listing.pricePerDay)}
          </span>

          <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
            <MapPinIcon className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{formatCity(listing.city)}</span>
          </span>
        </div>
      </div>
    </Card>
  );

  if (!linkToDetail) {
    return body;
  }

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="focus-visible:ring-ring rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      {body}
    </Link>
  );
}

export { ListingCard };
