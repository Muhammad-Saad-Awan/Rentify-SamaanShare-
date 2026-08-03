import { notFound } from "next/navigation";

import { getListingDetail } from "@/lib/queries/listing-detail";

import type { ReactNode } from "react";

interface ListingLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

/**
 * Validates the listing id before anything streams.
 *
 * Same reason as the category route's layout: `loading.tsx` in this segment puts the
 * page behind a Suspense boundary, so Next flushes the shell - with a 200 - as soon
 * as the fallback is ready. A `notFound()` from the page after that renders the 404
 * *page* but cannot change a status already sent, leaving a soft 404 that tells
 * crawlers a nonexistent listing is a live page.
 *
 * A layout renders above that boundary, so throwing here happens before the first
 * byte and the response is a real 404. `getListingDetail` is wrapped in React's
 * `cache()`, so this check, the page and `generateMetadata` share one query.
 *
 * Note this also covers unpublished listings, not just missing ids: the query
 * filters on ACTIVE and `deletedAt: null`, so a paused or draft listing 404s here
 * rather than rendering to whoever guessed its id.
 */
export default async function ListingLayout({
  children,
  params,
}: ListingLayoutProps) {
  const { id } = await params;
  const listing = await getListingDetail(id);

  if (!listing) {
    notFound();
  }

  return children;
}
