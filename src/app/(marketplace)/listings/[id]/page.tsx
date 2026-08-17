import { CalendarClockIcon, MapPinIcon } from "lucide-react";
import { notFound } from "next/navigation";

import { BookingRequestForm } from "@/components/bookings/booking-request-form";
import { ListingBreadcrumbs } from "@/components/marketplace/listing-breadcrumbs";
import { ListingGallery } from "@/components/marketplace/listing-gallery";
import { ListingPricing } from "@/components/marketplace/listing-pricing";
import { ListingsGrid } from "@/components/marketplace/listings-grid";
import { OwnerCard } from "@/components/marketplace/owner-card";
import { SaveListingButton } from "@/components/marketplace/save-listing-button";
import { SectionHeading } from "@/components/marketplace/section-heading";
import { ReportButton } from "@/components/reports/report-button";
import { ListingReviews } from "@/components/reviews/listing-reviews";
import { ListingViewTracker } from "@/components/marketplace/listing-view-tracker";
import { ShareListing } from "@/components/marketplace/share-listing";
import { JsonLd } from "@/components/shared/json-ld";
import { Badge } from "@/components/ui/badge";
import { ReportType } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/session";
import { listingJsonLd } from "@/lib/marketplace/structured-data";
import {
  getListingDetail,
  getSimilarListings,
} from "@/lib/queries/listing-detail";
import { getOwnerReviews } from "@/lib/queries/reviews";
import { getSavedListingIds } from "@/lib/queries/saved-listings";
import { formatDate, todayInKarachi } from "@/lib/utils/date";
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
 * Still does not increment `viewCount` here, and that has not changed: a GET that mutates
 * would fire on every crawler hit, every link preview and every prefetch. Stage A5 added
 * `ListingViewTracker` instead, which records the view from an effect in the browser - so
 * only a real render by a real visitor counts. See `@/lib/listings/views`.
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

  const [similar, user, reviews] = await Promise.all([
    getSimilarListings({
      listingId: listing.id,
      categorySlug: listing.category.slug,
    }),
    getCurrentUser(),
    // What previous renters said about this owner. Joins the batch because it depends only on the
    // listing, which is already loaded.
    getOwnerReviews(listing.owner.id),
  ]);

  // Covers this listing and the similar row in one read.
  const savedListingIds = await getSavedListingIds(user?.id, [
    listing.id,
    ...similar.map((item) => item.id),
  ]);

  return (
    <>
      {/* Records the view from the browser. Skipped outright for an owner looking at their own
          listing - the action re-checks that itself, this only avoids the round trip. */}
      <ListingViewTracker
        listingId={listing.id}
        enabled={listing.owner.id !== user?.id}
      />

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

            <ListingReviews
              reviews={reviews}
              ownerName={listing.owner.name?.trim() || "this owner"}
              viewerId={user?.id ?? null}
            />
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

            <BookingRequestForm
              listingId={listing.id}
              pricePerDay={listing.pricePerDay}
              pricePerWeek={listing.pricePerWeek}
              pricePerMonth={listing.pricePerMonth}
              securityDeposit={listing.securityDeposit}
              // The market's today, resolved on the server - a device with a skewed clock
              // would otherwise offer a date the action rejects.
              today={todayInKarachi()}
              isAuthenticated={user !== null}
              isOwnListing={user?.id === listing.owner.id}
            />

            {/* Save and share sit together beneath the booking panel. */}
            <div className="flex flex-wrap items-center gap-2">
              <SaveListingButton
                listingId={listing.id}
                listingTitle={listing.title}
                isSaved={savedListingIds.has(listing.id)}
                isAuthenticated={user !== null}
              />

              <ShareListing
                listingId={listing.id}
                title={listing.title}
                pricePerDay={listing.pricePerDay}
              />
            </div>

            <OwnerCard owner={listing.owner} />

            {/*
              Reporting the listing, offered only to a signed-in visitor who does not own it.
              Beneath the owner card rather than beside Save and Share: those are things you do
              because you like a listing, and putting "Report" among them invites misclicks on the
              one control with a person on the other end of it.
            */}
            {user && user.id !== listing.owner.id && (
              <div className="flex justify-end">
                <ReportButton
                  targetType={ReportType.LISTING}
                  targetId={listing.id}
                  label="this listing"
                  className="text-muted-foreground -mr-2 h-7 px-2 text-xs"
                />
              </div>
            )}
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
