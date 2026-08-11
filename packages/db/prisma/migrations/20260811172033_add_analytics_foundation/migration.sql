-- CreateTable
CREATE TABLE "metric_snapshot" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "views" INTEGER,
    "reach" INTEGER,
    "impressions" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "clicks" INTEGER,
    "watchTimeMs" INTEGER,
    "averageWatchTimeMs" INTEGER,
    "followersDelta" INTEGER,
    "rawMetrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_insight" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "insight" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "experiment" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_insight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metric_snapshot_brandId_capturedAt_idx" ON "metric_snapshot"("brandId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "metric_snapshot_publicationId_capturedAt_key" ON "metric_snapshot"("publicationId", "capturedAt");

-- CreateIndex
CREATE INDEX "performance_insight_brandId_periodEnd_idx" ON "performance_insight"("brandId", "periodEnd");

-- AddForeignKey
ALTER TABLE "metric_snapshot" ADD CONSTRAINT "metric_snapshot_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_snapshot" ADD CONSTRAINT "metric_snapshot_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_insight" ADD CONSTRAINT "performance_insight_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
