"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { deleteListing, updateListing } from "@/actions/listing-management";
import { ImageUploader } from "@/components/listings/image-uploader";
import {
  ListingBasicsFields,
  ListingLocationFields,
  ListingPricingFields,
} from "@/components/listings/listing-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  listingFormSchema,
  toCreateListingInput,
} from "@/lib/validations/listing";

import type { CategoryOption } from "@/lib/queries/categories";
import type { OwnerListingDetail } from "@/lib/queries/owner-listings";
import type { ListingFormValues } from "@/lib/validations/listing";

interface EditListingFormProps {
  listing: OwnerListingDetail;
  categories: readonly CategoryOption[];
}

/**
 * Edit form for an existing listing.
 *
 * One page rather than the create wizard's five steps. A wizard suits a first pass through
 * unfamiliar fields; editing is almost always a single targeted change - a price, a typo,
 * a photo - and making someone walk four screens to reach it would be worse. The field
 * groups themselves are shared with the wizard, so the inputs and their validation cannot
 * diverge.
 *
 * `defaultValues` are mapped from the listing by `toFormValues`, which converts numbers
 * back to the strings the form's schema expects.
 */
function EditListingForm({ listing, categories }: EditListingFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm<ListingFormValues>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: toFormValues(listing),
  });

  const { errors, isSubmitting, isDirty, isSubmitSuccessful } = form.formState;
  const images = form.watch("images");

  const busy = isSubmitting || isDeleting;

  /**
   * Warns before a reload discards unsaved edits or newly uploaded photos.
   *
   * The photos are the real cost: they are already in Cloudinary but only this page holds
   * their ids, so leaving orphans them as well as losing the edit. Armed only once
   * something is at stake.
   */
  const hasUnsavedWork = isDirty || images.length !== listing.images.length;

  useEffect(() => {
    if (!hasUnsavedWork || isSubmitSuccessful) {
      return;
    }

    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedWork, isSubmitSuccessful]);

  async function onSubmit(submitted: ListingFormValues) {
    setFormError(null);

    const result = await updateListing({
      id: listing.id,
      data: toCreateListingInput(submitted),
    });

    if (!result.success) {
      setFormError(result.error);

      return;
    }

    toast.success("Listing updated.");

    // Back to the management list rather than the public page: an owner who just edited is
    // usually working through their inventory, and a paused listing has no public page to
    // land on anyway.
    router.push("/dashboard/listings");
  }

  async function handleDelete() {
    /**
     * `window.confirm`, deliberately.
     *
     * There is no dialog primitive in this project yet, and a hand-rolled modal needs a
     * focus trap, a scroll lock and an escape handler to be usable - all of which the
     * native dialog already has, correctly, including for screen readers. Worth replacing
     * when a real AlertDialog exists; not worth blocking a destructive-action confirmation
     * on building one.
     */
    const confirmed = window.confirm(
      `Delete "${listing.title}"? It will be removed from the marketplace. This cannot be undone from here.`
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setFormError(null);

    const result = await deleteListing(listing.id);

    if (!result.success) {
      setIsDeleting(false);
      setFormError(result.error);

      return;
    }

    toast.success("Listing deleted.");
    router.push("/dashboard/listings");
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
      noValidate
    >
      {formError && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {formError}
        </div>
      )}

      <Section
        title="Basics"
        description="What the item is and the condition it is in."
      >
        <ListingBasicsFields
          form={form}
          disabled={busy}
          categories={categories}
        />
      </Section>

      <Section
        title="Pricing"
        description="What renting it costs, and the refundable deposit a renter pays up front."
      >
        <ListingPricingFields form={form} disabled={busy} />
      </Section>

      <Section
        title="Location"
        description="Roughly where the item is, so renters can judge the distance."
      >
        <ListingLocationFields form={form} disabled={busy} />
      </Section>

      <Section
        title="Photos"
        description="The first photo is the cover shown in search results."
      >
        <ImageUploader
          images={images}
          onChange={(next) =>
            form.setValue("images", next, {
              shouldValidate: true,
              // `shouldDirty` so removing a photo counts as an unsaved change and the
              // reload warning arms - `setValue` does not mark the form dirty by default.
              shouldDirty: true,
            })
          }
          error={errors.images?.message}
        />
      </Section>

      {/*
        Save first on a phone - stacked in reverse so the primary action is under the thumb and
        Delete is the furthest from it. From `sm` the row reads left to right as usual, with the
        destructive action set apart on its own side.
      */}
      <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="destructive"
          className="w-full sm:w-auto"
          onClick={() => void handleDelete()}
          disabled={busy}
        >
          {isDeleting ? (
            <>
              <Loader2Icon className="animate-spin" />
              Deleting...
            </>
          ) : (
            <>
              <Trash2Icon />
              Delete listing
            </>
          )}
        </Button>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={busy}
            render={<Link href="/dashboard/listings" />}
          >
            Cancel
          </Button>

          <Button type="submit" className="w-full sm:w-auto" disabled={busy}>
            {isSubmitting ? (
              <>
                <Loader2Icon className="animate-spin" />
                Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

interface SectionProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

/**
 * A labelled block, as a white card on the page canvas - the same shell each step of the create
 * wizard uses. `h2` under the page's `h1`, so the outline stays correct; `aria-labelledby` makes
 * each one a named region a screen reader can jump between.
 */
function Section({ title, description, children }: SectionProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <Card className="gap-0">
        <div className="flex flex-col gap-1 border-b px-(--card-spacing) pb-(--card-spacing)">
          <h2
            id={headingId}
            className="font-heading text-lg font-semibold tracking-tight"
          >
            {title}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {description}
          </p>
        </div>
        <div className="px-(--card-spacing) pt-6">{children}</div>
      </Card>
    </section>
  );
}

/**
 * Maps a saved listing onto the form's value shape.
 *
 * Numbers become strings because the form schema validates strings - see the note on the
 * two schemas. `null` becomes `""` rather than being omitted: React Hook Form treats an
 * undefined default as uncontrolled and warns the first time a value arrives.
 */
function toFormValues(listing: OwnerListingDetail): ListingFormValues {
  return {
    title: listing.title,
    description: listing.description,
    categorySlug: listing.categorySlug,
    subcategorySlug: listing.subcategorySlug ?? "",
    condition: listing.condition,
    pricePerDay: String(listing.pricePerDay),
    pricePerWeek:
      listing.pricePerWeek === null ? "" : String(listing.pricePerWeek),
    pricePerMonth:
      listing.pricePerMonth === null ? "" : String(listing.pricePerMonth),
    securityDeposit: String(listing.securityDeposit),
    city: listing.city,
    area: listing.area ?? "",
    images: listing.images.map((image) => ({
      publicId: image.publicId,
      url: image.url,
    })),
  };
}

export { EditListingForm };
