-- CreateTable
CREATE TABLE "FundingIntent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "sourceChain" TEXT NOT NULL,
    "sourceAsset" TEXT NOT NULL,
    "amountIn" TEXT NOT NULL,
    "amountInUsd" DOUBLE PRECISION NOT NULL,
    "amountOut" BIGINT NOT NULL,
    "appFeeBps" INTEGER NOT NULL,
    "estimatedSecs" INTEGER NOT NULL,
    "depositAddress" TEXT NOT NULL,
    "depositMemo" TEXT,
    "refundAddress" TEXT,
    "executionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'awaiting_deposit',
    "escrowTx" TEXT,
    "failureReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FundingIntent_campaignId_idx" ON "FundingIntent"("campaignId");

-- CreateIndex
CREATE INDEX "FundingIntent_status_idx" ON "FundingIntent"("status");

-- AddForeignKey
ALTER TABLE "FundingIntent" ADD CONSTRAINT "FundingIntent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

