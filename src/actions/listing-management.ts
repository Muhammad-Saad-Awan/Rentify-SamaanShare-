"use server";

import { Prisma } from "@/generated/prisma/client";
import { ListingStatus } from "@/generated/prisma/enums";
import { pendingUploadFolder } from "@/lib/cloudinary";
import { authorizeListingOwner } from "@/lib/listings/authorize";
import { verifyListingImages } from "@/lib/listings/images";
import { revalidateListingPaths } from "@/lib/listings/revalidate";
import { resolveListingTaxonomy } from "@/lib/listings/taxonomy";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  ALLOWED_STATUS_TRANSITIONS,
  updateListingSchema,
  updateListingStatusSchema,
} from "@/lib/validations/listing";

import type { ActionResult } from "@/types";

/**
 * Owner-side listing management: edit, pause, resume, soft delete.
 *
 * Separate from `actions/listings.ts` (creation) because these three share one
 * precondition that creation does not have: the listing must already exist and belong to
 * the caller. `authorizeListingOwner` is that check, and every action here starts with
 * it - a mutation that skipped it would be editable by anyone who could guess an id.
 *
 * All of them return results rather than redirecting, for the reason the wishlist actions
 * give: these are invoked from buttons and forms that need to render the outcome.
 */

/** Edits per user per hour. Generous - fixing a typo should never be throttled. */
const UPDATE_RATE_LIMIT = { limit: 60, windowMs: 60 * 60 * 1000 };

/** Status flips and deletes per user per hour. */
const MANAGE_RATE_LIMIT = { limit: 100, windowMs: 60 * 60 * 1000 };

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

const PHOTO_REUSE_ERROR =
  "One of those photos is already used by another listing.";

/**
 * Replaces a listing's content.
 *
 * Takes the whole listing rather than a patch - see the note on `updateListingSchema`
 * for why a partial update cannot express "clear the weekly price".
 *
 * Image handling is the one substantive difference from creating. The submitted set mixes
 * photos already attached to THIS listing with freshly uploaded ones, and both sit under
 * the same `pending/{userId}/` prefix because nothing ever moves them - so the folder
 * check needs no special case. The reuse check does: it must exclude this listing's own
 * images, or every edit would reject itself.
 */
