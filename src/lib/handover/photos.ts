import { getUploadedImages, pendingUploadFolder } from "@/lib/cloudinary";

/**
 * Turning submitted photo ids into rows that can be trusted.
 *
 * TWO CHECKS, AND BOTH ARE LOAD-BEARING.
 *
 * 1. OWNERSHIP, from the folder. A signed upload can only ever write into the caller's own
 *    `samaanshare/pending/{userId}` folder, so an id outside it was not uploaded by this person.
 *    Matched against the folder plus a separator rather than the folder alone - a crafted id like
 *    `samaanshare/pending/{victimId}extra` shares a prefix with `samaanshare/pending/{victimId}` and
 *    would otherwise pass. Same guard, same reasoning, as `deletePendingImage`.
 *
 * 2. EXISTENCE AND THE URL, from Cloudinary's Admin API. The URL written to the database is the one
 *    Cloudinary returns for that id, never one the client sent. `listingImagePublicIdSchema` records
 *    why: accepting a URL alongside an id let a crafted submission pair its own id with *any*
 *    Cloudinary URL, including another user's photo.
 *
 * That second point matters more here than on a listing. A handover photo is evidence in a deposit
 * dispute; one that actually belonged to someone else would be evidence of nothing while looking
 * exactly like proof.
 *
 * DELIBERATELY NOT CALLED INSIDE A TRANSACTION. This makes an outbound HTTP request, and holding a
 * database connection across it is what produced the P2028 timeouts Stage A4 removed. Callers
 * resolve first, then write.
 */

export interface ResolvedHandoverPhoto {
  publicId: string;
  /** Cloudinary's own secure URL, derived rather than accepted. */
  url: string;
  order: number;
}

export type PhotoResolution =
  { ok: true; photos: ResolvedHandoverPhoto[] } | { ok: false; error: string };

/**
 * Verifies ownership and resolves each id to its real URL.
 *
 * Order is taken from the submitted array, so the sequence the person chose while standing at the
 * door survives - "the third photo" is how they will refer to it later.
 */
export async function resolveHandoverPhotos(
  userId: string,
  publicIds: readonly string[]
): Promise<PhotoResolution> {
  if (publicIds.length === 0) {
    return { ok: true, photos: [] };
  }

  const folder = `${pendingUploadFolder(userId)}/`;

  if (!publicIds.every((id) => id.startsWith(folder))) {
    /**
     * One message for "not yours" and "not a real id".
     *
     * Distinguishing them would confirm to a caller probing ids that some particular asset exists
     * and belongs to somebody else.
     */
    return { ok: false, error: "Those photos could not be attached." };
  }

  const found = await getUploadedImages(publicIds);

  if (found.size !== publicIds.length) {
    return { ok: false, error: "Those photos could not be attached." };
  }

  const photos: ResolvedHandoverPhoto[] = [];

  for (const [index, publicId] of publicIds.entries()) {
    const image = found.get(publicId);

    if (!image) {
      return { ok: false, error: "Those photos could not be attached." };
    }

    photos.push({ publicId, url: image.secureUrl, order: index });
  }

  return { ok: true, photos };
}
