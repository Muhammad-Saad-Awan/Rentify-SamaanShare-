import { AdminActionType, ListingStatus } from "@/generated/prisma/enums";
import { writeAdminAction } from "@/lib/admin/log";
import {
  canEditListing,
  canRemoveListing,
  canRestoreListing,
  RESTORED_LISTING_STATUS,
} from "@/lib/admin/listing-rules";

import type { Prisma } from "@/generated/prisma/client";

/**
 * The audited listing writes, in one module.
 *
 * WHY THIS IS NOT INSIDE THE ACTION FILE. `removeListing` has two callers - the listings screen and
 * `applyReportAction`'s REMOVE_LISTING branch - and the report queue got there first. Leaving the
 * second copy in the action would have meant two definitions of what removing a listing means, and
 * the one in `moderation.ts` was already the weaker of the two: it wrote no audit row at all, so a
 * removal through the queue left the Report as its only evidence and the listing row said nothing
 * but DELETED. That is the exact gap `admin_actions` was created to close for accounts, and it
 * closes here by both paths calling this.
 *
 * EVERY FUNCTION TAKES A TRANSACTION CLIENT AND WRITES ITS OWN AUDIT ROW. The change and the record
 * of who made it must land together - see the note in `log.ts`. Taking `tx` rather than `prisma` is
 * what lets `resolveReport` put the removal, the report's resolution and this row in one commit.
 *
 * EVERY FUNCTION RETURNS `{ error }` RATHER THAN THROWING when the listing has moved on. A listing
 * its owner deleted between a moderator opening the screen and pressing the button is an ordinary
 * race, and for `resolveReport` specifically, rolling the whole decision back would put the report
 * back in the queue for a decision that can never be applied.
 */

/** The columns every function here reads before it writes. */
const MODERATION_SELECT = {
  id: true,
  ownerId: true,
  status: true,
  deletedAt: true,
  title: true,
  description: true,
} as const;

interface ModerateListingInput {
  listingId: string;
  /** The administrator responsible. Never accepted from input - it comes from the session. */
  adminId: string;
  /** Recorded permanently. Required, like every other administrator action. */
  reason: string;
  /** The report this answered, when it came from the moderation queue. */
  reportId?: string | undefined;
}

/** Either it happened, or here is what to tell the moderator. */
export type ModerationOutcome = { error?: string };

/**
 * Takes a listing down. Soft delete, never a hard one.
 *
 * `status = DELETED` and `deletedAt` are written together because every visibility filter in the app
 * reads both - see decision D3 and `VISIBLE_LISTING_WHERE`. The row itself has to survive: bookings,
 * reviews and payments reference listings, and `Listing.owner` is `onDelete: Restrict`.
 *
 * THE AUDIT SUBJECT IS THE OWNER. That is what makes a pattern visible on the members screen - three
 * removals against one account is a different conversation from one - and `listingId` carries which
 * listing so the listing's own history stays readable too.
 *
 * Cloudinary assets are deliberately left alone, matching the owner's own `deleteListing`: the
 * `ListingImage` rows still reference them, so `cleanup:uploads` will not reclaim them, and a
 * restore has to be able to bring the photos back with the listing.
 */
export async function removeListing(
  tx: Prisma.TransactionClient,
  { listingId, adminId, reason, reportId }: ModerateListingInput
): Promise<ModerationOutcome> {
  const listing = await tx.listing.findUnique({
    where: { id: listingId },
    select: MODERATION_SELECT,
  });

  if (!listing) {
    return { error: "That listing was not found." };
  }

  const eligibility = canRemoveListing({
    id: listing.id,
    status: listing.status,
    isDeleted: listing.deletedAt !== null,
  });

  if (!eligibility.allowed) {
    return { error: eligibility.reason };
  }

  /**
   * Compare-and-swap on the status just read, and on `deletedAt: null`.
   *
   * The `deletedAt` clause is the one the report queue already had, for a specific reason: a listing
   * the owner removed first must not be re-stamped with a later timestamp, which would misdate when
   * it actually came down. The status clause is new and covers the other race - two moderators, or a
   * moderator and an owner pausing it - so a second removal is refused rather than writing an audit
   * row describing a transition that did not happen.
   */
  const removed = await tx.listing.updateMany({
    where: { id: listing.id, status: listing.status, deletedAt: null },
    data: { status: ListingStatus.DELETED, deletedAt: new Date() },
  });

  if (removed.count === 0) {
    return { error: "That listing had already been removed." };
  }

  await writeAdminAction(tx, {
    actorId: adminId,
    subjectId: listing.ownerId,
    type: AdminActionType.REMOVE_LISTING,
    reason,
    previousValue: listing.status,
    newValue: ListingStatus.DELETED,
    listingId: listing.id,
    ...(reportId ? { reportId } : {}),
  });

  return {};
}

