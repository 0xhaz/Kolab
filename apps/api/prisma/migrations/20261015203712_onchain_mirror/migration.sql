-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('pending', 'passed', 'failed');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "budget" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "endAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "graceSecs" INTEGER NOT NULL,
ADD COLUMN     "holdbackBps" INTEGER NOT NULL,
ADD COLUMN     "maxCreators" INTEGER NOT NULL,
ADD COLUMN     "mint" TEXT NOT NULL,
ADD COLUMN     "onchainId" BIGSERIAL NOT NULL,
ADD COLUMN     "perSaleAmount" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "programId" TEXT NOT NULL,
ADD COLUMN     "requiresShipping" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewWindowSecs" INTEGER NOT NULL,
ADD COLUMN     "shippingWindowSecs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slotsJson" JSONB NOT NULL,
ADD COLUMN     "startAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "totalFees" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "totalFunded" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "totalRefunded" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "totalReleased" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "earnedTotal" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "salesAccrued" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "shippedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Slot" ADD COLUMN     "checks" "CheckStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "dueOffsetSecs" INTEGER NOT NULL,
ADD COLUMN     "holdback" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "lastTx" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_onchainId_key" ON "Campaign"("onchainId");

