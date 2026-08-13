-- CreateIndex
CREATE INDEX "content_project_organizationId_brandId_updatedAt_id_idx" ON "content_project"("organizationId", "brandId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "publication_status_scheduledAt_createdAt_id_idx" ON "publication"("status", "scheduledAt", "createdAt", "id");
