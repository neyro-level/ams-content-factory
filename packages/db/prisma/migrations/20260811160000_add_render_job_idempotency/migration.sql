-- AlterTable
ALTER TABLE "render_job" ADD COLUMN "idempotencyKey" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "render_job_videoProductionId_idempotencyKey_key"
ON "render_job"("videoProductionId", "idempotencyKey");
