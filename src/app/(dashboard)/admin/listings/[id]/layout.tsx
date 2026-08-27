import { notFound } from "next/navigation";

import { getAdminListingDetail } from "@/lib/queries/admin-listings";

import type { ReactNode } from "react";

interface AdminListingLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

/**
 * Validates the listing id before anything streams.
 *
 * The same invariant as `admin/users/[id]`, `listings/[id]` and `categories/[slug]`: a Suspense
 * boundary would flush the shell with a 200 before the page ran, and a `notFound()` after that point
 * renders the 404 page over a response that already said the record exists. A layout runs above that
 * boundary, so throwing here happens before the first byte.
 *
 * Which is also why `admin/listings/page.tsx` uses an in-page `<Suspense>` rather than a route-level
 * `loading.tsx`: a skeleton in the `listings` segment would cover this layout too, and the 404 would
 * be soft again. That exact mistake shipped once here, in `admin/loading.tsx`.
 *
 * Unlike every public listing read, this deliberately does NOT filter through
 * `VISIBLE_LISTING_WHERE`. A paused, rejected, removed or suspended-owner listing is precisely the
 * one an administrator needs to open - hiding them would make moderation unable to review its own
 * outcomes, and would make a removal irreversible.
 */
export default async function AdminListingLayout({
  children,
  params,
}: AdminListingLayoutProps) {
  const { id } = await params;
  const listing = await getAdminListingDetail(id);

  if (!listing) {
    notFound();
  }

  return children;
}
