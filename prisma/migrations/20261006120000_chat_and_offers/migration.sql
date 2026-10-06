-- Chat: conversations, messages and structured offers (ROADMAP 2.5).
--
-- The generated part creates the three tables and links bookings and admin actions to them.
-- The hand-written part at the end holds the invariants Prisma cannot express, all of them about
-- money:
--
--   1. An offer's terms never change after insert. It leaves PENDING once and is then frozen.
--      An ACCEPTED offer cannot be deleted while a booking carries its terms.
--   2. A booking that names an agreed offer carries exactly that offer's terms.
--   3. A booking's terms change only by naming a newer accepted offer, and never once a payment
--      exists for it. The payment row is created at APPROVED -> PAYMENT_PENDING and verification
--      happens later, so terms lock BEFORE verification - stricter than "locked once verified",
--      and the only version where the amount a renter was told to transfer cannot move under them.
--   4. A payment's amounts never change after insert.
--
-- WHY TRIGGERS, when the codebase so far has relied on constraints and guarded writes. Every rule
-- above is also checked by the application, but each is about money two people agreed to, and
-- "the application checks it" covers only the code that exists today. A future admin tool, a data
-- fix run by hand, or a script that forgets the rule would otherwise succeed silently. These make
-- the database refuse instead, with a message starting TERMS_LOCKED that names the rule.
--
-- Prisma does not model CHECK constraints or triggers, so `migrate diff` neither creates nor drops
-- them. scripts/verify-chat.ts exercises every one against a real database.

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'OFFER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'SUPERSEDED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "AdminActionType" ADD VALUE 'VIEW_CONVERSATION';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "agreedOfferId" TEXT,
ADD COLUMN     "conversationId" TEXT;

