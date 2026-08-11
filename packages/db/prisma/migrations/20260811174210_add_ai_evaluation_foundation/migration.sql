-- CreateEnum
CREATE TYPE "EvaluationRunStatus" AS ENUM ('PENDING', 'RUNNING', 'PASSED', 'FAILED');

-- CreateTable
CREATE TABLE "evaluation_suite" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_suite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_case" (
    "id" UUID NOT NULL,
    "suiteId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "expectedProperties" JSONB NOT NULL,
    "forbiddenProperties" JSONB NOT NULL,
    "referenceContext" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_run" (
    "id" UUID NOT NULL,
    "suiteId" UUID NOT NULL,
    "status" "EvaluationRunStatus" NOT NULL DEFAULT 'PENDING',
    "oldPromptKey" TEXT,
    "oldPromptVersion" INTEGER,
    "newPromptKey" TEXT,
    "newPromptVersion" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_result" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "score" DOUBLE PRECISION,
    "output" JSONB,
    "failures" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_result_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_suite_key_key" ON "evaluation_suite"("key");

-- CreateIndex
CREATE INDEX "evaluation_case_suiteId_idx" ON "evaluation_case"("suiteId");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_case_suiteId_name_key" ON "evaluation_case"("suiteId", "name");

-- CreateIndex
CREATE INDEX "evaluation_run_suiteId_status_createdAt_idx" ON "evaluation_run"("suiteId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "evaluation_result_caseId_idx" ON "evaluation_result"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_result_runId_caseId_key" ON "evaluation_result"("runId", "caseId");

-- AddForeignKey
ALTER TABLE "evaluation_case" ADD CONSTRAINT "evaluation_case_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "evaluation_suite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_run" ADD CONSTRAINT "evaluation_run_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "evaluation_suite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_result" ADD CONSTRAINT "evaluation_result_runId_fkey" FOREIGN KEY ("runId") REFERENCES "evaluation_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_result" ADD CONSTRAINT "evaluation_result_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "evaluation_case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
