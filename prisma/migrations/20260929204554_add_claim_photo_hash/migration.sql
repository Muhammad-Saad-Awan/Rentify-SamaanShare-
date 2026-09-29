-- AlterTable
ALTER TABLE "claim_photos" ADD COLUMN     "hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "claim_photos_hash_key" ON "claim_photos"("hash");

