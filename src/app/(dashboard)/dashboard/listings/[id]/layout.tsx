import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { getOwnerListingDetail } from "@/lib/queries/owner-listings";

import type { ReactNode } from "react";

interface OwnerListingLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

/**
 * Verifies the listing exists and belongs to the caller, before anything streams.
 *
 * A LAYOUT, for the same reason the public `[id]` and `[slug]` routes use one: a
 * `notFound()` thrown from a *page* cannot set the status once Next has begun streaming,
 * and these routes are dynamic. Measured here - with the check in the page, opening
 * another owner's listing answered **200** with the not-found page. Nothing leaked, because
 * `getOwnerListingDetail` is owner-scoped, but a soft 404 tells a crawler a dead URL is
 * live and hides the authorization outcome from anything reading status codes. Throwing
 * from a layout happens before the first byte, so the response is a real 404.
 *
 * This only works because no `loading.tsx` sits above it - one in `dashboard/` or
 * `dashboard/listings/` would flush the shell first and reintroduce the same problem. Both
 * were converted to in-page Suspense for exactly this reason.
 *
 * `getOwnerListingDetail` is wrapped in React's `cache()`, so this check, the page and
 * `generateMetadata` share one query rather than making three.
 */
export default async function OwnerListingLayout({
  children,
  params,
}: OwnerListingLayoutProps) {
  const user = await requireUser();
  const { id } = await params;

  const listing = await getOwnerListingDetail(id, user.id);

  if (!listing) {
    // Identical for "no such listing" and "not yours" - distinguishing them would make
    // this route an existence oracle for other people's ids.
    notFound();
  }

  return children;
}
