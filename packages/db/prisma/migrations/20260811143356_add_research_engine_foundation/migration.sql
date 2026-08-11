-- CreateEnum
CREATE TYPE "ResearchInboxStatus" AS ENUM ('NEW', 'PROCESSING', 'READY', 'REJECTED', 'ARCHIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "ResearchItemStatus" AS ENUM ('PENDING', 'READY', 'REJECTED', 'ARCHIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('UNVERIFIED', 'SUPPORTED', 'CONFLICTING', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContentOpportunityStatus" AS ENUM ('NEW', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'CONVERTED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "research_inbox_item" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "sourceUrl" TEXT,
    "checksum" TEXT NOT NULL,
    "status" "ResearchInboxStatus" NOT NULL DEFAULT 'NEW',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_inbox_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_source" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "title" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "research_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_item" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "sourceId" UUID,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "rawContentStorageKey" TEXT,
    "rawContent" TEXT,
    "contentHash" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relevanceScore" DOUBLE PRECISION,
    "noveltyScore" DOUBLE PRECISION,
    "status" "ResearchItemStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,

    CONSTRAINT "research_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_report" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "researchItemId" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "classification" TEXT,
    "relevanceScore" DOUBLE PRECISION,
    "noveltyScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_opportunity" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "pillarId" UUID,
    "title" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "whyNow" TEXT,
    "audience" TEXT,
    "commercialRelevance" TEXT,
    "relevanceScore" DOUBLE PRECISION,
    "noveltyScore" DOUBLE PRECISION,
    "evidenceScore" DOUBLE PRECISION,
    "overallScore" DOUBLE PRECISION,
    "status" "ContentOpportunityStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "contentProjectId" UUID,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" UUID NOT NULL,
    "claimId" UUID NOT NULL,
    "researchItemId" UUID,
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "excerpt" TEXT NOT NULL,
    "mediaAssetId" UUID,
    "confidence" DOUBLE PRECISION,
    "metadata" JSONB,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "research_inbox_item_organizationId_brandId_status_idx" ON "research_inbox_item"("organizationId", "brandId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "research_inbox_item_brandId_checksum_key" ON "research_inbox_item"("brandId", "checksum");

-- CreateIndex
CREATE INDEX "research_source_brandId_domain_idx" ON "research_source"("brandId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "research_source_brandId_canonicalUrl_key" ON "research_source"("brandId", "canonicalUrl");

-- CreateIndex
CREATE INDEX "research_item_brandId_status_capturedAt_idx" ON "research_item"("brandId", "status", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "research_item_brandId_contentHash_key" ON "research_item"("brandId", "contentHash");

-- CreateIndex
CREATE INDEX "research_report_brandId_createdAt_idx" ON "research_report"("brandId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "research_report_researchItemId_key" ON "research_report"("researchItemId");

-- CreateIndex
CREATE INDEX "content_opportunity_brandId_status_overallScore_idx" ON "content_opportunity"("brandId", "status", "overallScore");

-- CreateIndex
CREATE INDEX "claim_brandId_status_idx" ON "claim"("brandId", "status");

-- CreateIndex
CREATE INDEX "evidence_claimId_idx" ON "evidence"("claimId");

-- CreateIndex
CREATE INDEX "evidence_researchItemId_idx" ON "evidence"("researchItemId");

-- AddForeignKey
ALTER TABLE "research_inbox_item" ADD CONSTRAINT "research_inbox_item_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_source" ADD CONSTRAINT "research_source_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_item" ADD CONSTRAINT "research_item_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_item" ADD CONSTRAINT "research_item_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "research_source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_report" ADD CONSTRAINT "research_report_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_report" ADD CONSTRAINT "research_report_researchItemId_fkey" FOREIGN KEY ("researchItemId") REFERENCES "research_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_opportunity" ADD CONSTRAINT "content_opportunity_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim" ADD CONSTRAINT "claim_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_researchItemId_fkey" FOREIGN KEY ("researchItemId") REFERENCES "research_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
