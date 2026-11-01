-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "onchainAt" TIMESTAMP(3);


-- Funded campaigns are already on-chain.
UPDATE "Campaign" SET "onchainAt" = "updatedAt" WHERE "status" <> 'draft';
