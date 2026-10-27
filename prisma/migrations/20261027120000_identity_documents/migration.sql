-- Identity documents: a member's CNIC, front and back, for manual review.
--
-- Additive only - a new table, a new enum and new enum values. No existing row is touched.
-- The images themselves are private Cloudinary assets; this table stores their public ids, never
-- a URL. See the IdentityDocument model for why cnicNumber is unique.

-- CreateEnum
CREATE TYPE "IdentityDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "AdminActionType" ADD VALUE 'REJECT_IDENTITY_DOCUMENT';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'IDENTITY_VERIFIED';
ALTER TYPE "NotificationType" ADD VALUE 'IDENTITY_DOCUMENT_REJECTED';

-- CreateTable
CREATE TABLE "identity_documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cnicNumber" TEXT NOT NULL,
    "frontPublicId" TEXT NOT NULL,
    "frontFormat" TEXT NOT NULL,
    "backPublicId" TEXT NOT NULL,
    "backFormat" TEXT NOT NULL,
    "status" "IdentityDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "identity_documents_userId_key" ON "identity_documents"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "identity_documents_cnicNumber_key" ON "identity_documents"("cnicNumber");

-- CreateIndex
CREATE INDEX "identity_documents_status_submittedAt_idx" ON "identity_documents"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "identity_documents_reviewedById_idx" ON "identity_documents"("reviewedById");

-- AddForeignKey
ALTER TABLE "identity_documents" ADD CONSTRAINT "identity_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_documents" ADD CONSTRAINT "identity_documents_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

