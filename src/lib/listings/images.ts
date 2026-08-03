import { getUploadedImages } from "@/lib/cloudinary";
import {
  ACCEPTED_IMAGE_FORMATS,
  MAX_IMAGE_BYTES,
} from "@/lib/validations/listing";

/**
 * Image verification shared by the create and update actions.
 *
 * Lives here rather than in either action file because a `"use server"` module may only
 * export async functions - so two actions cannot share a plain helper through one. That
 * constraint is worth respecting rather than working around: this is the only
 * server-side enforcement of image format and size, and the only thing that stops a
 * stored URL being something the client asserted, so create and update must not drift
 * on it.
 */

export type VerifiedImages =
  | { ok: true; images: { publicId: string; url: string }[] }
  | { ok: false; error: string };

/**
 * Confirms every public id exists in Cloudinary and returns its canonical URL.
 *
 * A public id matching the caller's folder pattern proves nothing about whether the
 * asset is really there, so this is what turns a claimed photo into a verified one. The
 * `secureUrl` it returns is Cloudinary's own, which is what gets written to the
 * database - the client's idea of the URL is never stored.
 *
 * Signed uploads cannot carry size or format limits, and the browser's checks are
 * bypassable by calling the signature action directly, so both are applied here.
 */
export async function verifyListingImages(
  publicIds: readonly string[]
): Promise<VerifiedImages> {
  const found = await getUploadedImages(publicIds);

  // Mapped over the request order, not the response: the Admin API does not promise to
  // echo ordering, and this array order IS the owner's chosen photo order.
  const resolved = publicIds.map((publicId) => found.get(publicId));

  if (resolved.some((image) => image === undefined)) {
    return {
      ok: false,
      error: "Some photos could not be found. Please re-upload them.",
    };
  }

  const images = resolved.filter(
    (image): image is NonNullable<typeof image> => image !== undefined
  );

  if (
    images.some(
      (image) => !ACCEPTED_IMAGE_FORMATS.includes(image.format as never)
    )
  ) {
    return { ok: false, error: "Photos must be JPEG, PNG or WebP." };
  }

  if (images.some((image) => image.bytes > MAX_IMAGE_BYTES)) {
    return { ok: false, error: "One of those photos is too large." };
  }

  return {
    ok: true,
    images: images.map((image) => ({
      publicId: image.publicId,
      url: image.secureUrl,
    })),
  };
}
