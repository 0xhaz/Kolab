-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "coverUploadId" TEXT,
ADD COLUMN     "kitColors" TEXT[],
ADD COLUMN     "kitNotes" TEXT,
ADD COLUMN     "kitReady" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kitRightsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BrandAsset" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandAsset_campaignId_idx" ON "BrandAsset"("campaignId");

-- AddForeignKey
ALTER TABLE "BrandAsset" ADD CONSTRAINT "BrandAsset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

