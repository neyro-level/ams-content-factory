-- CreateTable
CREATE TABLE "inbound_webhook_credential" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "keyId" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "encryptionVersion" TEXT NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_webhook_credential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inbound_webhook_credential_keyId_key" ON "inbound_webhook_credential"("keyId");

-- CreateIndex
CREATE INDEX "inbound_webhook_credential_organizationId_disabledAt_idx" ON "inbound_webhook_credential"("organizationId", "disabledAt");

-- AddForeignKey
ALTER TABLE "inbound_webhook_credential" ADD CONSTRAINT "inbound_webhook_credential_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
