"use server";

import { revalidatePath } from "next/cache";

import {
  editListing,
  removeListing,
  restoreListing,
} from "@/lib/admin/listing-moderation";
import { getActiveAdmin } from "@/lib/auth/session";
import { revalidateListingPaths } from "@/lib/listings/revalidate";
import { prisma } from "@/lib/prisma";
import {
  adminEditListingSchema,
  moderateListingSchema,
} from "@/lib/validations/admin";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ModerationOutcome } from "@/lib/admin/listing-moderation";
import type { ActionResult } from "@/types";

/**
 * Administrator actions on listings. Phase 6.
 *
 * THE WRITES THEMSELVES ARE IN `src/lib/admin/listing-moderation.ts`, not here, because removal has
 * a second caller: `applyReportAction`'s REMOVE_LISTING branch. That branch existed first and wrote
 * no audit row at all, so adding a standalone removal here would have created a second definition of
 * what taking a listing down means - and the older one was already the weaker. Same reasoning as
 * `src/lib/admin/rules.ts` for accounts.
 *
 * EVERY ACTION WRITES AN AUDIT ROW IN THE SAME TRANSACTION as the change it describes, with the
 * listing's OWNER as the subject. A removal has to read back on the account it belongs to: three
 * removals against one member is a different conversation from one, and that is only visible if the
 * rows land on the member.
 *
 * NOTHING HERE REDIRECTS. `getActiveAdmin` rather than `requireAdmin`, for the reason the account
 * actions give: navigating away from a Server Action would discard the reason the moderator had
 * typed, which every one of these requires.
 */

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

/**
 * Takes a listing down. Reversible, unlike a ban on an account.
 *
 * The reversibility is the point - see `canRestoreListing`. Removing the wrong listing is an ordinary
 * mistake, and without `adminRestoreListing` it would be permanent: the owner's own screens exclude
 * soft-deleted rows, so nobody on either side could reach it again.
 */
export async function adminRemoveListing(
  input: unknown
): Promise<ActionResult> {
  const parsed = moderateListingSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the request.",
    };
  }

  const { listingId, reason } = parsed.data;

  return apply(listingId, (adminId) =>
    prisma.$transaction((tx) =>
      removeListing(tx, { listingId, adminId, reason })
    )
  );
}

/** Puts a removed listing back, PAUSED rather than ACTIVE - see `RESTORED_LISTING_STATUS`. */
export async function adminRestoreListing(
  input: unknown
): Promise<ActionResult> {
  const parsed = moderateListingSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the request.",
    };
  }

  const { listingId, reason } = parsed.data;

  return apply(listingId, (adminId) =>
    prisma.$transaction((tx) =>
      restoreListing(tx, { listingId, adminId, reason })
    )
  );
}

/**
 * Rewrites a listing's title and description.
 *
 * NOT THE OWNER'S EDIT FORM WITH AN ADMIN GATE. Prices, photos, city and category are absent from
 * `adminEditListingSchema` on purpose - a booking is a contract over the price, and the photos are
 * the owner's evidence of the item's condition at handover. What moderation needs is the narrow case
 * of a legitimate listing whose copy says something it must not: a phone number in the description,
 * an inflated claim in the title. A listing whose *price* is wrong is a listing that comes down.
 *
 * The previous text is recorded in the audit row, which is the only remaining copy of it.
 */
export async function adminEditListing(input: unknown): Promise<ActionResult> {
  const parsed = adminEditListingSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
    };
  }

  const { listingId, title, description, reason } = parsed.data;

  return apply(listingId, (adminId) =>
    prisma.$transaction((tx) =>
      editListing(tx, { listingId, adminId, reason, title, description })
    )
  );
}

/**
 * The shared body: authorise, run the write, revalidate, translate the outcome.
 *
 * One path rather than three copies of the same authorization check and the same revalidation set.
 * The set is easy to under-specify from inside an individual action, and a listing that disappears
 * from browse but not from the homepage looks like a bug in the homepage.
 */
async function apply(
  listingId: string,
  write: (adminId: string) => Promise<ModerationOutcome>
): Promise<ActionResult> {
  const admin = await getActiveAdmin();

  if (!admin) {
    // One message for a signed-out caller and a signed-in non-admin, so this cannot be used to
    // discover whether an account holds the role.
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  try {
    const outcome = await write(admin.id);

    if (outcome.error) {
      return { success: false, error: outcome.error };
    }
  } catch (error) {
    console.error("admin listing action failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }

  /**
   * The public surfaces first, through the shared helper - browse, the homepage, the category pages,
   * the wishlist and the listing's own page. A removed listing that lingers in a cached browse page
   * is still rentable from it.
   */
  revalidateListingPaths(listingId);

  // And the admin screens, which are not in that helper: it is written for owner-side writes.
  revalidatePath("/admin/listings", "page");
  revalidatePath(`/admin/listings/${listingId}`, "page");
  revalidatePath("/admin/reports", "page");

  return { success: true, data: undefined };
}
