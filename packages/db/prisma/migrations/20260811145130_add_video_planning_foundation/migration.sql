-- CreateEnum
CREATE TYPE "VideoRecipeStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StoryboardStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VisualJobType" AS ENUM ('PROOF', 'MECHANISM', 'CONSEQUENCE', 'ACTION', 'TRANSITION');

-- CreateTable
CREATE TABLE "video_recipe" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "description" TEXT,
    "bestFor" JSONB,
    "notFor" JSONB,
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aspectRatios" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "durationConfig" JSONB NOT NULL,
    "stages" JSONB NOT NULL,
    "providerConfig" JSONB,
    "scriptShape" JSONB NOT NULL,
    "visualJobs" JSONB NOT NULL,
    "qcRules" JSONB NOT NULL,
    "deliverables" JSONB NOT NULL,
    "status" "VideoRecipeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storyboard" (
    "id" UUID NOT NULL,
    "contentProjectId" UUID NOT NULL,
    "contentVersionId" UUID NOT NULL,
    "videoRecipeId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "StoryboardStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storyboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storyboard_beat" (
    "id" UUID NOT NULL,
    "storyboardId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "narration" TEXT NOT NULL,
    "visualJob" "VisualJobType" NOT NULL,
    "visualInstruction" TEXT NOT NULL,
    "evidenceId" UUID,
    "mediaAssetId" UUID,
    "durationHint" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "storyboard_beat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_recipe_key_version_key" ON "video_recipe"("key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "storyboard_contentProjectId_version_key" ON "storyboard"("contentProjectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "storyboard_beat_storyboardId_ordinal_key" ON "storyboard_beat"("storyboardId", "ordinal");

-- AddForeignKey
ALTER TABLE "storyboard" ADD CONSTRAINT "storyboard_contentProjectId_fkey" FOREIGN KEY ("contentProjectId") REFERENCES "content_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storyboard" ADD CONSTRAINT "storyboard_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "content_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storyboard" ADD CONSTRAINT "storyboard_videoRecipeId_fkey" FOREIGN KEY ("videoRecipeId") REFERENCES "video_recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storyboard_beat" ADD CONSTRAINT "storyboard_beat_storyboardId_fkey" FOREIGN KEY ("storyboardId") REFERENCES "storyboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
