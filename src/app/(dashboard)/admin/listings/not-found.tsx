import { PackageSearchIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Listing not found",
  robots: { index: false, follow: false },
};

/**
 * Rendered when `notFound()` fires for an unknown listing id in the admin area.
 *
 * Lives in the `listings` segment rather than inside `[id]`: the id is validated in `[id]/layout.tsx`,
 * and a `notFound()` thrown from a layout bubbles *past* that layout's own segment to the boundary
 * above it, so a `not-found.tsx` sitting alongside it would never be reached.
 */
export default function AdminListingNotFound() {
  return (
    <EmptyState
      icon={PackageSearchIcon}
      title="No such listing"
      description="That id does not match any listing. It may have been mistyped - note that a removed listing is still reachable here, so this is not what a soft delete looks like."
      action={
        <Button size="sm" render={<Link href="/admin/listings" />}>
          Back to listings
        </Button>
      }
    />
  );
}
