import { CategoryGrid } from "@/components/marketplace/category-grid";
import { CityShortcuts } from "@/components/marketplace/city-shortcuts";
import { CtaSection } from "@/components/marketplace/cta-section";
import { HeroSection } from "@/components/marketplace/hero-section";
import { HowItWorks } from "@/components/marketplace/how-it-works";
import { ListingsGrid } from "@/components/marketplace/listings-grid";
import { SectionHeading } from "@/components/marketplace/section-heading";
import { JsonLd } from "@/components/shared/json-ld";
import { siteConfig } from "@/config/site";
import { parseListingFilters } from "@/lib/marketplace/filters";
import {
  organizationJsonLd,
  websiteJsonLd,
} from "@/lib/marketplace/structured-data";
import { getFeaturedCategories } from "@/lib/queries/categories";
import {
  getActiveListingCountsByCity,
  getActiveListings,
} from "@/lib/queries/listings";

import type { Metadata } from "next";

/** Two rows of four on the widest grid; a partial third row looks unfinished. */
const FEATURED_LISTING_COUNT = 8;

export const metadata: Metadata = {
  // Overrides the `%s | SamaanShare` template from the root layout: the homepage
  // title should not read "Home | SamaanShare".
  title: {
    absolute: `${siteConfig.name} - Rent Anything in Pakistan`,
  },
  description:
    "Rent cameras, tools, camping gear and party equipment from people near you in Karachi, Lahore and Islamabad. List what you own and earn from it.",
  alternates: {
    // Explicit canonical so `/?utm_source=...` and other tracked variants
    // consolidate onto one URL instead of competing as duplicates.
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: siteConfig.name,
    title: `${siteConfig.name} - Rent Anything in Pakistan`,
    description:
      "Peer-to-peer rentals across Karachi, Lahore and Islamabad. Rent what you need, list what you own.",
  },
};

/**
 * Public homepage.
 *
 * Composes the marketplace's own data rather than static marketing copy: the
 * category tiles, city counts and featured listings all come from the database, so
 * the page cannot advertise a category that no longer exists or a count that does
 * not match what browse shows.
 *
 * Dynamic rather than static, because `SiteHeader` in the layout above reads the
 * session - a signed-in visitor must not be served a cached signed-out header. The
 * three queries here are indexed count and page reads, not the reason it is
 * dynamic.
 */
export default async function HomePage() {
  // Independent reads, so they overlap instead of running in series.
  const [featured, categories, cityCounts] = await Promise.all([
    getActiveListings({
      // The default state is "newest first, page 1", which is exactly what
      // "latest listings" means - so this reuses the browse query rather than
      // adding a second one that could drift from its visibility rule.
      filters: parseListingFilters({}),
      pageSize: FEATURED_LISTING_COUNT,
    }),
    getFeaturedCategories(),
    getActiveListingCountsByCity(),
  ]);

  return (
    <>
      <JsonLd data={websiteJsonLd()} />
      <JsonLd data={organizationJsonLd()} />

      <HeroSection listingCount={featured.total} />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-14 px-4 py-14 lg:px-6">
        <section className="flex flex-col gap-5">
          <SectionHeading
            title="Browse by category"
            description="Every category below comes from the live catalogue, with the number of items currently available."
            actionHref="/listings"
            actionLabel="See all listings"
          />

          <CategoryGrid categories={categories} />
        </section>

        {/*
          Hidden entirely when nothing is published. An empty state belongs on
          browse, where the visitor asked to see listings; on the homepage a
          "nothing here yet" panel just makes the marketplace look dead before
          they have looked at anything.
        */}
        {featured.items.length > 0 && (
          <section className="flex flex-col gap-5">
            <SectionHeading
              title="Latest listings"
              description="The most recently published items across every city."
              actionHref="/listings"
              actionLabel="Browse all"
            />

            <ListingsGrid listings={featured.items} />
          </section>
        )}

        <section className="flex flex-col gap-5">
          <SectionHeading
            title="Rent in your city"
            description="SamaanShare is live in three cities to start with."
          />

          <CityShortcuts counts={cityCounts} />
        </section>

        <section className="flex flex-col gap-5">
          <SectionHeading
            title="How it works"
            description="Three steps from finding an item to handing it back."
          />

          <HowItWorks />
        </section>
      </div>

      <CtaSection />
    </>
  );
}
