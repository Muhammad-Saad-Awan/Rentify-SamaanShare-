-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "reviews_revieweeId_publishedAt_idx" ON "reviews"("revieweeId", "publishedAt");

-- CreateIndex
CREATE INDEX "reviews_publishedAt_idx" ON "reviews"("publishedAt");
