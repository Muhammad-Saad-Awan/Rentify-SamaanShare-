import { CalendarSearchIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Booking not found",
  robots: { index: false, follow: false },
};

/**
 * Rendered when `notFound()` fires for an unknown booking id in the admin area.
 *
 * Lives in the `bookings` segment rather than inside `[id]`: the id is validated in `[id]/layout.tsx`,
 * and a `notFound()` thrown from a layout bubbles *past* that layout's own segment to the boundary
 * above it, so a `not-found.tsx` sitting alongside it would never be reached.
 */
export default function AdminBookingNotFound() {
  return (
    <EmptyState
      icon={CalendarSearchIcon}
      title="No such booking"
      description="That id does not match any booking. Bookings are never deleted - a cancelled or expired one is still here - so this is a mistyped id rather than a removed record."
      action={
        <Button size="sm" render={<Link href="/admin/bookings" />}>
          Back to bookings
        </Button>
      }
    />
  );
}
