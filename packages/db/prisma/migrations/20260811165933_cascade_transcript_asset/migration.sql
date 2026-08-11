-- DropForeignKey
ALTER TABLE "transcript" DROP CONSTRAINT "transcript_assetId_fkey";

-- AddForeignKey
ALTER TABLE "transcript" ADD CONSTRAINT "transcript_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "media_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
