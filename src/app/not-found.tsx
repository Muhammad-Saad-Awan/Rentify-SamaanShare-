import { CompassIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * The last-resort 404, for a URL that matches no route at all.
 *
 * WHAT THIS IS NOT. Every segment that can throw `notFound()` already has its own
 * `not-found.tsx` with wording for that case - an unknown listing, a category that does not
 * exist, a user, an admin record. Those are the interesting 404s, and they stay where they are.
 * This one catches the rest: a mistyped path, a link from somewhere that never existed here.
 *
 * WHY IT MATTERS ANYWAY. Without it Next renders its own built-in page, which carries none of
 * the site chrome - no header, no footer, no way back other than the browser's back button. A
 * visitor who mistypes a URL should still be somewhere recognisable.
 *
 * NO SHELL AROUND IT, deliberately. A root `not-found.tsx` renders inside the root layout only,
 * outside every route group, so it cannot use the marketplace header - that lives in
 * `(marketplace)/layout.tsx` and a URL matching no route belongs to no group. The links below
 * are the way out instead of a nav.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col justify-center gap-6 px-4 py-16 lg:px-6">
      <EmptyState
        icon={CompassIcon}
        title="This page does not exist"
        description="The link may be out of date, or the address may have a typo in it. Everything available to rent is on the browse page."
        action={
          <>
            <Button size="sm" render={<Link href="/listings" />}>
              Browse listings
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