/**
 * Puts a removed listing back, PAUSED.
 *
 * Not ACTIVE - see `RESTORED_LISTING_STATUS` for why republishing on the owner's behalf is the wrong
 * default. `deletedAt` is cleared in the same write, because a row with a timestamp and a live status
 * would stay invisible to every visibility filter while looking restored on this screen.
 */
export async function restoreListing(
  tx: Prisma.TransactionClient,
  { listingId, adminId, reason }: ModerateListingInput
): Promise<ModerationOutcome> {
  const listing = await tx.listing.findUnique({
    where: { id: listingId },
    select: MODERATION_SELECT,
  });

  if (!listing) {
    return { error: "That listing was not found." };
  }

  const eligibility = canRestoreListing({
    id: listing.id,
    status: listing.status,
    isDeleted: listing.deletedAt !== null,
  });

  if (!eligibility.allowed) {
    return { error: eligibility.reason };
  }

  const restored = await tx.listing.updateMany({
    // Guarded on the status just read, so a concurrent change is refused rather than overwritten.
    where: { id: listing.id, status: listing.status },
    data: { status: RESTORED_LISTING_STATUS, deletedAt: null },
  });

  if (restored.count === 0) {
    return { error: "That listing was just changed elsewhere." };
  }

  await writeAdminAction(tx, {
    actorId: adminId,
    subjectId: listing.ownerId,
    type: AdminActionType.RESTORE_LISTING,
    reason,
    previousValue: listing.status,
    newValue: RESTORED_LISTING_STATUS,
    listingId: listing.id,
  });

  return {};
}

interface EditListingInput extends ModerateListingInput {
  title: string;
  description: string;
}

/**
 * Rewrites a listing's copy. Title and description only.
 *
 * WHY THE OLD TEXT GOES IN `previousValue`. This is the one administrator action that destroys
 * information rather than changing a flag: a status is recoverable from the enum, but the sentence an
 * owner wrote is gone the moment it is overwritten. An owner disputing an edit, or a moderator
 * reviewing a colleague's, needs to be able to read what was there - so the previous title and
 * description are recorded verbatim, and the audit row is the only copy.
 *
 * A NO-OP EDIT IS REFUSED rather than recorded. Saving the form untouched would otherwise write a
 * permanent row asserting that moderation rewrote a listing, which is a false record of an
 * administrator acting on someone's account.
 */
export async function editListing(
  tx: Prisma.TransactionClient,
  { listingId, adminId, reason, title, description }: EditListingInput
): Promise<ModerationOutcome> {
  const listing = await tx.listing.findUnique({
    where: { id: listingId },
    select: MODERATION_SELECT,
  });

  if (!listing) {
    return { error: "That listing was not found." };
  }

  const eligibility = canEditListing({
    id: listing.id,
    status: listing.status,
    isDeleted: listing.deletedAt !== null,
  });

  if (!eligibility.allowed) {
    return { error: eligibility.reason };
  }

  if (listing.title === title && listing.description === description) {
    return { error: "Nothing was changed." };
  }

  const edited = await tx.listing.updateMany({
    // Guarded on the exact text just read: if the owner edited it in the meantime, this moderator is
    // about to overwrite a version they never saw, and the `previousValue` they record would be
    // wrong as well.
    where: {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      deletedAt: null,
    },
    data: { title, description },
  });

  if (edited.count === 0) {
    return {
      error: "That listing was just edited elsewhere. Please refresh.",
    };
  }

  await writeAdminAction(tx, {
    actorId: adminId,
    subjectId: listing.ownerId,
    type: AdminActionType.EDIT_LISTING,
    reason,
    // Both fields, labelled, because an entry showing only the new text cannot answer what was
    // changed - and this row is the only remaining copy of the old.
    previousValue: describeCopy(listing.title, listing.description),
    newValue: describeCopy(title, description),
    listingId: listing.id,
  });

  return {};
}

/**
 * The two edited fields as one recorded string.
 *
 * `previousValue`/`newValue` are single columns covering every action type - a UserStatus, a UserRole
 * and now a listing's copy - so a structured pair would mean a second set of columns null on every
 * other row. Labelled rather than concatenated, so the log can render it without guessing where the
 * title ended.
 */
function describeCopy(title: string, description: string): string {
  return `Title: ${title}\n\nDescription: ${description}`;
}
