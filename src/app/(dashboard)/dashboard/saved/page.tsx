import { HeartIcon } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { requireUser } from "@/lib/auth/session";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Saved Listings",
  description: "Listings you have saved for later on SamaanShare.",
};

/**
 * Wishlist. Placeholder for Phase 2.2.
 *
 * Backed by the `SavedListing` model, which already exists in the schema. Note
 * this route is `/dashboard/saved`, not the `/saved` written in TODO.md - see
 * the deviation flagged in the Phase 2.1 handover.
 */
export default async function SavedListingsPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Saved Listings"
        description="Items you have bookmarked to rent later."
      />

      <PlaceholderCard
        icon={HeartIcon}
        title="Nothing saved yet"
        description="Saving listings arrives with the marketplace browse experience. Anything you bookmark will collect here."
        phase="Phase 2.2"
      />
    </>
  );
}
