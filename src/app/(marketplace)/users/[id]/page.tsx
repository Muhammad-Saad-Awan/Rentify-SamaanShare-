import { MapPinIcon, PackageIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ListingsGrid } from "@/components/marketplace/listings-grid";
import { SectionHeading } from "@/components/marketplace/section-heading";
import { ReportButton } from "@/components/reports/report-button";
import { ListingReviews } from "@/components/reviews/listing-reviews";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TrustPanel } from "@/components/trust/trust-panel";
import { ReportType, ReviewType } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/session";
import { getReceivedReviews } from "@/lib/queries/reviews";
import {
  getProfileListings,
  getPublicProfile,
} from "@/lib/queries/user-profile";
import { formatDate } from "@/lib/utils/date";
import { formatCity } from "@/lib/utils/listing";

import type { Metadata } from "next";

interface ProfilePageProps {
  params: Promise<{ id: string }>;
}

/**
 * NOINDEX, deliberately.
 *
 * Every fact on this page is already public on the member's listings - name, city, rating - so this
 * is not about secrecy. It is about aggregation: a listing page is about an item, while this
 * collects one person's whole history, location and reviews into a single document, and letting
 * search engines index that turns a marketplace profile into a searchable dossier on a named
 * individual. The page stays reachable to anyone deciding whether to rent from them, which is the
 * only audience it is for.
 */
export async function generateMetadata({
  params,
}: ProfilePageProps): Promise<Metadata> {
  const { id } = await params;
  const profile = await getPublicProfile(id);

  const name = profile?.name?.trim() || "SamaanShare member";

  return {
    title: name,
    description: `${name}'s rentals and reviews on SamaanShare.`,
    robots: { index: false, follow: false },
  };
}

/**
 * A member's public profile.
 *
 * The id is validated in `layout.tsx`, which runs before the first byte - see the note there. This
 * still handles a `null` profile, because the layout's guarantee is about *ordering*, not about
 * types, and a page that assumed non-null would be one refactor away from a crash.
 *
 * No in-page `Suspense`. The whole page is one member's record and there is nothing worth showing
 * before the rest arrives; a skeleton around a name and a rating would flash rather than help.
 */
export default async function ProfilePage({ params }: ProfilePageProps) {
  const { id } = await params;

  const [profile, viewer] = await Promise.all([
    getPublicProfile(id),
    getCurrentUser(),
  ]);

  if (!profile) {
    notFound();
  }

  const [listings, asOwner, asRenter] = await Promise.all([
    getProfileListings(profile.id),
    getReceivedReviews({
      userId: profile.id,
      type: ReviewType.RENTER_TO_OWNER,
    }),
    getReceivedReviews({
      userId: profile.id,
      type: ReviewType.OWNER_TO_RENTER,
    }),
  ]);

  const name = profile.name?.trim() || "SamaanShare member";
  const avatarSrc = profile.avatarUrl ?? profile.image;
  const isSelf = viewer?.id === profile.id;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 lg:px-6">
      <header className="flex flex-wrap items-start gap-4">
        <Avatar className="size-16 shrink-0">
          {avatarSrc && <AvatarImage src={avatarSrc} alt="" />}
          <AvatarFallback>{initialsFor(name)}</AvatarFallback>
        </Avatar>

        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-heading text-xl font-medium">{name}</h1>

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {profile.city && (
              <span className="flex items-center gap-1">
                <MapPinIcon className="size-3.5" aria-hidden="true" />
                {formatCity(profile.city)}
              </span>
            )}
            <span>Member since {formatDate(profile.memberSince)}</span>
          </div>

          {profile.bio && (
            // A string, never HTML - it is user input.
            <p className="text-muted-foreground mt-1 max-w-prose text-sm leading-relaxed whitespace-pre-line">
              {profile.bio}
            </p>
          )}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          {listings.length > 0 && (
            <section className="flex flex-col gap-5">
              <SectionHeading
                title={
                  profile.activeListings === 1
                    ? "1 item available"
                    : `${profile.activeListings} items available`
                }
                {...(profile.activeListings > listings.length
                  ? {
                      actionHref: `/listings?q=${encodeURIComponent(name)}`,
                      actionLabel: "See all",
                    }
                  : {})}
              />
              <ListingsGrid listings={listings} />
            </section>
          )}

          {/*
            Both directions, as separate sections with their own averages. This is the page the
            directional split was for: what someone is like to rent FROM and what they are like as a
            borrower are different questions, and a reader here may be asking either one.
          */}
          <ListingReviews
            reviews={asOwner}
            ownerName={name}
            viewerId={viewer?.id ?? null}
          />

          <ListingReviews
            reviews={asRenter}
            ownerName={name}
            viewerId={viewer?.id ?? null}
            heading={`What owners say about ${name} as a renter`}
          />

          {asOwner.items.length === 0 && asRenter.items.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No reviews yet. Reviews appear once both sides of a rental have
              written one, or after fourteen days.
            </p>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <TrustPanel
            trust={profile.trust}
            isVerified={profile.isVerified}
            completedRentals={profile.completedRentals}
            memberSince={profile.memberSince}
          />

          {listings.length === 0 && (
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              <PackageIcon className="size-3.5 shrink-0" aria-hidden="true" />
              No items listed right now.
            </p>
          )}

          {/* Offered to a signed-in visitor who is not looking at themselves. */}
          {viewer && !isSelf && (
            <div className="flex justify-end">
              <ReportButton
                targetType={ReportType.USER}
                targetId={profile.id}
                label="this member"
                className="text-muted-foreground -mr-2 h-7 px-2 text-xs"
              />
            </div>
          )}

          {isSelf && (
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/profile" />}
            >
              This is how others see you — edit
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Initials from an already-resolved display name. */
function initialsFor(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const first = words.at(0)?.at(0) ?? "";
  const last = words.length >= 2 ? (words.at(-1)?.at(0) ?? "") : "";

  return `${first}${last}`.toUpperCase() || "?";
}
