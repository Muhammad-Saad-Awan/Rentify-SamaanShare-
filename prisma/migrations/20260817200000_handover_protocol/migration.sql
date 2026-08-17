-- The handover protocol. Trust & Safety.
--
-- Payment is offline and there is no escrow, so a deposit dispute is two people
-- asserting different things about an item neither of them still has.
-- `startBooking` and `completeBooking` were each one party's unilateral click
-- with nothing recorded, so there was never anything to argue from.

-- 1. Enums.
CREATE TYPE "HandoverType" AS ENUM ('PICKUP', 'RETURN');

-- Not ItemCondition, which grades an item in the abstract for a listing. This
-- grades it against what was expected at this moment, which is the only question
-- a damage claim actually asks.
CREATE TYPE "HandoverCondition" AS ENUM ('AS_EXPECTED', 'MINOR_WEAR', 'DAMAGED');

-- PENDING is not a failure and never blocks the rental. It means nobody has
-- answered yet, which is a different fact from disagreeing.
CREATE TYPE "HandoverConfirmation" AS ENUM ('PENDING', 'AGREED', 'DISPUTED');

-- Appended, never inserted: nothing orders by NotificationType, but a reordered
-- enum would renumber the existing values in place.
ALTER TYPE "NotificationType" ADD VALUE 'HANDOVER_DISPUTED';

-- 2. The record.
CREATE TABLE "handover_records" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" "HandoverType" NOT NULL,
    "condition" "HandoverCondition" NOT NULL,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmation" "HandoverConfirmation" NOT NULL DEFAULT 'PENDING',
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handover_records_pkey" PRIMARY KEY ("id")
);

-- One record per direction. The database refuses a second pickup or return
-- rather than the application having to notice - which is what makes the record
-- sealed rather than merely uneditable by convention.
CREATE UNIQUE INDEX "handover_records_bookingId_type_key"
  ON "handover_records" ("bookingId", "type");

CREATE INDEX "handover_records_bookingId_idx" ON "handover_records" ("bookingId");
CREATE INDEX "handover_records_recordedById_idx" ON "handover_records" ("recordedById");
-- Records still awaiting an answer from the other party.
CREATE INDEX "handover_records_confirmation_idx" ON "handover_records" ("confirmation");

-- 3. Condition photos.
--
-- A table rather than a text array so `publicId` travels with the URL -
-- Cloudinary deletion needs it, exactly as listing_images does.
CREATE TABLE "handover_photos" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handover_photos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "handover_photos_publicId_key" ON "handover_photos" ("publicId");
CREATE INDEX "handover_photos_handoverId_order_idx" ON "handover_photos" ("handoverId", "order");

-- 4. Foreign keys.
--
-- The booking and both users are Restrict/SetNull rather than Cascade: a handover
-- record is evidence and must outlive tidying up, the same reasoning as
-- Payment.confirmedById. Photos cascade from their record, because a photo
-- without the record it documents is not evidence of anything.
ALTER TABLE "handover_records"
  ADD CONSTRAINT "handover_records_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "bookings"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "handover_records"
  ADD CONSTRAINT "handover_records_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "handover_records"
  ADD CONSTRAINT "handover_records_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "handover_photos"
  ADD CONSTRAINT "handover_photos_handoverId_fkey"
  FOREIGN KEY ("handoverId") REFERENCES "handover_records"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
