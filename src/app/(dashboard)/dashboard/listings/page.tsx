import { PackageIcon, PlusIcon } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Listings",
  description: "Manage the items you rent out on SamaanShare.",
};

/**
 * Owner-facing listing management. Placeholder for Phase 3.
 *
 * The "New listing" action is rendered `disabled`: `/listings/new` does not
 * exist yet, and a link to a 404 is worse than a visibly inert control. It
 * becomes a `Link` when the route lands.
 */
export default async function MyListingsPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="My Listings"
        description="Items you have published for rent."
        actions={
          <Button disabled>
            <PlusIcon />
            New listing
          </Button>
        }
      />

      <PlaceholderCard
        icon={PackageIcon}
        title="No listings yet"
        description="Creating and managing listings arrives in Phase 3. Your published items, their status and their view counts will all be shown here."
        phase="Phase 3"
      />
    </>
  );
}
