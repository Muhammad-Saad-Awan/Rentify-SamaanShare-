import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Which pending public ids the database still needs.
 *
 * THE INVERSE OF `resolveOwnedPhotos`, AND IT LIVES BESIDE IT ON PURPOSE. That function
 * is what puts a Cloudinary id into `samaanshare/pending/{userId}` and hands it to a
 * feature to store; this one is the only thing standing between those ids and
 * `scripts/cleanup-pending-uploads.ts`, which destroys everything under that prefix that
 * nobody claims. Anyone adding a third caller to `resolveOwnedPhotos` is adding a fourth
 * table here, and putting the two functions in one directory is the cheapest way to make
 * that visible - the alternative is a list buried in a script nobody reads until photos
 * start disappearing.
 *
 * WHY THIS EXISTS AS A FUNCTION AT ALL. The cleanup job originally queried `ListingImage`
 * and nothing else, because listings were the only feature with photos when it was
 * written. Handover records and damage claims arrived later, storing their ids under the
 * same prefix, and inherited a sweeper that did not know about them: every handover and
 * claim photo was eligible for deletion 24 hours after it was uploaded. Those are not
 * decorative images - a handover record is the evidence of an item's condition at pickup,
 * and a claim photo is evidence in a dispute over a deposit. They would have gone quietly,
 * and the first sign would have been an empty gallery in a disagreement about money.
 *
 * QUERIED BY THE EXACT ID SET, not by scanning the tables, so the cost tracks the number
 * of assets being considered rather than the size of the database.
 *
 * ATTACHED PHOTOS LEGITIMATELY LIVE IN THE PENDING FOLDER. Nothing ever moves them, so
 * the folder name says only where a file was uploaded - the database, and only the
 * database, decides what is garbage.
 */
export async function findReferencedPublicIds(
  prisma: PrismaClient,
  publicIds: readonly string[]
): Promise<Set<string>> {
  if (publicIds.length === 0) {
    return new Set();
  }

  const ids = [...publicIds];
  const where = { publicId: { in: ids } };
  const select = { publicId: true } as const;

  // Concurrent rather than sequential: three independent indexed reads against the same
  // id set, and the job is already waiting on Cloudinary for everything else it does.
  const [listingImages, handoverPhotos, claimPhotos] = await Promise.all([
    prisma.listingImage.findMany({ where, select }),
    prisma.handoverPhoto.findMany({ where, select }),
    prisma.claimPhoto.findMany({ where, select }),
  ]);

  return new Set(
    [...listingImages, ...handoverPhotos, ...claimPhotos].map(
      (row) => row.publicId
    )
  );
}
