-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM', 'VK');

-- CreateEnum
CREATE TYPE "SocialAccountStatus" AS ENUM ('CONNECTED', 'EXPIRED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'QUEUED', 'PREPARING', 'UPLOADING', 'PROCESSING', 'READY_TO_FINALIZE', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'OUTCOME_UNKNOWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PublicationAttemptStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED', 'OUTCOME_UNKNOWN');

-- CreateTable
CREATE TABLE "social_account" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "status" "SocialAccountStatus" NOT NULL DEFAULT 'CONNECTED',
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_credential" (
    "id" UUID NOT NULL,
    "socialAccountId" UUID NOT NULL,
    "accessTokenCiphertext" TEXT NOT NULL,
    "refreshTokenCiphertext" TEXT,
    "expiresAt" TIMESTAMP(3),
    "encryptionVersion" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "contentProjectId" UUID NOT NULL,
    "platformVariantId" UUID NOT NULL,
    "socialAccountId" UUID NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "externalPostId" TEXT,
    "permalink" TEXT,
    "lastAttemptId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_attempt" (
    "id" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PublicationAttemptStatus" NOT NULL DEFAULT 'STARTED',
    "providerOperation" TEXT NOT NULL,
    "providerJobId" TEXT,
    "requestFingerprint" TEXT NOT NULL,
    "response" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "publication_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_account_brandId_platform_status_idx" ON "social_account"("brandId", "platform", "status");

-- CreateIndex
CREATE UNIQUE INDEX "social_account_brandId_platform_externalAccountId_key" ON "social_account"("brandId", "platform", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "social_credential_socialAccountId_key" ON "social_credential"("socialAccountId");

-- CreateIndex
CREATE INDEX "publication_organizationId_brandId_status_scheduledAt_idx" ON "publication"("organizationId", "brandId", "status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "publication_attempt_publicationId_attempt_key" ON "publication_attempt"("publicationId", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "publication_attempt_publicationId_idempotencyKey_key" ON "publication_attempt"("publicationId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "social_account" ADD CONSTRAINT "social_account_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_credential" ADD CONSTRAINT "social_credential_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication" ADD CONSTRAINT "publication_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication" ADD CONSTRAINT "publication_contentProjectId_fkey" FOREIGN KEY ("contentProjectId") REFERENCES "content_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication" ADD CONSTRAINT "publication_platformVariantId_fkey" FOREIGN KEY ("platformVariantId") REFERENCES "platform_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication" ADD CONSTRAINT "publication_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_attempt" ADD CONSTRAINT "publication_attempt_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
