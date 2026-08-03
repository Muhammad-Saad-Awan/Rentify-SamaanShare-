import { CalendarDaysIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { EditListingForm } from "@/components/listings/edit-listing-form";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { getCategoryOptions } from "@/lib/queries/categories";
import { getOwnerListingDetail } from "@/lib/queries/owner-listings";

import type { Metadata } from "next";

interface EditListingPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Metadata for the edit screen.
 *
 * No `robots` entry needed: the whole `(dashboard)` group sits behind `PROTECTED_PREFIXES`,
 * so a crawler gets a login redirect rather than a page.
 */
export async function generateMetadata({
  params,
}: EditListingPageProps): Promise<Metadata> {
  const user = await requireUser();
  const { id } = await params;
  const listing = await getOwnerListingDetail(id, user.id);

  return { title: listing ? `Edit ${listing.title}` : "Listing not found" };
}

/**
 * Edit one of the owner's own listings.
 *
 * LIVES UNDER `/dashboard/listings/[id]/edit`, not `/listings/[id]/edit` as docs/TODO.md
 * sketches, and the reason is structural rather than cosmetic. The public `[id]` segment has
 * a layout that resolves the listing through `getListingDetail`, which filters on
 * `VISIBLE_LISTING_WHERE` - so a *paused* or *draft* listing 404s there. An owner editing a
 * paused listing is the normal case, so the owner routes cannot sit inside that gate. The
 * dashboard shell is also the right chrome for management.
 *
 * `getOwnerListingDetail` scopes by owner and returns `null` for both "no such listing" and
 * "not yours", so this route cannot become an existence oracle for other people's ids.
 */
export default async function EditListingPage({
  params,
}: EditListingPageProps) {
  const user = await requireUser();
  const { id } = await params;

  // Sequential: no point loading the taxonomy for a listing the user cannot edit.
  const listing = await getOwnerListingDetail(id, user.id);

  if (!listing) {
    notFound();
  }

  const categories = await getCategoryOptions();

  return (
    <>
      <PageHeader
        title="Edit listing"
        description="Changes go live as soon as you save."
        actions={
          <Button
            variant="outline"
            render={
              <Link href={`/dashboard/listings/${listing.id}/availability`} />
            }
          >
            <CalendarDaysIcon />
            Availability
          </Button>
        }
      />

      <EditListingForm listing={listing} categories={categories} />
    </>
  );
}
