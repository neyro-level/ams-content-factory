-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "workflow_run" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "brandId" UUID,
    "type" TEXT NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB,
    "result" JSONB,
    "error" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_run_organizationId_status_createdAt_idx" ON "workflow_run"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "workflow_run_brandId_status_idx" ON "workflow_run"("brandId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_run_organizationId_idempotencyKey_key" ON "workflow_run"("organizationId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
