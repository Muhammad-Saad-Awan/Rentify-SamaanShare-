-- Moderator removal of a review. Trust & Safety.
--
-- Soft, because a removed review is the evidence for the report that removed it
-- and for any appeal against that decision. Deleting the row would leave a
-- resolution note asserting what was said with nothing to check it against.
--
-- Deliberately NOT modelled as `publishedAt = NULL`: that state means "withheld
-- pending the counterpart", and the lazy release sweep would republish the review
-- as soon as its window closed. Removal needs a state of its own.
ALTER TABLE "reviews" ADD COLUMN "removedAt" TIMESTAMP(3);

-- Public review lists and both rating aggregates now read live reviews only, and
-- every one of those queries is already scoped to a single reviewee.
CREATE INDEX "reviews_revieweeId_removedAt_idx" ON "reviews" ("revieweeId", "removedAt");
