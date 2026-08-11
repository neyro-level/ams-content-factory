-- CreateEnum
CREATE TYPE "ContentProjectStatus" AS ENUM ('IDEA', 'RESEARCHING', 'DRAFT', 'FACT_CHECK', 'REVIEW', 'APPROVED', 'PRODUCTION', 'QC', 'READY', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED', 'REJECTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('REEL', 'SHORT_VIDEO', 'SOCIAL_POST', 'CAROUSEL', 'STORY', 'ARTICLE', 'CASE', 'EXPLAINER');

-- CreateEnum
CREATE TYPE "ContentVersionAuthorType" AS ENUM ('USER', 'AI', 'SYSTEM');

-- CreateTable
CREATE TABLE "content_project" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "pillarId" UUID,
    "opportunityId" UUID,
    "title" TEXT NOT NULL,
    "goal" TEXT,
    "audience" TEXT,
    "contentType" "ContentType" NOT NULL,
    "status" "ContentProjectStatus" NOT NULL DEFAULT 'IDEA',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "recipeId" TEXT,
    "targetPublishAt" TIMESTAMP(3),
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_version" (
    "id" UUID NOT NULL,
    "contentProjectId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "brief" TEXT,
    "hook" TEXT,
    "body" TEXT,
    "cta" TEXT,
    "script" TEXT,
    "notes" TEXT,
    "createdByType" "ContentVersionAuthorType" NOT NULL,
    "createdByUserId" UUID,
    "aiExecutionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_variant" (
    "id" UUID NOT NULL,
    "contentProjectId" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "title" TEXT,
    "caption" TEXT,
    "description" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cta" TEXT,
    "mediaConfiguration" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval" (
    "id" UUID NOT NULL,
    "contentProjectId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "reviewerUserId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editorial_comment" (
    "id" UUID NOT NULL,
    "contentProjectId" UUID NOT NULL,
    "authorUserId" UUID,
    "body" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "editorial_comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_project_organizationId_brandId_status_createdAt_idx" ON "content_project"("organizationId", "brandId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "content_project_opportunityId_idx" ON "content_project"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "content_version_contentProjectId_version_key" ON "content_version"("contentProjectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "platform_variant_contentProjectId_platform_key" ON "platform_variant"("contentProjectId", "platform");

-- CreateIndex
CREATE INDEX "approval_contentProjectId_createdAt_idx" ON "approval"("contentProjectId", "createdAt");

-- CreateIndex
CREATE INDEX "editorial_comment_contentProjectId_createdAt_idx" ON "editorial_comment"("contentProjectId", "createdAt");

-- AddForeignKey
ALTER TABLE "content_project" ADD CONSTRAINT "content_project_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_project" ADD CONSTRAINT "content_project_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "content_pillar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_project" ADD CONSTRAINT "content_project_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "content_opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_version" ADD CONSTRAINT "content_version_contentProjectId_fkey" FOREIGN KEY ("contentProjectId") REFERENCES "content_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_variant" ADD CONSTRAINT "platform_variant_contentProjectId_fkey" FOREIGN KEY ("contentProjectId") REFERENCES "content_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval" ADD CONSTRAINT "approval_contentProjectId_fkey" FOREIGN KEY ("contentProjectId") REFERENCES "content_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_comment" ADD CONSTRAINT "editorial_comment_contentProjectId_fkey" FOREIGN KEY ("contentProjectId") REFERENCES "content_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
