-- Stable per-project generation keys prevent duplicate provider calls.
ALTER TABLE "content_project" ADD COLUMN "nextVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "ai_execution"
ADD COLUMN "idempotencyKey" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

CREATE UNIQUE INDEX "ai_execution_contentProjectId_idempotencyKey_key"
ON "ai_execution"("contentProjectId", "idempotencyKey");
