import { ListingStatus } from "@/generated/prisma/enums";

import type { AdminEligibility } from "@/lib/admin/rules";

/**
 * What an administrator may do to a listing. Pure, so all of it is testable without a database.
 *
 * THE SHAPE MIRRORS `rules.ts` ON PURPOSE - same `AdminEligibility` return, same "the panel and the
 * action ask the same question" arrangement. A button the action would refuse is a button that only
 * produces an error.
 *
 * THREE PLACES THIS DELIBERATELY DIVERGES FROM THE ACCOUNT RULES.
 *
 * 1. THERE IS NO SELF-ACTION GUARD, and no administrator exemption. `commonGuards` refuses to touch
 *    an administrator's account because a queue that can disable an administrator is a way to take
 *    the platform's controls away from it. A listing carries no such power: exempting one because of
 *    who owns it would mean an administrator's listing is the only unmoderatable listing on the
 *    platform, which is worse than the problem. `applyReportAction`'s REMOVE_LISTING has never had
 *    such a guard either, and extracting the shared removal path must not quietly add one.
 *
 * 2. REMOVAL IS REVERSIBLE, unlike a ban. A ban ends a relationship with a person and is refused
 *    from the reinstate path deliberately; a listing is an item, and taking down the wrong one is an
 *    ordinary mistake that needs an ordinary undo. Without one, a misapplied REMOVE_LISTING from the
 *    report queue would be permanent - the owner's own screens exclude soft-deleted rows, so nobody
 *    on either side could reach it again.
 *
 * 3. WHAT AN ADMINISTRATOR MAY EDIT IS NARROWER THAN WHAT AN OWNER MAY EDIT. See
 *    `ADMIN_EDITABLE_LISTING_FIELDS`.
 */

/**
 * The fields moderation may rewrite, as a sentence for the screen.
 *
 * TITLE AND DESCRIPTION, AND NOTHING ELSE. The moderation need is a listing that is legitimate but
 * says something it must not - a phone number in the description, an inflated claim in the title, an
 * adjacent item smuggled into the copy. Everything else on a listing is a commercial decision that
 * belongs to its owner: prices are what a booking is a contract over, photos are the owner's
 * evidence of the item's condition at handover, and the city and category are what the item *is*. An
 * administrator who thinks those are wrong is describing a listing that should come down, not one
 * that should be silently rewritten.
 */
export const ADMIN_EDITABLE_LISTING_FIELDS = "title and description";

/**
 * Where a restored listing lands: PAUSED, never back to ACTIVE.
 *
 * Two reasons, and the second is the one that matters. Republishing on the owner's behalf makes a
 * commercial decision for them - the item may have been sold or lent out in the weeks it was down.
 * And a listing removed while ACTIVE would otherwise go straight back onto the market the instant a
 * removal is reversed, including in the case where the reversal is itself the mistake. PAUSED puts
 * it back in the owner's hands, and PAUSED to ACTIVE is a transition they already have.
 */
export const RESTORED_LISTING_STATUS = ListingStatus.PAUSED;

/** The listing being acted on, reduced to what these rules need. */
export interface AdminListingSubject {
  id: string;
  status: ListingStatus;
  isDeleted: boolean;
}

/**
 * Whether this listing is currently removed.
 *
 * Reads BOTH the status and the timestamp, and treats either as removed. Decision D3 pairs them and
 * every visibility filter in the app checks both; a row carrying one without the other is already
 * hidden from the public, so moderation must agree that it is down rather than offering to take it
 * down again.
 */
export function isListingRemoved(subject: AdminListingSubject): boolean {
  return subject.isDeleted || subject.status === ListingStatus.DELETED;
}

/**
 * Whether this listing may be taken down.
 *
 * The only refusal is that it is already down. Note what is absent: the owner's status. A suspended
 * owner's listings are already invisible through `VISIBLE_LISTING_WHERE`, but they are not *removed*
 * - a reinstatement brings every one of them back - so a listing that has to stay down whatever
 * happens to the account still needs removing on its own.
 */
export function canRemoveListing(
  subject: AdminListingSubject
): AdminEligibility {
  if (isListingRemoved(subject)) {
    return { allowed: false, reason: "That listing has already been removed." };
  }

  return { allowed: true };
}

/**
 * Whether this listing may be put back.
 *
 * Removed listings only. There is nothing to restore otherwise, and offering it would suggest the
 * control does something.
 */
export function canRestoreListing(
  subject: AdminListingSubject
): AdminEligibility {
  if (!isListingRemoved(subject)) {
    return { allowed: false, reason: "That listing has not been removed." };
  }

  return { allowed: true };
}

/**
 * Whether this listing's copy may be rewritten.
 *
 * Refused on a removed listing rather than silently permitted. Editing something nobody can see
 * achieves nothing, and the sequence a moderator actually wants - put it back, then fix the wording
 * - is two deliberate acts with two audit rows, not one edit that also quietly republishes.
 */
export function canEditListing(subject: AdminListingSubject): AdminEligibility {
  if (isListingRemoved(subject)) {
    return {
      allowed: false,
      reason: "That listing is removed. Restore it before editing it.",
    };
  }

  return { allowed: true };
}