export async function updateListing(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateListingSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
    };
  }

  const auth = await authorizeListingOwner(parsed.data.id);

  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const rate = checkRateLimit(
    `update-listing:${auth.userId}`,
    UPDATE_RATE_LIMIT
  );

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many edits just now. Please try again shortly.",
    };
  }

  const data = parsed.data.data;
  const folderPrefix = `${pendingUploadFolder(auth.userId)}/`;

  if (data.images.some((publicId) => !publicId.startsWith(folderPrefix))) {
    return {
      success: false,
      error: "Those photos could not be verified. Please re-upload them.",
    };
  }

  try {
    // `listingId: { not: ... }` is what lets an edit keep its own photos. Without it the
    // first image the listing already owns would be reported as used elsewhere.
    const usedElsewhere = await prisma.listingImage.findFirst({
      where: {
        publicId: { in: data.images },
        listingId: { not: auth.listing.id },
      },
      select: { id: true },
    });

    if (usedElsewhere) {
      return { success: false, error: PHOTO_REUSE_ERROR };
    }

    const verified = await verifyListingImages(data.images);

    if (!verified.ok) {
      return { success: false, error: verified.error };
    }

    const taxonomy = await resolveListingTaxonomy(data);

    if (!taxonomy.ok) {
      return { success: false, error: taxonomy.error };
    }

    /**
     * One interactive transaction: rewrite the row, then replace its images.
     *
     * Images are deleted and recreated rather than diffed. The set is at most ten rows, a
     * diff would have to reconcile reordering as well as additions and removals, and
     * doing it in a transaction means no window exists where the listing has partial
     * photos. Deleting a row does not touch the Cloudinary asset - a photo dropped here
     * becomes unreferenced and `cleanup:uploads` reclaims it after the grace period,
     * which is safer than destroying it before the commit is known to have succeeded.
     */
    await prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: auth.listing.id },
        data: {
          title: data.title,
          description: data.description,
          categoryId: taxonomy.categoryId,
          subcategoryId: taxonomy.subcategoryId,
          condition: data.condition,
          pricePerDay: data.pricePerDay,
          pricePerWeek: data.pricePerWeek ?? null,
          pricePerMonth: data.pricePerMonth ?? null,
          securityDeposit: data.securityDeposit,
          city: data.city,
          area: data.area ?? null,
        },
      });

      await tx.listingImage.deleteMany({
        where: { listingId: auth.listing.id },
      });

      await tx.listingImage.createMany({
        data: verified.images.map((image, index) => ({
          listingId: auth.listing.id,
          url: image.url,
          publicId: image.publicId,
          order: index,
        })),
      });
    });

    revalidateListingPaths(auth.listing.id);

    return { success: true, data: { id: auth.listing.id } };
  } catch (error) {
    // The unique index on `publicId` firing means another listing claimed one of these
    // photos between the check above and the write.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { success: false, error: PHOTO_REUSE_ERROR };
    }

    console.error("updateListing failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * Pauses or resumes a listing.
 *
 * The requested status is checked twice, and both checks are load-bearing. The schema
 * restricts it to what an owner may assign at all, which stops them writing `REJECTED` or
 * `DELETED` directly; `ALLOWED_STATUS_TRANSITIONS` then checks it against the status the
 * listing is actually in, which stops them resuming a listing moderation has rejected.
 */
export async function updateListingStatus(
  input: unknown
): Promise<ActionResult<{ status: ListingStatus }>> {
  const parsed = updateListingStatusSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That change is not allowed.",
    };
  }

  const auth = await authorizeListingOwner(parsed.data.id);

  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const rate = checkRateLimit(
    `manage-listing:${auth.userId}`,
    MANAGE_RATE_LIMIT
  );

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many changes just now. Please try again shortly.",
    };
  }

  const { status } = parsed.data;

  // Already there: reported as success, not an error. A double click, or a stale page
  // whose button disagrees with the database, has still achieved what it asked for.
  if (auth.listing.status === status) {
    return { success: true, data: { status } };
  }

  if (!ALLOWED_STATUS_TRANSITIONS[auth.listing.status].includes(status)) {
    return {
      success: false,
      error: "This listing cannot be changed to that status.",
    };
  }

  try {
    await prisma.listing.update({
      where: { id: auth.listing.id },
      data: { status },
    });
  } catch (error) {
    console.error("updateListingStatus failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }

  revalidateListingPaths(auth.listing.id);

  return { success: true, data: { status } };
}

/**
 * Soft-deletes a listing.
 *
 * Never a hard delete. `Listing.owner` is `onDelete: Restrict`, and bookings, reviews and
 * payments all reference listings - decision D3 - so removing the row would either fail
 * outright or destroy history that has to survive. Status and timestamp are written
 * together because every visibility filter in the app reads both.
 *
 * Cloudinary assets are kept: a soft delete is meant to be recoverable, and the images
 * are still referenced by `ListingImage` rows, so `cleanup:uploads` leaves them alone.
 *
 * Wishlist rows are left untouched as well. `getSavedListings` filters through the shared
 * visibility rule, so the listing simply disappears from everyone's saved list without
 * needing to delete anyone else's data.
 */
export async function deleteListing(listingId: unknown): Promise<ActionResult> {
  if (typeof listingId !== "string") {
    return { success: false, error: "That listing was not found." };
  }

  const auth = await authorizeListingOwner(listingId);

  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const rate = checkRateLimit(
    `manage-listing:${auth.userId}`,
    MANAGE_RATE_LIMIT
  );

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many changes just now. Please try again shortly.",
    };
  }

  try {
    await prisma.listing.update({
      where: { id: auth.listing.id },
      data: { status: ListingStatus.DELETED, deletedAt: new Date() },
    });
  } catch (error) {
    console.error("deleteListing failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }

  revalidateListingPaths(auth.listing.id);

  return { success: true, data: undefined };
}
