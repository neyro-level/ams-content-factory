import { Prisma } from '../generated/prisma/client';
import { getPrisma } from '../client';
import type {
  MediaAssetStatus,
  MediaSourceType,
  PrismaClient,
  RenderJobStatus,
  VideoProductionStatus,
} from '../generated/prisma/client';

export function createMediaRepository(prisma: PrismaClient = getPrisma()) {
  const hasBrand = (organizationId: string, brandId: string) =>
    prisma.brand.findFirst({
      where: { id: brandId, organizationId, deletedAt: null },
      select: { id: true },
    });
  const findProduction = (input: { organizationId: string; brandId: string; id: string }) =>
    prisma.videoProduction.findFirst({
      where: {
        id: input.id,
        contentProject: { organizationId: input.organizationId, brandId: input.brandId },
      },
      include: { renderJobs: { orderBy: { createdAt: 'asc' } }, outputAsset: true },
    });

  return {
    async createAsset(input: {
      organizationId: string;
      brandId: string;
      type: string;
      mimeType: string;
      filename: string;
      storageKey: string;
      storageDriver: string;
      sizeBytes: bigint;
      checksum: string;
      sourceType: MediaSourceType;
      width?: number;
      height?: number;
      durationMs?: number;
      sourceUrl?: string;
      licenseMetadata?: object;
      metadata?: object;
      parentAssetId?: string;
      status?: MediaAssetStatus;
    }) {
      if (!(await hasBrand(input.organizationId, input.brandId))) return null;
      if (input.parentAssetId) {
        const parent = await prisma.mediaAsset.findFirst({
          where: {
            id: input.parentAssetId,
            organizationId: input.organizationId,
            brandId: input.brandId,
          },
          select: { id: true },
        });
        if (!parent) return null;
      }
      return prisma.mediaAsset.create({ data: input });
    },
    async createOrGetPendingAsset(input: {
      organizationId: string;
      brandId: string;
      type: string;
      mimeType: string;
      filename: string;
      storageKey: string;
      storageDriver: string;
      sizeBytes: bigint;
      checksum: string;
      sourceType: MediaSourceType;
      sourceUrl?: string;
      metadata?: object;
    }) {
      if (!(await hasBrand(input.organizationId, input.brandId))) return null;
      try {
        return {
          asset: await prisma.mediaAsset.create({ data: { ...input, status: 'PENDING' } }),
          created: true,
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const asset = await prisma.mediaAsset.findFirst({
            where: {
              organizationId: input.organizationId,
              brandId: input.brandId,
              checksum: input.checksum,
            },
          });
          return asset ? { asset, created: false } : null;
        }
        throw error;
      }
    },
    updateAssetStatus(input: {
      organizationId: string;
      brandId: string;
      id: string;
      from: MediaAssetStatus;
      to: MediaAssetStatus;
      mimeType?: string;
      width?: number;
      height?: number;
      durationMs?: number;
      metadata?: object;
    }) {
      return prisma.mediaAsset.updateMany({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          brandId: input.brandId,
          status: input.from,
        },
        data: {
          status: input.to,
          ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
          ...(input.width !== undefined ? { width: input.width } : {}),
          ...(input.height !== undefined ? { height: input.height } : {}),
          ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        },
      });
    },
    findAsset(input: { organizationId: string; brandId: string; id: string }) {
      return prisma.mediaAsset.findFirst({
        where: { id: input.id, organizationId: input.organizationId, brandId: input.brandId },
      });
    },
    async createProduction(input: {
      organizationId: string;
      brandId: string;
      contentProjectId: string;
      storyboardId: string;
      videoRecipeId: string;
      aspectRatio: string;
      targetDuration?: number;
      metadata?: object;
    }) {
      const project = await prisma.contentProject.findFirst({
        where: {
          id: input.contentProjectId,
          organizationId: input.organizationId,
          brandId: input.brandId,
        },
        select: { id: true },
      });
      if (!project) return null;
      const storyboard = await prisma.storyboard.findFirst({
        where: {
          id: input.storyboardId,
          contentProjectId: input.contentProjectId,
          videoRecipeId: input.videoRecipeId,
        },
        select: { id: true },
      });
      if (!storyboard) return null;
      return prisma.videoProduction.create({
        data: {
          contentProjectId: input.contentProjectId,
          storyboardId: input.storyboardId,
          videoRecipeId: input.videoRecipeId,
          aspectRatio: input.aspectRatio,
          ...(input.targetDuration !== undefined ? { targetDuration: input.targetDuration } : {}),
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        },
      });
    },
    findProduction,
    async createRenderJob(input: {
      organizationId: string;
      brandId: string;
      videoProductionId: string;
      provider: string;
      operation: string;
      idempotencyKey: string;
      attempt?: number;
      input?: object;
      status?: RenderJobStatus;
      providerUsageId?: string;
    }) {
      const production = await findProduction({
        organizationId: input.organizationId,
        brandId: input.brandId,
        id: input.videoProductionId,
      });
      if (!production) return null;
      if (input.providerUsageId) {
        const usage = await prisma.providerUsage.findFirst({
          where: {
            id: input.providerUsageId,
            organizationId: input.organizationId,
            brandId: input.brandId,
            contentProjectId: production.contentProjectId,
          },
          select: { id: true },
        });
        if (!usage) return null;
      }
      return prisma.renderJob.create({
        data: {
          videoProductionId: input.videoProductionId,
          provider: input.provider,
          operation: input.operation,
          idempotencyKey: input.idempotencyKey,
          ...(input.attempt !== undefined ? { attempt: input.attempt } : {}),
          ...(input.input !== undefined ? { input: input.input } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.providerUsageId !== undefined
            ? { providerUsageId: input.providerUsageId }
            : {}),
        },
      });
    },
    findRenderJobByIdempotency(input: {
      organizationId: string;
      brandId: string;
      videoProductionId: string;
      idempotencyKey: string;
    }) {
      return prisma.renderJob.findFirst({
        where: {
          videoProductionId: input.videoProductionId,
          idempotencyKey: input.idempotencyKey,
          videoProduction: {
            contentProject: { organizationId: input.organizationId, brandId: input.brandId },
          },
        },
      });
    },
    async updateRenderJob(input: {
      organizationId: string;
      brandId: string;
      id: string;
      from: RenderJobStatus;
      to: RenderJobStatus;
      providerJobId?: string;
      output?: object;
      errorCode?: string;
      errorMessage?: string;
    }) {
      return prisma.renderJob.updateMany({
        where: {
          id: input.id,
          status: input.from,
          videoProduction: {
            contentProject: { organizationId: input.organizationId, brandId: input.brandId },
          },
        },
        data: {
          status: input.to,
          ...(input.providerJobId !== undefined ? { providerJobId: input.providerJobId } : {}),
          ...(input.output !== undefined ? { output: input.output } : {}),
          ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
          ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
          ...(input.to === 'SUBMITTED' ? { startedAt: new Date() } : {}),
          ...(['COMPLETED', 'FAILED', 'CANCELLED', 'OUTCOME_UNKNOWN'].includes(input.to)
            ? { finishedAt: new Date() }
            : {}),
        },
      });
    },
    async attachAssetToProduction(input: {
      organizationId: string;
      brandId: string;
      mediaAssetId: string;
      videoProductionId: string;
      role: string;
      metadata?: object;
    }) {
      const [asset, production] = await Promise.all([
        prisma.mediaAsset.findFirst({
          where: {
            id: input.mediaAssetId,
            organizationId: input.organizationId,
            brandId: input.brandId,
          },
          select: { id: true },
        }),
        findProduction({
          organizationId: input.organizationId,
          brandId: input.brandId,
          id: input.videoProductionId,
        }),
      ]);
      if (!asset || !production) return null;
      return prisma.assetUsage.upsert({
        where: {
          mediaAssetId_videoProductionId_role: {
            mediaAssetId: input.mediaAssetId,
            videoProductionId: input.videoProductionId,
            role: input.role,
          },
        },
        create: {
          mediaAssetId: input.mediaAssetId,
          videoProductionId: input.videoProductionId,
          role: input.role,
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        },
        update: input.metadata !== undefined ? { metadata: input.metadata } : {},
      });
    },
    transitionProduction(input: {
      organizationId: string;
      brandId: string;
      id: string;
      from: VideoProductionStatus;
      to: VideoProductionStatus;
    }) {
      return prisma.videoProduction.updateMany({
        where: {
          id: input.id,
          status: input.from,
          contentProject: { organizationId: input.organizationId, brandId: input.brandId },
        },
        data: { status: input.to },
      });
    },
  };
}
