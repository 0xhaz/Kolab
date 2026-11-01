-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('pending', 'accepted', 'declined');

-- DropIndex
DROP INDEX "SocialAccount_platform_handle_key";

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "selective" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "CreatorProfile" ADD COLUMN     "bio" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Slot" ADD COLUMN     "autoReleased" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN     "followers" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "pitch" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'pending',
    "approvalPubkey" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "uploadId" TEXT,
    "url" TEXT,
    "caption" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Application_campaignId_status_idx" ON "Application"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Application_campaignId_creatorId_key" ON "Application"("campaignId", "creatorId");

-- CreateIndex
CREATE INDEX "PortfolioItem_userId_idx" ON "PortfolioItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_userId_platform_key" ON "SocialAccount"("userId", "platform");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

