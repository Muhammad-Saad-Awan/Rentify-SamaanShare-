import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { VISIBLE_LISTING_WHERE } from "@/lib/queries/visibility";

import type { MetadataRoute } from "next";

/**
 * Sitemap for the public marketplace.
 *
 * Listings and categories are the whole discovery strategy for a marketplace, so leaving a
 * crawler to find them by following links is leaving inventory unindexed.
 *
 * Every listing URL goes through `VISIBLE_LISTING_WHERE` - the same predicate the pages use
 * - so a paused, draft, soft-deleted or suspended-owner listing is never advertised. A
 * sitemap that lists URLs which answer 404 is worse than a shorter one: it teaches the
 * crawler the file is unreliable.
 */

/**
 * Upper bound on listing entries.
 *
 * A sitemap file may hold 50,000 URLs; this stays well inside that while keeping the query
 * bounded. Splitting into an index of multiple files is the next step, and only becomes
 * necessary somewhere north of this number.
 */
const MAX_LISTING_ENTRIES = 5_000;

/**
 * Regenerated hourly rather than frozen at build time.
 *
 * Without this Next prerenders the sitemap once during the build, so every listing published
 * afterwards is invisible to crawlers until the next deploy - which for a marketplace is the
 * whole point of having one. An hour keeps it fresh without querying on every crawler hit.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = (path: string) => new URL(path, siteConfig.url).toString();

  /**
   * A database failure degrades the sitemap; it must not fail the build.
   *
   * This route is prerendered, so an unhandled rejection here aborts `next build` - and it
   * did once during this audit, from a transient Neon connection error while pages were
   * being generated in parallel. Losing a deploy because a sitemap query blinked is a bad
   * trade. On failure the static entries below are still emitted, and the next revalidation
   * an hour later picks up the rest.
   */
  let listings: { id: string; updatedAt: Date }[] = [];
  let categories: { slug: string; updatedAt: Date }[] = [];

  try {
    // Both reads are independent, so they overlap.
    [listings, categories] = await Promise.all([
      prisma.listing.findMany({
        where: VISIBLE_LISTING_WHERE,
        orderBy: { updatedAt: "desc" },
        take: MAX_LISTING_ENTRIES,
        select: { id: true, updatedAt: true },
      }),
      prisma.category.findMany({
        orderBy: { slug: "asc" },
        select: { slug: true, updatedAt: true },
      }),
    ]);
  } catch (error) {
    console.error("sitemap: falling back to static routes only", error);
  }

  return [
    {
      url: url("/"),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: url("/listings"),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    ...categories.map((category) => ({
      url: url(`/categories/${category.slug}`),
      lastModified: category.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...listings.map((listing) => ({
      url: url(`/listings/${listing.id}`),
      // `updatedAt`, not `createdAt`: an edited listing is new content to a crawler.
      lastModified: listing.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
