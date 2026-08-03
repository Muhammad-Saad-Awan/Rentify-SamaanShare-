import { CalendarClockIcon, MapPinIcon, MessageSquareIcon } from "lucide-react";
import { notFound } from "next/navigation";

import { ListingBreadcrumbs } from "@/components/marketplace/listing-breadcrumbs";
import { ListingGallery } from "@/components/marketplace/listing-gallery";
import { ListingPricing } from "@/components/marketplace/listing-pricing";
import { ListingsGrid } from "@/components/marketplace/listings-grid";
import { OwnerCard } from "@/components/marketplace/owner-card";
import { SaveListingButton } from "@/components/marketplace/save-listing-button";
import { SectionHeading } from "@/components/marketplace/section-heading";
import { ShareListing } from "@/components/marketplace/share-listing";
import { JsonLd } from "@/components/shared/json-ld";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { listingJsonLd } from "@/lib/marketplace/structured-data";
import {
  getListingDetail,
  getSimilarListings,
} from "@/lib/queries/listing-detail";
import { getSavedListingIds } from "@/lib/queries/saved-listings";
import { formatDate } from "@/lib/utils/date";
import { CONDITION_LABELS, formatCity } from "@/lib/utils/listing";

import type { Metadata } from "next";

interface ListingPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Per-listing metadata.
 *
 * The description is the listing's own text, trimmed to roughly what a search
 * result will show - a full rental description would be truncated mid-sentence by
 * the search engine instead of by us.
 */
export async function generateMetadata({
  params,
}: ListingPageProps): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListingDetail(id);

  if (!listing) {
    return { title: "Listing not found" };
  }

  const description = truncate(listing.description, 155);
  const url = `/listings/${listing.id}`;

  return {
    title: listing.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: listing.title,
      description,
      // The cover image, so a shared link previews the item rather than the logo.
      ...(listing.images[0] ? { images: [listing.images[0].url] } : {}),
    },
  };
}

/**
 * Public listing detail page.
 *
 * The id is already validated by this segment's layout, which is what makes an
 * unknown or unpublished listing a real 404 - see the note there. The repeat call
 * below is free: `getListingDetail` is memoised per request with React `cache()`.
 *
 * Deliberately does not increment `viewCount`. A GET that mutates would fire on
 * every crawler hit and every back-button return, so view counting belongs with the
 * listing management work that actually reads the number.
 */
export default async function ListingPage({ params }: ListingPageProps) {
  const { id } = await params;
  const listing = await getListingDetail(id);

  if (!listing) {
    // Unreachable in practice - the layout has already thrown. Kept because the
    // type is nullable and narrowing it with an assertion would hide a real
    // regression if the layout check were ever removed.
    notFound();
  }

  const [similar, user] = await Promise.all([
    getSimilarListings({
      listingId: listing.id,
      categorySlug: listing.category.slug,
    }),
    getCurrentUser(),
  ]);

  // Covers this listing and the similar row in one read.
  const savedListingIds = await getSavedListingIds(user?.id, [
    listing.id,
    ...similar.map((item) => item.id),
  ]);

  return (
    <>
      <JsonLd
        data={listingJsonLd({
          id: listing.id,
          title: listing.title,
          description: listing.description,
          pricePerDay: listing.pricePerDay,
          imageUrls: listing.images.map((image) => image.url),
          category: listing.category,
          ownerName: listing.owner.name?.trim() || "SamaanShare member",
        })}
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 lg:px-6 lg:py-8">
        <ListingBreadcrumbs category={listing.category} title={listing.title} />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <ListingGallery images={listing.images} title={listing.title} />

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {CONDITION_LABELS[listing.condition]}
                </Badge>
                <Badge variant="outline">{listing.category.name}</Badge>
                {listing.subcategory && (
                  <Badge variant="outline">{listing.subcategory.name}</Badge>
                )}
              </div>

              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                {listing.title}
              </h1>

              <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="flex items-center gap-1.5">
                  <MapPinIcon className="size-4 shrink-0" aria-hidden="true" />
                  {listing.area
                    ? `${listing.area}, ${formatCity(listing.city)}`
                    : formatCity(listing.city)}
                </span>
                <span className="flex items-center gap-1.5">
                  <CalendarClockIcon
                    className="size-4 shrink-0"
                    aria-hidden="true"
                  />
                  Listed {formatDate(listing.createdAt)}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="font-heading text-base font-medium">
                About this item
              </h2>
              {/*
                `whitespace-pre-line` so the owner's paragraph breaks survive. The
                text is rendered as a string, never as HTML - it is user input.
              */}
              <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
                {listing.description}
              </p>
            </div>
          </div>

          {/*
            `lg:sticky` keeps the price and owner in view while a long description
            scrolls. `top-20` clears the 14-unit sticky site header plus a gap.
          */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
            <ListingPricing
              pricePerDay={listing.pricePerDay}
              pricePerWeek={listing.pricePerWeek}
              pricePerMonth={listing.pricePerMonth}
              securityDeposit={listing.securityDeposit}
            />

            <div className="flex flex-wrap items-center gap-2">
              {/*
                Booking arrives in Phase 4, so this is visibly inert rather than a
                link to a route that does not exist - the same choice as the
                dashboard's disabled "New listing" button.
              */}
              <Button disabled className="flex-1">
                <MessageSquareIcon />
                Contact owner
              </Button>

              <SaveListingButton
                listingId={listing.id}
                listingTitle={listing.title}
                isSaved={savedListingIds.has(listing.id)}
                isAuthenticated={user !== null}
              />
            </div>

            <ShareListing
              listingId={listing.id}
              title={listing.title}
              pricePerDay={listing.pricePerDay}
            />

            <OwnerCard owner={listing.owner} />
          </aside>
        </div>

        {/*
          Hidden when the category holds nothing else. An empty "similar" heading
          reads as a loading failure.
        */}
        {similar.length > 0 && (
          <section className="flex flex-col gap-5">
            <SectionHeading
              title={`More in ${listing.category.name}`}
              actionHref={`/categories/${listing.category.slug}`}
              actionLabel="View category"
            />

            <ListingsGrid
              listings={similar}
              savedListingIds={savedListingIds}
              isAuthenticated={user !== null}
            />
          </section>
        )}
      </div>
    </>
  );
}

/** Trims to `max` characters on a word boundary, with an ellipsis. */
function truncate(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();

  if (collapsed.length <= max) {
    return collapsed;
  }

  const cut = collapsed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");

  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max).trimEnd()}…`;
}
