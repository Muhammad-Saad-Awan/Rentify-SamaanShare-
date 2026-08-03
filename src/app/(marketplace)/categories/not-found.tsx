import { CompassIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Category not found",
};

/**
 * Rendered when `notFound()` fires for an unknown category slug.
 *
 * Deliberately in the `categories` segment rather than inside `[slug]`. The slug
 * is validated in `[slug]/layout.tsx` - see the note there on why it cannot be the
 * page - and a `notFound()` thrown from a layout bubbles *past* that layout's own
 * segment to the boundary above it. A `not-found.tsx` alongside the layout is
 * never reached; this one is, and the response keeps its 404 status.
 *
 * Scoped here rather than made global so it can name what was missing and offer
 * the two useful ways onward.
 */
export default function CategoryNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16 lg:px-6">
      <EmptyState
        icon={CompassIcon}
        title="That category does not exist"
        description="The link may be out of date, or the category may have been renamed. Everything available is still one click away."
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