-- AlterTable
ALTER TABLE "admin_actions" ADD COLUMN     "conversationId" TEXT;

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "renterId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renterLastReadAt" TIMESTAMP(3),
    "ownerLastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT,
    "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
    "body" TEXT,
    "offerId" TEXT,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "bookingId" TEXT,
    "proposedById" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "securityDeposit" INTEGER NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_renterId_lastMessageAt_idx" ON "conversations"("renterId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "conversations_ownerId_lastMessageAt_idx" ON "conversations"("ownerId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_listingId_renterId_key" ON "conversations"("listingId", "renterId");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_offerId_idx" ON "messages"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "messages_senderId_clientId_key" ON "messages"("senderId", "clientId");

-- CreateIndex
CREATE INDEX "offers_conversationId_status_idx" ON "offers"("conversationId", "status");

-- CreateIndex
CREATE INDEX "offers_bookingId_idx" ON "offers"("bookingId");

-- CreateIndex
CREATE INDEX "offers_proposedById_idx" ON "offers"("proposedById");

-- CreateIndex
CREATE INDEX "offers_recipientId_idx" ON "offers"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_agreedOfferId_key" ON "bookings"("agreedOfferId");

-- CreateIndex
CREATE INDEX "bookings_conversationId_idx" ON "bookings"("conversationId");

-- CreateIndex
CREATE INDEX "admin_actions_conversationId_createdAt_idx" ON "admin_actions"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_agreedOfferId_fkey" FOREIGN KEY ("agreedOfferId") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================================
-- Hand-written: chat invariants
-- ============================================================================

-- Shape checks. Cheap, and they close off nonsense rows whatever writes them.
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_renter_not_owner_check"
  CHECK ("renterId" <> "ownerId");

ALTER TABLE "messages" ADD CONSTRAINT "messages_kind_shape_check" CHECK (
     ("kind" = 'TEXT'   AND "senderId" IS NOT NULL AND "body" IS NOT NULL AND length(btrim("body")) > 0)
  OR ("kind" = 'OFFER'  AND "senderId" IS NOT NULL AND "offerId" IS NOT NULL)
  OR ("kind" = 'SYSTEM' AND "senderId" IS NULL)
);

ALTER TABLE "offers" ADD CONSTRAINT "offers_terms_check" CHECK (
      "endDate" >= "startDate"
  AND "totalPrice" > 0
  AND "securityDeposit" >= 0
  AND "proposedById" <> "recipientId"
  AND "expiresAt" > "createdAt"
);

ALTER TABLE "offers" ADD CONSTRAINT "offers_responded_check" CHECK (
  ("status" = 'PENDING') = ("respondedAt" IS NULL)
);

-- 1. Offers: terms immutable; one move out of PENDING; an accepted offer is never deleted while a
-- booking carries its terms. The app deletes neither offers nor bookings; the delete rule exists so
-- that test and demo cleanup can remove a whole rental (booking first, which cascades its offers)
-- but nothing can remove the offer out from under a booking that still names it.
CREATE FUNCTION "offers_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'ACCEPTED'
       AND EXISTS (SELECT 1 FROM "bookings" WHERE "agreedOfferId" = OLD."id") THEN
      RAISE EXCEPTION 'TERMS_LOCKED: accepted offer % carries a booking''s terms and cannot be deleted', OLD."id"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'PENDING' THEN
      RAISE EXCEPTION 'TERMS_LOCKED: an offer must be created PENDING'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW."id"              IS DISTINCT FROM OLD."id"
  OR NEW."conversationId"  IS DISTINCT FROM OLD."conversationId"
  OR NEW."bookingId"       IS DISTINCT FROM OLD."bookingId"
  OR NEW."proposedById"    IS DISTINCT FROM OLD."proposedById"
  OR NEW."recipientId"     IS DISTINCT FROM OLD."recipientId"
  OR NEW."startDate"       IS DISTINCT FROM OLD."startDate"
  OR NEW."endDate"         IS DISTINCT FROM OLD."endDate"
  OR NEW."totalPrice"      IS DISTINCT FROM OLD."totalPrice"
  OR NEW."securityDeposit" IS DISTINCT FROM OLD."securityDeposit"
  OR NEW."expiresAt"       IS DISTINCT FROM OLD."expiresAt"
  OR NEW."createdAt"       IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'TERMS_LOCKED: the terms of offer % cannot be changed', OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF OLD."status" <> 'PENDING' AND (
       NEW."status"      IS DISTINCT FROM OLD."status"
    OR NEW."respondedAt" IS DISTINCT FROM OLD."respondedAt") THEN
    RAISE EXCEPTION 'TERMS_LOCKED: offer % is already %', OLD."id", OLD."status"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "offers_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "offers"
  FOR EACH ROW EXECUTE FUNCTION "offers_guard"();

-- 2 and 3. Bookings: agreed terms match their offer; terms move only with a newly named accepted
-- offer, and never once a payment exists.
CREATE FUNCTION "bookings_terms_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  terms_changed boolean := false;
  agreed record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    terms_changed :=
         NEW."totalPrice"      IS DISTINCT FROM OLD."totalPrice"
      OR NEW."securityDeposit" IS DISTINCT FROM OLD."securityDeposit"
      OR NEW."startDate"       IS DISTINCT FROM OLD."startDate"
      OR NEW."endDate"         IS DISTINCT FROM OLD."endDate"
      OR NEW."listingId"       IS DISTINCT FROM OLD."listingId"
      OR NEW."renterId"        IS DISTINCT FROM OLD."renterId"
      OR NEW."ownerId"         IS DISTINCT FROM OLD."ownerId"
      OR NEW."agreedOfferId"   IS DISTINCT FROM OLD."agreedOfferId";

    IF OLD."paymentId" IS NOT NULL AND (
         terms_changed OR NEW."paymentId" IS DISTINCT FROM OLD."paymentId") THEN
      RAISE EXCEPTION 'TERMS_LOCKED: booking % has a payment; its terms are final', OLD."id"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD."agreedOfferId" IS NOT NULL AND NEW."agreedOfferId" IS NULL THEN
      RAISE EXCEPTION 'TERMS_LOCKED: booking % cannot drop its agreed offer', OLD."id"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF terms_changed AND NEW."agreedOfferId" IS NOT DISTINCT FROM OLD."agreedOfferId" THEN
      RAISE EXCEPTION 'TERMS_LOCKED: the terms of booking % change only through an accepted offer', OLD."id"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF NOT terms_changed THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW."agreedOfferId" IS NOT NULL THEN
    SELECT o."status", o."bookingId", o."startDate", o."endDate", o."totalPrice",
           o."securityDeposit", c."listingId", c."renterId", c."ownerId"
      INTO agreed
      FROM "offers" o
      JOIN "conversations" c ON c."id" = o."conversationId"
     WHERE o."id" = NEW."agreedOfferId";

    IF NOT FOUND OR agreed."status" <> 'ACCEPTED' THEN
      RAISE EXCEPTION 'TERMS_LOCKED: offer % is not an accepted offer', NEW."agreedOfferId"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF agreed."listingId" <> NEW."listingId"
    OR agreed."renterId"  <> NEW."renterId"
    OR agreed."ownerId"   <> NEW."ownerId"
    OR (agreed."bookingId" IS NOT NULL AND agreed."bookingId" <> NEW."id") THEN
      RAISE EXCEPTION 'TERMS_LOCKED: offer % belongs to a different rental', NEW."agreedOfferId"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF agreed."totalPrice"      <> NEW."totalPrice"
    OR agreed."securityDeposit" <> NEW."securityDeposit"
    OR agreed."startDate"       <> NEW."startDate"
    OR agreed."endDate"         <> NEW."endDate" THEN
      RAISE EXCEPTION 'TERMS_LOCKED: booking % does not carry the terms of offer %', NEW."id", NEW."agreedOfferId"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "bookings_terms_guard"
  BEFORE INSERT OR UPDATE ON "bookings"
  FOR EACH ROW EXECUTE FUNCTION "bookings_terms_guard"();

-- 4. Payments: the amounts are what was agreed and what was transferred. They never change.
CREATE FUNCTION "payments_amount_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."amount"          IS DISTINCT FROM OLD."amount"
  OR NEW."securityDeposit" IS DISTINCT FROM OLD."securityDeposit"
  OR NEW."currency"        IS DISTINCT FROM OLD."currency" THEN
    RAISE EXCEPTION 'TERMS_LOCKED: the amounts on payment % cannot be changed', OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "payments_amount_guard"
  BEFORE UPDATE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION "payments_amount_guard"();
