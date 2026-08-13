-- AlterTable
ALTER TABLE "api_key" ADD COLUMN     "actorUserId" UUID;

-- CreateIndex
CREATE INDEX "api_key_actorUserId_idx" ON "api_key"("actorUserId");

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
