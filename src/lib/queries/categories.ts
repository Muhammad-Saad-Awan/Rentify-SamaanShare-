import { unstable_cache } from "next/cache";
import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { VISIBLE_LISTING_WHERE } from "@/lib/queries/visibility";

/**
 * Read-only category queries.
 *
 * Split from `queries/listings.ts` once the homepage and the category route
 * needed the taxonomy for their own sake rather than as filter options.
 */

/** Category with its subcategories, for the browse filter sidebar. */
export interface CategoryOption {
  name: string;
  slug: string;
  subcategories: readonly { name: string; slug: string }[];
}

/** A category tile on the homepage. */
export interface FeaturedCategory {
  name: string;
  slug: string;
  /** Lucide icon name from the seed, resolved by `categoryIcon()`. */
  icon: string | null;
  /** How many listings a visitor would actually find behind the tile. */
  listingCount: number;
}

/** A category page's own content. */
export interface CategoryDetail {
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  subcategories: readonly { name: string; slug: string }[];
}

/**
 * The category tree for the filter sidebar and the listing forms.
 *
 * CACHED ACROSS REQUESTS, which is the one query here where that is unambiguously safe.
 * The taxonomy is reference data seeded from docs/DATABASE.md - names, slugs and the
 * parent/child structure - and it changes when someone edits the seed, not when inventory
 * moves. Before this it was re-read from Neon on every browse render, every category page
 * and every load of the create and edit forms, for a result that had not changed.
 *
 * Note what is deliberately NOT cached: anything with a count. `getFeaturedCategories`
 * below reads live listing counts, and serving those a few minutes stale would have a
 * category tile advertise items its page does not show.
 *
 * `unstable_cache` rather than React's `cache()`: that one memoises within a single
 * request, which does nothing for a value identical across all of them. Tagged so a future
 * taxonomy change can invalidate it explicitly, with an hour as the fallback ceiling.
 *
 * Ordered by name so option order is stable - without an `orderBy` Postgres may return rows
 * in any order, and a select whose options reshuffle between page loads is unusable.
 */
export const getCategoryOptions = unstable_cache(
  async (): Promise<CategoryOption[]> =>
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: {
        name: true,
        slug: true,
        subcategories: {
          orderBy: { name: "asc" },
          select: { name: true, slug: true },
        },
      },
    }),
  ["category-options"],
  { tags: ["taxonomy"], revalidate: 3600 }
);

/**
 * Categories for the homepage grid, each with its live listing count.
 *
 * The count is filtered to visible listings rather than taken from a bare
 * `_count`, which would include drafts, paused and soft-deleted rows. A tile
 * reading "5 items" that opens onto three is worse than showing no count.
 *
 * Empty categories are kept, not hidden. The taxonomy is fixed reference data
 * and a visitor browsing an empty category gets the "nothing here yet" empty
 * state - which is honest - whereas a grid that silently changes shape as
 * listings come and go looks broken.
 */
export async function getFeaturedCategories(): Promise<FeaturedCategory[]> {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: {
      name: true,
      slug: true,
      icon: true,
      _count: { select: { listings: { where: VISIBLE_LISTING_WHERE } } },
    },
  });

  return categories.map((category) => ({
    name: category.name,
    slug: category.slug,
    icon: category.icon,
    listingCount: category._count.listings,
  }));
}

/**
 * One category by slug, or `null` when it does not exist.
 *
 * Returns `null` rather than throwing so the route can call `notFound()` and
 * render a 404 - an unknown slug is a normal request for a page that is not
 * there, not an error condition.
 *
 * Wrapped in React's `cache()` because three things in one request need it: the
 * category layout (which validates the slug), the page, and `generateMetadata`.
 * Without memoisation that is three identical round trips to Neon per page view;
 * with it, the first call runs and the other two read its result.
 */
export const getCategoryBySlug = cache(
  async (slug: string): Promise<CategoryDetail | null> => {
    return prisma.category.findUnique({
      where: { slug },
      select: {
        name: true,
        slug: true,
        description: true,
        icon: true,
        subcategories: {
          orderBy: { name: "asc" },
          select: { name: true, slug: true },
        },
      },
    });
  }
);
