import { getPrisma } from '../client';
import type { PrismaClient, QcStatus } from '../generated/prisma/client';

export function createCaptionsRepository(prisma: PrismaClient = getPrisma()) {
  const productionInScope = (input: {
    organizationId: string;
    brandId: string;
    videoProductionId: string;
  }) =>
    prisma.videoProduction.findFirst({
      where: {
        id: input.videoProductionId,
        contentProject: { organizationId: input.organizationId, brandId: input.brandId },
      },
      select: { id: true, contentProjectId: true },
    });
  return {
    async createTranscript(input: {
      organizationId: string;
      brandId: string;
      videoProductionId: string;
      assetId: string;
      provider: string;
      language: string;
      text: string;
      wordsJson: object;
      durationMs: number;
    }) {
      if (!(await productionInScope(input))) return null;
      const asset = await prisma.mediaAsset.findFirst({
        where: { id: input.assetId, organizationId: input.organizationId, brandId: input.brandId },
        select: { id: true },
      });
      if (!asset) return null;
      return prisma.transcript.create({
        data: {
          videoProductionId: input.videoProductionId,
          assetId: input.assetId,
          provider: input.provider,
          language: input.language,
          text: input.text,
          wordsJson: input.wordsJson,
          durationMs: input.durationMs,
        },
      });
    },
    async createCaptionTrack(input: {
      organizationId: string;
      brandId: string;
      videoProductionId: string;
      transcriptId: string;
      style: object;
      srtAssetId?: string;
      assAssetId?: string;
      metadata?: object;
    }) {
      if (!(await productionInScope(input))) return null;
      const transcript = await prisma.transcript.findFirst({
        where: { id: input.transcriptId, videoProductionId: input.videoProductionId },
        select: { id: true },
      });
      if (!transcript) return null;
      return prisma.captionTrack.create({
        data: {
          videoProductionId: input.videoProductionId,
          transcriptId: input.transcriptId,
          style: input.style,
          ...(input.srtAssetId !== undefined ? { srtAssetId: input.srtAssetId } : {}),
          ...(input.assAssetId !== undefined ? { assAssetId: input.assAssetId } : {}),
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        },
      });
    },
    async createQcReport(input: {
      organizationId: string;
      brandId: string;
      videoProductionId: string;
      status: QcStatus;
      technical?: object;
      visual?: object;
      content?: object;
      compliance?: object;
    }) {
      if (!(await productionInScope(input))) return null;
      return prisma.qcReport.create({
        data: {
          videoProductionId: input.videoProductionId,
          status: input.status,
          ...(input.technical !== undefined ? { technical: input.technical } : {}),
          ...(input.visual !== undefined ? { visual: input.visual } : {}),
          ...(input.content !== undefined ? { content: input.content } : {}),
          ...(input.compliance !== undefined ? { compliance: input.compliance } : {}),
        },
      });
    },
    findTranscript(input: { organizationId: string; brandId: string; id: string }) {
      return prisma.transcript.findFirst({
        where: {
          id: input.id,
          videoProduction: {
            contentProject: { organizationId: input.organizationId, brandId: input.brandId },
          },
        },
      });
    },
  };
}
