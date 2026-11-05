-- AlterTable
ALTER TABLE "FundingIntent" ADD COLUMN "originTxUrl" TEXT,
ADD COLUMN "bridgeTxUrl" TEXT;

-- AlterTable
ALTER TABLE "Cashout" ADD COLUMN "bridgeDepositAddress" TEXT,
ADD COLUMN "bridgeDepositMemo" TEXT,
ADD COLUMN "relayTx" TEXT;
