import { notFound } from "next/navigation";

import { getAdminBookingDetail } from "@/lib/queries/admin-bookings";

import type { ReactNode } from "react";

interface AdminBookingLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

/**
 * Validates the booking id before anything streams.
 *
 * The same invariant as `admin/listings/[id]`, `admin/users/[id]` and `listings/[id]`: a Suspense
 * boundary would flush the shell with a 200 before the page ran, and a `notFound()` after that point
 * renders the 404 page over a response that already said the record exists. A layout runs above that
 * boundary, so throwing here happens before the first byte.
 *
 * Which is also why `admin/bookings/page.tsx` uses an in-page `<Suspense>` rather than a route-level
 * `loading.tsx` - a skeleton in the `bookings` segment would cover this layout too, and the 404
 * would be soft again.
 *
 * Nothing is filtered out: a booking on a removed listing, or between two banned accounts, is
 * exactly the one a support ticket is about, and the deposit on it may still be owed to somebody.
 */
export default async function AdminBookingLayout({
  children,
  params,
}: AdminBookingLayoutProps) {
  const { id } = await params;
  const booking = await getAdminBookingDetail(id);

  if (!booking) {
    notFound();
  }

  return children;
}
