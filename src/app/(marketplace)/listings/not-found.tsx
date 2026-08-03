import { PackageSearchIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Listing not found",
};

/**
 * Rendered when `notFound()` fires for an unknown or unpublished listing.
 *
 * Lives in the `listings` segment rather than inside `[id]`, deliberately. The id is
 * validated in `[id]/layout.tsx` - see the note there on why it cannot be the page -
 * and a `notFound()` thrown from a layout bubbles *past* that layout's own segment to
 * the boundary above it, so a `not-found.tsx` sitting alongside it is never reached.
 *
 * The wording covers both cases without confirming which: a listing that never
 * existed and one whose owner has paused or removed it both land here, and saying
 * "this was paused" would leak the state of someone else's unpublished record.
 */
export default function ListingNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16 lg:px-6">
      <EmptyState
        icon={PackageSearchIcon}
        title="This listing is not available"
        description="It may have been removed by its owner, or the link may be out of date. Plenty of other items are still available to rent."
        action={
          <>
            <Button size="sm" render={<Link href="/listings" />}>
              Browse all listings
            </Button>
            <Button variant="outline" size="sm" render={<Link href="/" />}>
              Back to home
            </Button>
          </>
        }
      />
    </div>
  );
}
