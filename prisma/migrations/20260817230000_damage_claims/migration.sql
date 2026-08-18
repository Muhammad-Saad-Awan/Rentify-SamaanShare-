-- Damage claims. Trust & Safety.
--
-- The deposit passes directly between the two people and SamaanShare never holds
-- it, so a claim cannot move money. What it changes is the amount the platform
-- STATES is owed back: settle a claim for 15,000 of a 60,000 deposit and the
-- obligation becomes 45,000. That is what src/lib/bookings/deposit.ts already
-- exists to do, applied to a disagreement.
--
-- A REAL FOREIGN KEY TO THE BOOKING, which is the whole reason this is not
-- another ReportReason. `ITEM_DAMAGED` and `ITEM_NOT_RETURNED` are already there,
-- but a report targets a *person* through a polymorphic `targetId` with no
-- foreign key - it can reach neither the booking, nor its deposit, nor the
-- condition record written when the item came back.

-- 1. Enums.
CREATE TYPE "ClaimReason" AS ENUM (
  'DAMAGED', 'MISSING_PARTS', 'NOT_RETURNED', 'LATE_RETURN',
  'CLEANING_REQUIRED', 'OTHER'
);

-- ACCEPTED settles without an administrator - the parties agree, so there is
-- nothing for a third to decide. Silence is NOT acceptance: an unanswered claim
-- escalates to DISPUTED, because unlike a handover record a claim has a price.
CREATE TYPE "ClaimStatus" AS ENUM (
  'OPEN', 'ACCEPTED', 'DISPUTED', 'RESOLVED', 'WITHDRAWN'
);

-- Appended, never inserted: a reordered enum renumbers existing values in place.
ALTER TYPE "NotificationType" ADD VALUE 'CLAIM_FILED';
ALTER TYPE "NotificationType" ADD VALUE 'CLAIM_RESPONDED';
ALTER TYPE "NotificationType" ADD VALUE 'CLAIM_RESOLVED';

-- 2. The claim.
CREATE TABLE "damage_claims" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "claimantId" TEXT NOT NULL,
    "respondentId" TEXT NOT NULL,
    "reason" "ClaimReason" NOT NULL,
    "description" TEXT NOT NULL,
    -- Whole rupees, capped in application code at the booking's deposit. The
    -- deposit is the only obligation the platform has standing to describe.
    "amountClaimed" INTEGER NOT NULL,
    "handoverId" TEXT,
    "status" "ClaimStatus" NOT NULL DEFAULT 'OPEN',
    "respondedAt" TIMESTAMP(3),
    "responseNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    -- Null while open. "Nothing decided yet" and "decided as nothing" are
    -- different facts, and the deposit obligation differs between them.
    "amountUpheld" INTEGER,
    "filedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "damage_claims_pkey" PRIMARY KEY ("id")
);

-- One claim per booking: the owner states everything at once rather than filing
-- a second claim after the first is answered.
CREATE UNIQUE INDEX "damage_claims_bookingId_key" ON "damage_claims" ("bookingId");

CREATE INDEX "damage_claims_status_idx" ON "damage_claims" ("status");
CREATE INDEX "damage_claims_claimantId_idx" ON "damage_claims" ("claimantId");
CREATE INDEX "damage_claims_respondentId_idx" ON "damage_claims" ("respondentId");
-- The lazy escalation sweep: open claims whose response window has closed.
CREATE INDEX "damage_claims_status_filedAt_idx" ON "damage_claims" ("status", "filedAt");

-- 3. Claim photographs.
--
-- A separate table from handover_photos, not a reuse. Those are sealed to the
-- moment of handover and must never gain images taken days later, which is
-- exactly what a claim attaches. Different tables make that impossible rather
-- than merely discouraged.
CREATE TABLE "claim_photos" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    -- A claim carries the owner's photos and a reply may carry the renter's.
    -- Telling them apart is the point of this column.
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_photos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "claim_photos_publicId_key" ON "claim_photos" ("publicId");
CREATE INDEX "claim_photos_claimId_order_idx" ON "claim_photos" ("claimId", "order");
CREATE INDEX "claim_photos_uploadedById_idx" ON "claim_photos" ("uploadedById");

-- 4. Foreign keys.
--
-- The booking, both parties and the handover record are Restrict/SetNull: a
-- claim is a financial record and must outlive tidying up, the same reasoning as
-- Payment.confirmedById. Photos cascade from their claim, because a photo
-- without the claim it supports documents nothing.
ALTER TABLE "damage_claims"
  ADD CONSTRAINT "damage_claims_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "bookings"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "damage_claims"
  ADD CONSTRAINT "damage_claims_claimantId_fkey"
  FOREIGN KEY ("claimantId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "damage_claims"
  ADD CONSTRAINT "damage_claims_respondentId_fkey"
  FOREIGN KEY ("respondentId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "damage_claims"
  ADD CONSTRAINT "damage_claims_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "damage_claims"
  ADD CONSTRAINT "damage_claims_handoverId_fkey"
  FOREIGN KEY ("handoverId") REFERENCES "handover_records"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "claim_photos"
  ADD CONSTRAINT "claim_photos_claimId_fkey"
  FOREIGN KEY ("claimId") REFERENCES "damage_claims"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "claim_photos"
  ADD CONSTRAINT "claim_photos_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
