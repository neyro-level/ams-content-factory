-- CreateTable
CREATE TABLE "asset_usage" (
    "id" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "videoProductionId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_usage_videoProductionId_idx" ON "asset_usage"("videoProductionId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_usage_mediaAssetId_videoProductionId_role_key" ON "asset_usage"("mediaAssetId", "videoProductionId", "role");

-- AddForeignKey
ALTER TABLE "asset_usage" ADD CONSTRAINT "asset_usage_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_usage" ADD CONSTRAINT "asset_usage_videoProductionId_fkey" FOREIGN KEY ("videoProductionId") REFERENCES "video_production"("id") ON DELETE CASCADE ON UPDATE CASCADE;
