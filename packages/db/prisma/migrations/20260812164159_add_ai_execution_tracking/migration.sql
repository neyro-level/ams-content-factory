-- CreateEnum
CREATE TYPE "AiExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "ai_execution" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "contentProjectId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "promptKey" TEXT NOT NULL,
    "promptVersion" INTEGER NOT NULL,
    "status" "AiExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCost" DECIMAL(14,4),
    "actualCost" DECIMAL(14,4),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_execution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_execution_organizationId_brandId_status_createdAt_idx" ON "ai_execution"("organizationId", "brandId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ai_execution_contentProjectId_status_createdAt_idx" ON "ai_execution"("contentProjectId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_execution" ADD CONSTRAINT "ai_execution_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_execution" ADD CONSTRAINT "ai_execution_contentProjectId_fkey" FOREIGN KEY ("contentProjectId") REFERENCES "content_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
