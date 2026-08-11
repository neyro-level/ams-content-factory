-- CreateEnum
CREATE TYPE "KnowledgeDocumentType" AS ENUM ('FILE', 'URL', 'TEXT', 'NOTE', 'CASE', 'PRODUCT');

-- CreateEnum
CREATE TYPE "KnowledgeDocumentStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "brand_profile" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "positioning" JSONB DEFAULT '{}',
    "targetAudience" JSONB DEFAULT '{}',
    "offers" JSONB DEFAULT '[]',
    "customerProblems" JSONB DEFAULT '[]',
    "differentiators" JSONB DEFAULT '[]',
    "proof" JSONB DEFAULT '[]',
    "constraints" JSONB DEFAULT '[]',
    "forbiddenClaims" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_voice" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "toneSummary" TEXT NOT NULL,
    "styleRules" JSONB,
    "doRules" JSONB,
    "dontRules" JSONB,
    "lexicon" JSONB,
    "forbiddenWords" JSONB,
    "exampleTexts" JSONB,
    "ctaExamples" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_voice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_pillar" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_pillar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_document" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" "KnowledgeDocumentType" NOT NULL,
    "sourceUrl" TEXT,
    "status" "KnowledgeDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "checksum" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunk" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brand_profile_brandId_key" ON "brand_profile"("brandId");

-- CreateIndex
CREATE INDEX "brand_voice_brandId_language_idx" ON "brand_voice"("brandId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "content_pillar_brandId_name_key" ON "content_pillar"("brandId", "name");

-- CreateIndex
CREATE INDEX "knowledge_document_organizationId_brandId_status_idx" ON "knowledge_document"("organizationId", "brandId", "status");

-- CreateIndex
CREATE INDEX "knowledge_chunk_brandId_documentId_idx" ON "knowledge_chunk"("brandId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_chunk_documentId_ordinal_key" ON "knowledge_chunk"("documentId", "ordinal");

-- AddForeignKey
ALTER TABLE "brand_profile" ADD CONSTRAINT "brand_profile_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_voice" ADD CONSTRAINT "brand_voice_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_pillar" ADD CONSTRAINT "content_pillar_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_document" ADD CONSTRAINT "knowledge_document_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunk" ADD CONSTRAINT "knowledge_chunk_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunk" ADD CONSTRAINT "knowledge_chunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "knowledge_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
