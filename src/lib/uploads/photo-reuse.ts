/**
 * Catching a photo that has been submitted as evidence before.
 *
 * THE SCAM THIS ANSWERS. A handover photo is meant to show an item's condition at one moment. The
 * cheapest way to misrepresent that is to submit a picture taken at a different moment - most
 * often the one from this rental's own pickup, showing the item unmarked, offered again at return.
 * Nothing about the image itself gives that away; what gives it away is having seen it before.
 *
 * WHY THIS IS THE CONTROL AND THE CAMERA-ONLY PICKER IS NOT. `capture` is a hint a browser may
 * ignore, a desktop browser ignores it outright, and the upload never passes through our server
 * anyway. That change removes the easy path. This one runs on the server, against a checksum
 * Cloudinary computed over the bytes it stored, and a caller cannot talk their way past it.
 *
 * WHAT IT CANNOT DO, which matters because the messages must not promise more. The checksum
 * identifies a FILE, not a scene. Re-cropping, re-encoding, a screenshot of the photo, or one
 * changed pixel all produce a different hash and sail through - as does photographing an old
 * print, or the same undamaged item on a different day. Catching those needs perceptual hashing
 * or capture-time metadata, which is a different piece of work with a different failure mode
 * (false positives on genuinely similar photos, which this has none of). What this does catch is
 * the byte-identical re-submission, which is what someone reaching for the gallery actually does.
 *
 * Pure, so every branch is assertable without Cloudinary or a database.
 */

export interface SubmittedPhoto {
  /** Cloudinary's checksum, or `null` when it sent none - see `ResolvedPhoto`. */
  hash: string | null;
}

export interface PriorPhotoUse {
  hash: string;
  /**
   * Whether the earlier use was on the booking now being recorded.
   *
   * Drives which message is given, and only that. The distinction is worth carrying because the
   * two readings are so different: on the same booking it is almost always this rental's pickup
   * photo offered again at return, which is both the common case and the one the person can fix
   * immediately.
   */
  sameBooking: boolean;
}

const DUPLICATE_IN_SUBMISSION =
  "The same photo was attached more than once. Take a separate photo of each thing you want to record.";

const REUSED_ON_THIS_RENTAL =
  "One of these photos was already used on this rental's other handover. Take a new photo of the item as it is now.";

const REUSED_ELSEWHERE =
  "One of these photos has been submitted as evidence before. Take a new photo of the item as it is now.";

/**
 * The message to refuse this set of photos with, or `null` to accept them.
 *
 * ONE MESSAGE, NOT A LIST. Naming which photo failed would be marginally more helpful and
 * meaningfully worse: the person is standing next to the item and needs to know to take a fresh
 * picture, not to audit a set of six. It also avoids answering "is THIS file already in your
 * system" one photo at a time, which is a question nobody outside needs answered.
 *
 * Photos with no hash are skipped rather than refused - see `ResolvedPhoto.hash`. That is a gap,
 * and it is the right way round: the cost of missing a duplicate is a photo an administrator may
 * still compare by eye, and the cost of refusing is a handover that cannot be recorded at all.
 *
 * NOT ATOMIC WITH THE WRITE, on purpose. Two submissions racing could both pass this; the unique
 * index on `HandoverPhoto.hash` is what actually enforces it. This exists so the ordinary case
 * reads as a sentence instead of a constraint violation - the same division of labour as the
 * `@@unique([bookingId, type])` seal in `prepareHandover`.
 */
export function photoReuseError(
  submitted: readonly SubmittedPhoto[],
  priorUses: readonly PriorPhotoUse[]
): string | null {
  const hashes = submitted
    .map((photo) => photo.hash)
    .filter((hash): hash is string => hash !== null);

  if (hashes.length === 0) {
    return null;
  }

  /**
   * The same bytes twice in one submission.
   *
   * `handoverRecordSchema` already rejects a repeated public id, which this is not: two separate
   * uploads of one file get two ids and pass that check. The unique index would refuse the second
   * row, so without this the message would be a constraint violation.
   */
  if (new Set(hashes).size !== hashes.length) {
    return DUPLICATE_IN_SUBMISSION;
  }

  const submittedHashes = new Set(hashes);
  const matches = priorUses.filter((use) => submittedHashes.has(use.hash));

  if (matches.length === 0) {
    return null;
  }

  // The more specific reading wins when both apply: it is likelier, and it is actionable.
  return matches.some((use) => use.sameBooking)
    ? REUSED_ON_THIS_RENTAL
    : REUSED_ELSEWHERE;
}
