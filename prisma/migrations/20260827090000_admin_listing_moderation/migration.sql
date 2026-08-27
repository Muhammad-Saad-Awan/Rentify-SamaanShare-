-- Listing moderation for the admin area. Phase 6.
--
-- Removing a listing already existed, through the report queue's REMOVE_LISTING
-- action, and it recorded nothing on the listing or its owner: the Report row was
-- the only evidence, and the listing row said nothing but DELETED - the same gap
-- the admin_actions table was created to close for accounts. A removal reached any
-- other way - a listing found while browsing, one an owner was told about by
-- email - had nowhere to be recorded at all.
--
-- WHY THE SUBJECT STAYS THE OWNER. `subjectId` is not made nullable and no second
-- polymorphic subject is introduced. "This account had two listings taken down"
-- is what a moderator needs when deciding about a person, and it is exactly what
-- an owner-subject row gives for free on the members screen. The listing is
-- additional context, not a different kind of subject.
--
-- WHY listingId IS A REAL FOREIGN KEY, unlike `reports.targetId`. A report is
-- polymorphic across user, listing and review and so cannot have one (decision
-- D4). This column is only ever a listing, so giving up the join would buy
-- nothing and cost the listing detail screen its own history.

ALTER TYPE "AdminActionType" ADD VALUE 'REMOVE_LISTING';
ALTER TYPE "AdminActionType" ADD VALUE 'RESTORE_LISTING';
ALTER TYPE "AdminActionType" ADD VALUE 'EDIT_LISTING';

-- NULL for every action on an account itself, which is all of them so far.
ALTER TABLE "admin_actions" ADD COLUMN "listingId" TEXT;

-- One listing's moderation history, newest first.
CREATE INDEX "admin_actions_listingId_createdAt_idx"
  ON "admin_actions" ("listingId", "createdAt");

-- RESTRICT, matching `subjectId` rather than `reportId`'s SET NULL. This is an
-- audit record and must outlive tidying up, and which listing was taken down is
-- the substance of the entry rather than a cross-reference that can be dropped.
-- Listings are soft-deleted (D3) and never removed, so this never fires in
-- normal operation.
ALTER TABLE "admin_actions"
  ADD CONSTRAINT "admin_actions_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "listings"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
