import { describe, expect, it } from "vitest";

import { AdminActionType, ListingStatus } from "@/generated/prisma/enums";
import {
  canEditListing,
  canRemoveListing,
  canRestoreListing,
  isListingRemoved,
  RESTORED_LISTING_STATUS,
} from "@/lib/admin/listing-rules";
import { ADMIN_ACTION_LABELS } from "@/lib/admin/rules";

import type { AdminListingSubject } from "@/lib/admin/listing-rules";

/**
 * Administrator actions on listings.
 *
 * The load-bearing assertions are the two halves of D3's status/timestamp pairing - a row carrying
 * either one counts as removed - and that a restore does not republish. Everything the public sees
 * checks both columns, so a rule that read only `status` would offer to remove a listing that is
 * already gone and write an audit row for a transition that never happened.
 */

const subject = (
  overrides: Partial<AdminListingSubject> = {}
): AdminListingSubject => ({
  id: "listing-1",
  status: ListingStatus.ACTIVE,
  isDeleted: false,
  ...overrides,
});

describe("isListingRemoved", () => {
  it("is false for a live listing", () => {
    expect(isListingRemoved(subject())).toBe(false);
  });

  it("is false for a paused or draft listing - hidden is not removed", () => {
    expect(isListingRemoved(subject({ status: ListingStatus.PAUSED }))).toBe(
      false
    );
    expect(isListingRemoved(subject({ status: ListingStatus.DRAFT }))).toBe(
      false
    );
  });

  /**
   * Decision D3 pairs the DELETED status with a timestamp, and every visibility filter reads both.
   * A row with only one of them is already invisible to the public, so moderation has to agree it is
   * down rather than offering to take it down again.
   */
  it("is true when the status alone says DELETED", () => {
    expect(isListingRemoved(subject({ status: ListingStatus.DELETED }))).toBe(
      true
    );
  });

  it("is true when the timestamp alone is set", () => {
    expect(isListingRemoved(subject({ isDeleted: true }))).toBe(true);
  });
});

describe("canRemoveListing", () => {
  it("allows removing a live listing", () => {
    expect(canRemoveListing(subject()).allowed).toBe(true);
  });

  it("allows removing a paused or rejected listing", () => {
    expect(
      canRemoveListing(subject({ status: ListingStatus.PAUSED })).allowed
    ).toBe(true);
    expect(
      canRemoveListing(subject({ status: ListingStatus.REJECTED })).allowed
    ).toBe(true);
  });

  it("refuses a listing that is already removed", () => {
    const decision = canRemoveListing(subject({ isDeleted: true }));

    expect(decision.allowed).toBe(false);

    if (!decision.allowed) {
      expect(decision.reason).toContain("already been removed");
    }
  });
});

describe("canRestoreListing", () => {
  /**
   * The counterpart to a ban being irreversible. A listing is an item, not a relationship: taking
   * down the wrong one is an ordinary mistake, and without a restore path it would be permanent -
   * the owner's own screens exclude soft-deleted rows.
   */
  it("allows restoring a removed listing", () => {
    expect(
      canRestoreListing(
        subject({ status: ListingStatus.DELETED, isDeleted: true })
      ).allowed
    ).toBe(true);
  });

  it("refuses a listing that is not removed", () => {
    const decision = canRestoreListing(subject());

    expect(decision.allowed).toBe(false);

    if (!decision.allowed) {
      expect(decision.reason).toContain("has not been removed");
    }
  });

  /** PAUSED, never ACTIVE: republishing is the owner's decision, not moderation's. */
  it("restores to PAUSED rather than back onto the marketplace", () => {
    expect(RESTORED_LISTING_STATUS).toBe(ListingStatus.PAUSED);
  });
});

describe("canEditListing", () => {
  it("allows editing a live listing", () => {
    expect(canEditListing(subject()).allowed).toBe(true);
  });

  /**
   * Refused rather than silently permitted. Editing something nobody can see achieves nothing, and
   * the sequence a moderator wants - restore, then fix the wording - is two deliberate acts with two
   * audit rows rather than one edit that also quietly republishes.
   */
  it("refuses a removed listing and says to restore it first", () => {
    const decision = canEditListing(
      subject({ status: ListingStatus.DELETED, isDeleted: true })
    );

    expect(decision.allowed).toBe(false);

    if (!decision.allowed) {
      expect(decision.reason).toContain("Restore it");
    }
  });
});

describe("ADMIN_ACTION_LABELS", () => {
  /**
   * A total record over the enum, so a new action type fails `tsc` here rather than rendering
   * `REMOVE_LISTING` to an administrator. This asserts the three listing types actually landed.
   */
  it("labels the listing actions", () => {
    expect(ADMIN_ACTION_LABELS[AdminActionType.REMOVE_LISTING]).toBe(
      "Listing removed"
    );
    expect(ADMIN_ACTION_LABELS[AdminActionType.RESTORE_LISTING]).toBe(
      "Listing restored"
    );
    expect(ADMIN_ACTION_LABELS[AdminActionType.EDIT_LISTING]).toBe(
      "Listing edited"
    );
  });
});
