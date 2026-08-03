"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { ListingStatus } from "@/generated/prisma/enums";
import { getActiveUser } from "@/lib/auth/session";
import { getUploadedImages, pendingUploadFolder } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  ACCEPTED_IMAGE_FORMATS,
  createListingSchema,
  MAX_IMAGE_BYTES,
} from "@/lib/validations/listing";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { CreateListingInput } from "@/lib/validations/listing";
import type { ActionResult } from "@/types";

/**
 * Listing mutations.
 *
 * `getActiveUser()` rather than `requireUser()`, for the reason the wishlist actions
 * give: an action must return a result the form can render, not redirect out from
 * under a half-filled form. It verifies against the database, so a suspended account
 * cannot publish.
 */

/**
 * New listings per user per hour.
 *
 * A real owner adding inventory in a session might create a handful; ten an hour is
 * well beyond that and far below what a script would need to be useful. Each listing
 * is public content, so this is a spam control as much as a load one.
 */
const CREATE_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };

const UNEXPECTED_ERROR =
  "Something went wrong publishing your listing. Please try again.";

/**
 * Window in which an identical title from the same owner is treated as a resubmission.
 *
 * The form disables its submit button while in flight, so a double click cannot reach
 * here through the UI - but a Server Action is an HTTP endpoint, and a lost response,
 * an impatient retry or a replayed request all can. Without this, the second one
 * publishes a duplicate listing that the owner then has to find and delete.
 *
 * Matched on owner plus exact title rather than an idempotency key, because a key
 * would need a column and therefore a migration. Two minutes is long enough to cover a
 * retry and short enough that deliberately listing two identical items is not blocked
 * for long - and the error says exactly what happened, so it is recoverable either way.
 */
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

