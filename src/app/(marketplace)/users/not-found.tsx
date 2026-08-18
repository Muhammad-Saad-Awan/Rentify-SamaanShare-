import { UserSearchIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Member not found",
};

/**
 * Rendered when `notFound()` fires for an unknown or no-longer-visible member.
 *
 * Lives in the `users` segment rather than inside `[id]`: the id is validated in `[id]/layout.tsx`,
 * and a `notFound()` thrown from a layout bubbles *past* that layout's own segment to the boundary
 * above it, so a `not-found.tsx` sitting alongside it would never be reached.
 *
 * The wording covers every case without confirming which. An account that never existed, one that
 * was suspended, and one that was deleted all land here, and naming the reason would publish a
 * moderation decision about a person to anyone who guessed their id.
 */
export default function ProfileNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16 lg:px-6">
      <EmptyState
        icon={UserSearchIcon}
        title="This profile is not available"
        description="The member may no longer be on SamaanShare, or the link may be out of date."
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
