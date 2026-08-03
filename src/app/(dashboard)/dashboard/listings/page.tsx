import { PackageIcon, PlusIcon } from "lucide-react";
import Link from "next/link";

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
 * Owner-facing listing management. Still a placeholder for the management grid.
 *
 * The "New listing" action is now a real link - `/listings/new` exists, so the
 * previously-disabled button has been switched over. The listing *grid* below is still
 * scaffolding: showing an owner their own listings with status controls is the
 * remaining half of Phase 3.
 */
export default async function MyListingsPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="My Listings"
        description="Items you have published for rent."
        actions={
          <Button render={<Link href="/listings/new" />}>
            <PlusIcon />
            New listing
          </Button>
        }
      />

      <PlaceholderCard
        icon={PackageIcon}
        title="No listings yet"
        description="You can publish a listing now. Managing them here - status controls, view counts and quick edits - is the remaining part of Phase 3."
        phase="Phase 3"
      />
    </>
  );
}
