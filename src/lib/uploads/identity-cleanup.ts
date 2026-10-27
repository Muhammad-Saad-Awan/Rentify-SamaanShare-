import type { ListedUpload } from "@/lib/cloudinary";

/**
 * What the identity cleanup job does with each CNIC image. Pure, so the rules are tested without
 * Cloudinary or a database - this is the one decision in the app that destroys an identity document
 * for good, and it has to be right before it is fast.
 *
 * THREE OUTCOMES.
 *
 * - KEEP: a current `IdentityDocument` points at it and its member has not been deleted. Never
 *   touched, however old - an approved CNIC from two years ago is still the evidence behind a badge.
 * - ORPHAN: nothing points at it and it is older than the cutoff. Left by a submission that was
 *   refused after the photos had uploaded, or by a replacement whose best-effort delete failed.
 * - DEPARTED: a document points at it, but its member is soft-deleted. There is nobody left to
 *   verify, and keeping a copy of their ID card protects no one.
 *
 * Anything unreferenced and NEWER than the cutoff is left alone: it may be a submission that is
 * uploading right now, and the server has not written its row yet.
 */

export interface IdentityDocumentRef {
  /** The row, so a departed member's document can be removed once its images are gone. */
  id: string;
  frontPublicId: string;
  backPublicId: string;
  userDeleted: boolean;
}

export interface IdentityCleanupPlan {
  /** Referenced by an active member's document. */
  keep: ListedUpload[];
  /** Unreferenced, but too recent to be sure it is abandoned. */
  recent: ListedUpload[];
  /** Unreferenced and older than the cutoff. */
  orphans: ListedUpload[];
  /** Belonging to a deleted member's document, with the row to remove after them. */
  departed: { document: IdentityDocumentRef; uploads: ListedUpload[] }[];
}

export function planIdentityCleanup(
  uploads: readonly ListedUpload[],
  documents: readonly IdentityDocumentRef[],
  cutoff: Date
): IdentityCleanupPlan {
  const owner = new Map<string, IdentityDocumentRef>();

  for (const document of documents) {
    owner.set(document.frontPublicId, document);
    owner.set(document.backPublicId, document);
  }

  const plan: IdentityCleanupPlan = {
    keep: [],
    recent: [],
    orphans: [],
    departed: [],
  };
  const departedByDocument = new Map<
    string,
    { document: IdentityDocumentRef; uploads: ListedUpload[] }
  >();

  for (const upload of uploads) {
    const document = owner.get(upload.publicId);

    if (document && !document.userDeleted) {
      plan.keep.push(upload);
    } else if (document) {
      const entry = departedByDocument.get(document.id) ?? {
        document,
        uploads: [],
      };
      entry.uploads.push(upload);
      departedByDocument.set(document.id, entry);
    } else if (upload.createdAt < cutoff) {
      plan.orphans.push(upload);
    } else {
      plan.recent.push(upload);
    }
  }

  /**
   * A deleted member's document is listed even when Cloudinary no longer has its images - a
   * previous run may have destroyed them and then failed to remove the row. The row still holds a
   * CNIC number, so it is still worth removing.
   */
  for (const document of documents) {
    if (document.userDeleted && !departedByDocument.has(document.id)) {
      departedByDocument.set(document.id, { document, uploads: [] });
    }
  }

  plan.departed = [...departedByDocument.values()];

  return plan;
}
