import { UserSearchIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Member not found",
  robots: { index: false, follow: false },
};

/**
 * Rendered when `notFound()` fires for an unknown member id in the admin area.
 *
 * Lives in the `users` segment rather than inside `[id]`: the id is validated in `[id]/layout.tsx`,
 * and a `notFound()` thrown from a layout bubbles *past* that layout's own segment to the boundary
 * above it, so a `not-found.tsx` sitting alongside it would never be reached.
 */
export default function AdminUserNotFound() {
  return (
    <EmptyState
      icon={UserSearchIcon}
      title="No such member"
      description="That id does not match any account. It may have been mistyped, or the row may predate this database."
      action={
        <Button size="sm" render={<Link href="/admin/users" />}>
          Back to members
        </Button>
      }
    />
  );
}
