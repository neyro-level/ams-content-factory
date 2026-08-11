-- Preserve the raw text source until downstream embedding is complete.
ALTER TABLE "knowledge_document" ADD COLUMN "sourceText" TEXT;

-- A repeated source for one brand is idempotent; PostgreSQL permits multiple NULL values.
CREATE UNIQUE INDEX "knowledge_document_brandId_checksum_key"
  ON "knowledge_document"("brandId", "checksum");
