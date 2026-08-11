-- CreateTable
CREATE TABLE "provider_rate" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_usage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "contentProjectId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "estimatedCost" DECIMAL(14,4) NOT NULL,
    "actualCost" DECIMAL(14,4),
    "currency" TEXT NOT NULL,
    "externalJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_rate_provider_operation_model_unit_effectiveAt_idx" ON "provider_rate"("provider", "operation", "model", "unit", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "provider_rate_provider_operation_model_unit_effectiveAt_key" ON "provider_rate"("provider", "operation", "model", "unit", "effectiveAt");

-- CreateIndex
CREATE INDEX "provider_usage_organizationId_brandId_createdAt_idx" ON "provider_usage"("organizationId", "brandId", "createdAt");

-- CreateIndex
CREATE INDEX "provider_usage_contentProjectId_createdAt_idx" ON "provider_usage"("contentProjectId", "createdAt");

-- AddForeignKey
ALTER TABLE "render_job" ADD CONSTRAINT "render_job_providerUsageId_fkey" FOREIGN KEY ("providerUsageId") REFERENCES "provider_usage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_usage" ADD CONSTRAINT "provider_usage_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_usage" ADD CONSTRAINT "provider_usage_contentProjectId_fkey" FOREIGN KEY ("contentProjectId") REFERENCES "content_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
