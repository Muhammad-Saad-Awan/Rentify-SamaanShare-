-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminActionType" ADD VALUE 'VERIFY_PAYMENT';
ALTER TYPE "AdminActionType" ADD VALUE 'REJECT_PAYMENT';
ALTER TYPE "AdminActionType" ADD VALUE 'REVERSE_PAYMENT_VERIFICATION';
ALTER TYPE "AdminActionType" ADD VALUE 'SETTLE_BOOKING';
ALTER TYPE "AdminActionType" ADD VALUE 'RECORD_REFUND';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'PENDING_VERIFICATION';
ALTER TYPE "PaymentStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "commissionRateBps" INTEGER,
ADD COLUMN     "proofHash" TEXT,
ADD COLUMN     "proofPublicId" TEXT,
ADD COLUMN     "proofUrl" TEXT,
ADD COLUMN     "refundAmount" INTEGER,
ADD COLUMN     "refundRef" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "rentalAmount" INTEGER NOT NULL,
    "commissionRateBps" INTEGER NOT NULL,
    "commissionAmount" INTEGER NOT NULL,
    "ownerRentalAmount" INTEGER NOT NULL,
    "securityDeposit" INTEGER NOT NULL,
    "damageCompensationAmount" INTEGER NOT NULL DEFAULT 0,
    "depositReturnedAmount" INTEGER NOT NULL,
    "ownerPaidAt" TIMESTAMP(3),
    "ownerPayoutRef" TEXT,
    "depositReturnedAt" TIMESTAMP(3),
    "depositReturnRef" TEXT,
    "settledById" TEXT NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "settlements_bookingId_key" ON "settlements"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_paymentId_key" ON "settlements"("paymentId");

-- CreateIndex
CREATE INDEX "settlements_settledById_idx" ON "settlements"("settledById");

-- CreateIndex
CREATE INDEX "settlements_settledAt_idx" ON "settlements"("settledAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_proofHash_key" ON "payments"("proofHash");

-- CreateIndex
CREATE INDEX "payments_status_submittedAt_idx" ON "payments"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_transactionRef_key" ON "payments"("provider", "transactionRef");

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

