-- AlterTable
ALTER TABLE "handover_photos" ADD COLUMN     "hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "handover_photos_hash_key" ON "handover_photos"("hash");

