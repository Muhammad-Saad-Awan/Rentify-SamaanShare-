import { PackageSearchIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Listing not found",
};

/**
 * Shown when an owner opens a listing that is not theirs, or does not exist.
 *
 * Lives in the `listings` segment rather than inside `[id]`, deliberately. The ownership
 * check runs in `[id]/layout.tsx` - see the note there on why it cannot be the page - and a
 * `notFound()` thrown from a layout bubbles *past* that layout's own segment to the boundary
 * above it, so a `not-found.tsx` sitting alongside it is never reached.
 *
 * The wording covers both cases without distinguishing them. Telling someone "this belongs
 * to another user" would confirm that the id is real, which is exactly what the shared
 * error message elsewhere avoids.
 */
export default function OwnerListingNotFound() {
  return (
    <EmptyState
      icon={PackageSearchIcon}
      title="Listing not found"
      description="This listing does not exist, or it is not one of yours. It may also have been deleted."
      action={
        <Button size="sm" render={<Link href="/dashboard/listings" />}>
          Back to my listings
        </Button>
      }
    />
  );
}
