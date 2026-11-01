-- CreateTable
CREATE TABLE "Cashout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "destChain" TEXT NOT NULL,
    "destAsset" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "amountIn" BIGINT NOT NULL,
    "amountOut" TEXT NOT NULL,
    "amountOutUsd" DOUBLE PRECISION NOT NULL,
    "appFeeBps" INTEGER NOT NULL,
    "estimatedSecs" INTEGER NOT NULL,
    "depositAddress" TEXT NOT NULL,
    "depositMemo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'awaiting_signature',
    "depositTx" TEXT,
    "destinationTx" TEXT,
    "destinationExplorerUrl" TEXT,
    "failureReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cashout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cashout_userId_idx" ON "Cashout"("userId");

-- CreateIndex
CREATE INDEX "Cashout_status_idx" ON "Cashout"("status");

