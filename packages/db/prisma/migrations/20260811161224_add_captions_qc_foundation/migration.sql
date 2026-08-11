-- CreateEnum
CREATE TYPE "QcStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'WARNING');

-- CreateTable
CREATE TABLE "transcript" (
    "id" UUID NOT NULL,
    "videoProductionId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "wordsJson" JSONB NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caption_track" (
    "id" UUID NOT NULL,
    "videoProductionId" UUID NOT NULL,
    "transcriptId" UUID NOT NULL,
    "style" JSONB NOT NULL,
    "srtAssetId" UUID,
    "assAssetId" UUID,
    "burnedIn" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "caption_track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_report" (
    "id" UUID NOT NULL,
    "videoProductionId" UUID NOT NULL,
    "status" "QcStatus" NOT NULL DEFAULT 'PENDING',
    "technical" JSONB,
    "visual" JSONB,
    "content" JSONB,
    "compliance" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qc_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transcript_videoProductionId_createdAt_idx" ON "transcript"("videoProductionId", "createdAt");

-- CreateIndex
CREATE INDEX "caption_track_videoProductionId_createdAt_idx" ON "caption_track"("videoProductionId", "createdAt");

-- CreateIndex
CREATE INDEX "qc_report_videoProductionId_createdAt_idx" ON "qc_report"("videoProductionId", "createdAt");

-- AddForeignKey
ALTER TABLE "transcript" ADD CONSTRAINT "transcript_videoProductionId_fkey" FOREIGN KEY ("videoProductionId") REFERENCES "video_production"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript" ADD CONSTRAINT "transcript_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caption_track" ADD CONSTRAINT "caption_track_videoProductionId_fkey" FOREIGN KEY ("videoProductionId") REFERENCES "video_production"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caption_track" ADD CONSTRAINT "caption_track_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caption_track" ADD CONSTRAINT "caption_track_srtAssetId_fkey" FOREIGN KEY ("srtAssetId") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caption_track" ADD CONSTRAINT "caption_track_assAssetId_fkey" FOREIGN KEY ("assAssetId") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_report" ADD CONSTRAINT "qc_report_videoProductionId_fkey" FOREIGN KEY ("videoProductionId") REFERENCES "video_production"("id") ON DELETE CASCADE ON UPDATE CASCADE;
