-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_VERIFICATION_REVERSED';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_SETTLED';
ALTER TYPE "NotificationType" ADD VALUE 'OWNER_PAID';
ALTER TYPE "NotificationType" ADD VALUE 'REFUND_RECORDED';

