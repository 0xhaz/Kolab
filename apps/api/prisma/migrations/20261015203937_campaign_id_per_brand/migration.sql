-- DropIndex
DROP INDEX "Campaign_onchainId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_brandId_onchainId_key" ON "Campaign"("brandId", "onchainId");

