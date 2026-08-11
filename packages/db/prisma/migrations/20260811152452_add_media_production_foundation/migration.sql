-- CreateEnum
CREATE TYPE "MediaAssetStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MediaSourceType" AS ENUM ('UPLOAD', 'AI_GENERATED', 'SCREENSHOT', 'SCREEN_RECORDING', 'PROVIDER', 'RESEARCH', 'DERIVED');

-- CreateEnum
CREATE TYPE "VideoProductionStatus" AS ENUM ('PLANNED', 'SCRIPT_READY', 'STORYBOARD_READY', 'WAITING_APPROVAL', 'GENERATING', 'COMPOSING', 'QC', 'READY', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RenderJobStatus" AS ENUM ('QUEUED', 'SUBMITTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'OUTCOME_UNKNOWN');

-- CreateTable
CREATE TABLE "media_asset" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "parentAssetId" UUID,
    "type" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "storageDriver" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "checksum" TEXT NOT NULL,
    "sourceType" "MediaSourceType" NOT NULL,
    "sourceUrl" TEXT,
    "licenseMetadata" JSONB,
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_production" (
    "id" UUID NOT NULL,
    "contentProjectId" UUID NOT NULL,
    "storyboardId" UUID NOT NULL,
    "videoRecipeId" UUID NOT NULL,
    "status" "VideoProductionStatus" NOT NULL DEFAULT 'PLANNED',
    "aspectRatio" TEXT NOT NULL,
    "targetDuration" INTEGER,
    "outputAssetId" UUID,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_production_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "render_job" (
    "id" UUID NOT NULL,
    "videoProductionId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "providerJobId" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "RenderJobStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB,
    "output" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "providerUsageId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "render_job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_asset_organizationId_brandId_status_idx" ON "media_asset"("organizationId", "brandId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "media_asset_brandId_checksum_key" ON "media_asset"("brandId", "checksum");

-- CreateIndex
CREATE INDEX "video_production_contentProjectId_status_idx" ON "video_production"("contentProjectId", "status");

-- CreateIndex
CREATE INDEX "render_job_status_createdAt_idx" ON "render_job"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "render_job_videoProductionId_provider_operation_attempt_key" ON "render_job"("videoProductionId", "provider", "operation", "attempt");

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_production" ADD CONSTRAINT "video_production_contentProjectId_fkey" FOREIGN KEY ("contentProjectId") REFERENCES "content_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_production" ADD CONSTRAINT "video_production_storyboardId_fkey" FOREIGN KEY ("storyboardId") REFERENCES "storyboard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_production" ADD CONSTRAINT "video_production_videoRecipeId_fkey" FOREIGN KEY ("videoRecipeId") REFERENCES "video_recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_production" ADD CONSTRAINT "video_production_outputAssetId_fkey" FOREIGN KEY ("outputAssetId") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "render_job" ADD CONSTRAINT "render_job_videoProductionId_fkey" FOREIGN KEY ("videoProductionId") REFERENCES "video_production"("id") ON DELETE CASCADE ON UPDATE CASCADE;
