"use server";

import { getActiveUser } from "@/lib/auth/session";
import {
  destroyImage,
  pendingUploadFolder,
  signUpload,
} from "@/lib/cloudinary";
import { checkRateLimit } from "@/lib/rate-limit";
import { MAX_IMAGES_PER_LISTING } from "@/lib/validations/listing";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { SignedUploadParams } from "@/lib/cloudinary";
import type { ActionResult } from "@/types";

/**
 * Upload credentials for the listing form.
 *
 * The browser uploads straight to Cloudinary rather than through this app, which is
 * the reason these actions exist. Ten photos routed through a Server Action would hit
 * both the configured 2MB body limit and the platform's own request cap, and would
 * spend our bandwidth relaying bytes that Cloudinary is going to store anyway. So the
 * server's only job is to hand out a signature scoped to the caller's own folder.
 *
 * The API secret stays here. What crosses to the client is a signature valid for one
 * folder and one timestamp.
 */

/**
 * Signature requests per user per minute.
 *
 * One per photo, so a full ten-image listing costs ten. Thirty leaves room for
 * retries and a second attempt at the form without letting a script mint signatures
 * in a loop - each one is a licence to write to our Cloudinary account.
 */
const SIGNATURE_RATE_LIMIT = {
  limit: MAX_IMAGES_PER_LISTING * 3,
  windowMs: 60_000,
};

/** Deletions per user per minute. Same shape of budget as issuing signatures. */
const DELETE_RATE_LIMIT = {
  limit: MAX_IMAGES_PER_LISTING * 3,
  windowMs: 60_000,
};

const CONFIG_ERROR =
  "Image uploads are not configured on this server. Please contact support.";

/**
 * Issues a signature for one upload into the caller's pending folder.
 *
 * One call per file rather than one per form: each signature carries its own
 * timestamp, and Cloudinary expires them after an hour, so a single signature reused
 * across a slow ten-photo session would start failing partway through.
 */
export async function createImageUploadSignature(): Promise<
  ActionResult<SignedUploadParams>
> {
  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(`upload-sign:${user.id}`, SIGNATURE_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      success: false,
      error: `Too many uploads at once. Try again in ${rate.retryAfterSeconds}s.`,
    };
  }

  try {
    // The folder is derived from the session, never from an argument. This action
    // takes no parameters precisely so there is nothing for a caller to tamper with -
    // the signature can only ever authorise writes to the caller's own folder.
    return {
      success: true,
      data: signUpload(pendingUploadFolder(user.id)),
    };
  } catch (error) {
    // Thrown when the credentials are missing, which is a deployment problem rather
    // than something the user can act on.
    console.error("createImageUploadSignature failed", error);

    return { success: false, error: CONFIG_ERROR };
  }
}

/**
 * Removes an image the user uploaded but has not attached to a listing.
 *
 * Ownership is proven by the folder prefix, because there is nothing else to prove it
 * with: a pending image has no database row. Rejecting any public id outside
 * `pending/{callerId}/` is what stops one user deleting another's in-progress uploads
 * by guessing - and guessing is realistic, since Cloudinary public ids are short.
 *
 * Only ever called for pending images. Images already attached to a listing are
 * deleted through the listing itself, where the database can authorise it.
 */
export async function deletePendingImage(
  publicId: string
): Promise<ActionResult> {
  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(`upload-delete:${user.id}`, DELETE_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      success: false,
      error: `Too many changes at once. Try again in ${rate.retryAfterSeconds}s.`,
    };
  }

  const folder = pendingUploadFolder(user.id);

  // `startsWith` on the folder plus a separator - not just the folder - so a
  // crafted id like `samaanshare/pending/{victimId}extra` cannot pass by sharing a
  // prefix with the caller's own folder name.
  if (typeof publicId !== "string" || !publicId.startsWith(`${folder}/`)) {
    return { success: false, error: "That image cannot be removed." };
  }

  try {
    const destroyed = await destroyImage(publicId);

    if (!destroyed) {
      return {
        success: false,
        error: "Could not remove that image. Please try again.",
      };
    }
  } catch (error) {
    console.error("deletePendingImage failed", error);

    return { success: false, error: CONFIG_ERROR };
  }

  return { success: true, data: undefined };
}
