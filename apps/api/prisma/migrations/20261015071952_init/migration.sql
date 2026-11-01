-- CreateEnum
CREATE TYPE "Role" AS ENUM ('brand', 'creator', 'admin');

-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('per_post', 'monthly', 'per_sale', 'ugc');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'active', 'cancelling', 'closed');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('awaiting_shipment', 'in_transit', 'active', 'not_received', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "SlotKind" AS ENUM ('post', 'ugc');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('open', 'submitted', 'approved', 'rejected', 'released', 'holdback_released', 'missed', 'holdback_forfeited');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "privyId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'creator',
    "displayName" TEXT,
    "email" TEXT,
    "walletPubkey" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "country" TEXT,
    "niches" TEXT[],
    "languages" TEXT[],
    "formats" TEXT[],
    "rateCardJson" JSONB,
    "usageRightsJson" JSONB,

    CONSTRAINT "CreatorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT,
    "category" TEXT,
    "shipsTo" TEXT[],

    CONSTRAINT "BrandProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "onchainPubkey" TEXT,
    "brandId" TEXT NOT NULL,
    "type" "CampaignType" NOT NULL,
    "title" TEXT NOT NULL,
    "briefMd" TEXT NOT NULL DEFAULT '',
    "rulesJson" JSONB,
    "shipsTo" TEXT[],
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "onchainPubkey" TEXT,
    "campaignId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'awaiting_shipment',
    "voucherCode" TEXT,
    "shippingAddressSealed" BYTEA,
    "trackingRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Slot" (
    "id" TEXT NOT NULL,
    "onchainPubkey" TEXT,
    "enrollmentId" TEXT NOT NULL,
    "periodIndex" INTEGER NOT NULL DEFAULT 0,
    "idx" INTEGER NOT NULL,
    "kind" "SlotKind" NOT NULL,
    "dueAt" TIMESTAMP(3),
    "amount" BIGINT NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'open',

    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "url" TEXT,
    "fileKey" TEXT,
    "contentHash" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckResult" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "checkType" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "detailsJson" JSONB,
    "attestedTx" TEXT,

    CONSTRAINT "CheckResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "orderRef" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "recordedTx" TEXT,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedSignature" (
    "signature" TEXT NOT NULL,
    "slot" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedSignature_pkey" PRIMARY KEY ("signature")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_privyId_key" ON "User"("privyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_walletPubkey_key" ON "User"("walletPubkey");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_platform_handle_key" ON "SocialAccount"("platform", "handle");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorProfile_userId_key" ON "CreatorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandProfile_userId_key" ON "BrandProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_onchainPubkey_key" ON "Campaign"("onchainPubkey");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_onchainPubkey_key" ON "Enrollment"("onchainPubkey");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_voucherCode_key" ON "Enrollment"("voucherCode");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_campaignId_creatorId_key" ON "Enrollment"("campaignId", "creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_onchainPubkey_key" ON "Slot"("onchainPubkey");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_enrollmentId_periodIndex_idx_key" ON "Slot"("enrollmentId", "periodIndex", "idx");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_orderRef_key" ON "Sale"("orderRef");

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorProfile" ADD CONSTRAINT "CreatorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandProfile" ADD CONSTRAINT "BrandProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckResult" ADD CONSTRAINT "CheckResult_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