export async function createListing(
  input: CreateListingInput
): Promise<ActionResult<{ id: string }>> {
  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(`create-listing:${user.id}`, CREATE_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      success: false,
      error:
        "You have created several listings just now. Please try again later.",
    };
  }

  // Re-validated server-side. The browser ran the same limits, but a Server Action is
  // a public endpoint and the client-side check is a convenience, not a gate.
  const parsed = createListingSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
    };
  }

  const data = parsed.data;

  /**
   * Reject an identical listing the same owner published moments ago.
   *
   * Deliberately before the image checks: those cost a Cloudinary round trip, and a
   * resubmission should be cheap to reject.
   */
  try {
    const recentDuplicate = await prisma.listing.findFirst({
      where: {
        ownerId: user.id,
        title: data.title,
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
      select: { id: true },
    });

    if (recentDuplicate) {
      // Reported as success, with the existing listing's id. The caller's intent -
      // "publish this" - is already satisfied, and returning an error would send the
      // owner back to a form whose work is in fact saved.
      return { success: true, data: { id: recentDuplicate.id } };
    }
  } catch (error) {
    console.error("createListing duplicate check failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }

  /**
   * Every image must live in the caller's own pending folder.
   *
   * First of three checks. The folder is the only ownership proof a pending upload
   * has - there is no database row yet - so without this a crafted submission could
   * attach another user's uploaded photo: a real id, on the right host, that the
   * submitter never owned.
   */
  const folderPrefix = `${pendingUploadFolder(user.id)}/`;

  if (data.images.some((publicId) => !publicId.startsWith(folderPrefix))) {
    return {
      success: false,
      error: "Those photos could not be verified. Please re-upload them.",
    };
  }

  /**
   * No image may already belong to a listing.
   *
   * Second check. Public ids in the caller's own folder pass the prefix test forever,
   * including ones already attached to a listing they published earlier. Re-submitting
   * them would leave two listings sharing image rows, and deleting either would pull
   * the photos out from under the other.
   *
   * `ListingImage.publicId` is now `@unique`, so this is no longer the thing that
   * enforces the rule - the database is. What this still does is turn the common case
   * into a message that names the problem, instead of letting a constraint violation
   * surface as a generic failure. The race it used to leave open (two concurrent
   * submissions both passing the check, then both inserting) is closed by the
   * constraint and handled below.
   */
  try {
    const alreadyUsed = await prisma.listingImage.findFirst({
      where: { publicId: { in: data.images } },
      select: { id: true },
    });

    if (alreadyUsed) {
      return {
        success: false,
        error: "One of those photos is already used by another listing.",
      };
    }
  } catch (error) {
    console.error("createListing image reuse check failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }

  /**
   * Each image must actually exist in Cloudinary, be an image, and be a sane size.
   *
   * Third check, and the one that closes the remaining gap: a public id matching the
   * folder pattern proves nothing about whether the asset is there. This also produces
   * the URL that gets stored - Cloudinary's own `secure_url` - so the database never
   * records a location the client asserted.
   *
   * It is also the only server-side enforcement of format and size. Signed uploads
   * cannot carry those limits, and the browser's checks are bypassable by calling the
   * signature action directly, so they are applied here where it counts.
   */
  let verified: { publicId: string; url: string }[];

  try {
    const found = await getUploadedImages(data.images);

    // Mapped over `data.images` rather than over the response, so the owner's chosen
    // order survives - the Admin API does not promise to echo the request order.
    const resolved = data.images.map((publicId) => found.get(publicId));

    if (resolved.some((image) => image === undefined)) {
      return {
        success: false,
        error: "Some photos could not be found. Please re-upload them.",
      };
    }

    const images = resolved.filter(
      (image): image is NonNullable<typeof image> => image !== undefined
    );

    const badFormat = images.find(
      (image) => !ACCEPTED_IMAGE_FORMATS.includes(image.format as never)
    );

    if (badFormat) {
      return {
        success: false,
        error: "Photos must be JPEG, PNG or WebP.",
      };
    }

    const tooLarge = images.find((image) => image.bytes > MAX_IMAGE_BYTES);

    if (tooLarge) {
      return { success: false, error: "One of those photos is too large." };
    }

    verified = images.map((image) => ({
      publicId: image.publicId,
      url: image.secureUrl,
    }));
  } catch (error) {
    // Cloudinary unreachable. Publishing fails rather than storing unverified images -
    // a listing with a broken or borrowed photo is worse than a retry.
    console.error("createListing image verification failed", error);

    return {
      success: false,
      error: "Could not verify your photos just now. Please try again.",
    };
  }

  try {
    const taxonomy = await resolveTaxonomy(data);

    if (!taxonomy.ok) {
      return { success: false, error: taxonomy.error };
    }

    const listing = await prisma.listing.create({
      data: {
        ownerId: user.id,
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
        /**
         * Published immediately rather than left as the schema's DRAFT default.
         *
         * There is no moderation queue in the MVP - `REJECTED` exists in the enum for
         * the admin work in a later phase - so a listing parked in DRAFT would be
         * invisible with nothing to move it forward, and the owner has just clicked
         * "Publish". Flip this to a pending state when moderation lands.
         */
        status: ListingStatus.ACTIVE,
        // Nested create, so the listing and its images are one statement and one
        // transaction. A second query for the images could leave a listing published
        // with no photos if it failed.
        images: {
          create: verified.map((image, index) => ({
            url: image.url,
            publicId: image.publicId,
            // Array order is the owner's chosen order, set in the form.
            order: index,
          })),
        },
      },
      select: { id: true },
    });

    revalidateAffectedPaths();

    return { success: true, data: { id: listing.id } };
  } catch (error) {
    /**
     * P2002 here means the unique index on `publicId` fired - two submissions raced
     * past the pre-check above with the same photo. The loser gets the same wording as
     * the pre-check, so the outcome does not depend on which path caught it.
     */
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        success: false,
        error: "One of those photos is already used by another listing.",
      };
    }

    console.error("createListing failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

type TaxonomyResult =
  | { ok: true; categoryId: string; subcategoryId: string | null }
  | { ok: false; error: string };

/**
 * Turns the submitted slugs into ids, verifying the pair actually exists.
 *
 * The form submits slugs, so this is where they become foreign keys - and the reason
 * it is a single query on the *subcategory's parent* rather than two independent
 * lookups: a subcategory slug is unique only within its category, so checking each in
 * isolation would happily accept `category=vehicles` with `subcategory=bicycles` from
 * sports. That pair would then write a listing whose subcategory belongs to a
 * different branch of the taxonomy.
 */
async function resolveTaxonomy(
  data: CreateListingInput
): Promise<TaxonomyResult> {
  const category = await prisma.category.findUnique({
    where: { slug: data.categorySlug },
    select: {
      id: true,
      subcategories: data.subcategorySlug
        ? { where: { slug: data.subcategorySlug }, select: { id: true } }
        : false,
    },
  });

  if (!category) {
    return { ok: false, error: "That category no longer exists." };
  }

  if (!data.subcategorySlug) {
    return { ok: true, categoryId: category.id, subcategoryId: null };
  }

  const subcategory = category.subcategories?.[0];

  if (!subcategory) {
    return {
      ok: false,
      error: "That subcategory does not belong to the chosen category.",
    };
  }

  return {
    ok: true,
    categoryId: category.id,
    subcategoryId: subcategory.id,
  };
}

/**
 * Refreshes every surface a new listing appears on.
 *
 * The owner's own listing management page is included because it is the screen they
 * are most likely to visit next. `/categories/[slug]` is the route pattern rather
 * than one slug, so all category pages are covered.
 */
function revalidateAffectedPaths(): void {
  for (const path of [
    "/",
    "/listings",
    "/categories/[slug]",
    "/dashboard/listings",
  ]) {
    revalidatePath(path, "page");
  }
}
