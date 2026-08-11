import { createHash } from 'node:crypto';
import {
  createMediaRepository,
  type MediaSourceType,
  type PrismaClient,
  type VideoProductionStatus,
} from '@ams-content-factory/db';
import type { StorageProvider } from '@ams-content-factory/providers';
import { AccessDeniedError, requirePermission, type Permission } from './tenant-context';

type Context = { organizationId: string; brandId?: string; permissions: Set<Permission> };

function scoped(context: Context) {
  requirePermission(context, 'content:write');
  if (!context.brandId) throw new AccessDeniedError('Media requires a brand context.');
  return { organizationId: context.organizationId, brandId: context.brandId };
}

export const videoProductionTransitions: Readonly<
  Record<VideoProductionStatus, readonly VideoProductionStatus[]>
> = {
  PLANNED: ['SCRIPT_READY', 'CANCELLED'],
  SCRIPT_READY: ['STORYBOARD_READY', 'CANCELLED'],
  STORYBOARD_READY: ['WAITING_APPROVAL', 'GENERATING', 'CANCELLED'],
  WAITING_APPROVAL: ['GENERATING', 'CANCELLED'],
  GENERATING: ['COMPOSING', 'FAILED', 'CANCELLED'],
  COMPOSING: ['QC', 'FAILED', 'CANCELLED'],
  QC: ['READY', 'FAILED', 'COMPOSING'],
  READY: [],
  FAILED: ['GENERATING', 'CANCELLED'],
  CANCELLED: [],
};

export function createMediaService(options: {
  prisma?: PrismaClient;
  storage: StorageProvider;
  storageDriver: string;
}) {
  const repository = createMediaRepository(options.prisma);
  return {
    async store(
      context: Context,
      input: {
        type: string;
        mimeType: string;
        filename: string;
        storageKey: string;
        content: Uint8Array;
        sourceType: MediaSourceType;
        sourceUrl?: string;
        metadata?: object;
      },
    ) {
      const checksum = createHash('sha256').update(input.content).digest('hex');
      const stored = await options.storage.put({
        key: input.storageKey,
        content: input.content,
        contentType: input.mimeType,
      });
      const asset = await repository.createAsset({
        ...scoped(context),
        type: input.type,
        mimeType: input.mimeType,
        filename: input.filename,
        storageKey: stored.key,
        storageDriver: options.storageDriver,
        sizeBytes: BigInt(stored.sizeBytes),
        checksum,
        sourceType: input.sourceType,
        ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        status: 'READY',
      });
      if (!asset) throw new Error('Brand is unavailable for media storage.');
      return asset;
    },
    find: (context: Context, id: string) => repository.findAsset({ ...scoped(context), id }),
  };
}

export function createVideoProductionService(options: { prisma?: PrismaClient } = {}) {
  const repository = createMediaRepository(options.prisma);
  return {
    create: (
      context: Context,
      input: {
        contentProjectId: string;
        storyboardId: string;
        videoRecipeId: string;
        aspectRatio: string;
        targetDuration?: number;
      },
    ) => repository.createProduction({ ...scoped(context), ...input }),
    queueRender: (
      context: Context,
      input: { videoProductionId: string; provider: string; operation: string; input?: object },
    ) => repository.createRenderJob({ ...scoped(context), ...input }),
    attachAsset: (
      context: Context,
      input: { mediaAssetId: string; videoProductionId: string; role: string; metadata?: object },
    ) => repository.attachAssetToProduction({ ...scoped(context), ...input }),
    async transition(
      context: Context,
      input: { id: string; from: VideoProductionStatus; to: VideoProductionStatus },
    ) {
      if (!videoProductionTransitions[input.from].includes(input.to)) {
        throw new Error(`Invalid video production transition: ${input.from} -> ${input.to}`);
      }
      return repository.transitionProduction({ ...scoped(context), ...input });
    },
    find: (context: Context, id: string) => repository.findProduction({ ...scoped(context), id }),
  };
}
