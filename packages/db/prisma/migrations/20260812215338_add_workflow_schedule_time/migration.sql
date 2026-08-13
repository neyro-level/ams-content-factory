-- AlterTable
ALTER TABLE "workflow_run" ADD COLUMN     "scheduledFor" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "workflow_run_status_scheduledFor_idx" ON "workflow_run"("status", "scheduledFor");
