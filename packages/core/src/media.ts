import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import {
  createMediaRepository,
  type MediaSourceType,
  type PrismaClient,
  type VideoProductionStatus,
} from '@ams-content-factory/db';
import type { StorageProvider } from '@ams-content-factory/providers';
import { AccessDeniedError, requirePermission, type Permission } from './tenant-context';

type Context = { organizationId: string; brandId?: string; permissions: Set<Permission> };

type DetectedMedia = {
  mimeType: 'video/mp4' | 'image/png' | 'image/jpeg';
  extension: 'mp4' | 'png' | 'jpg';
};

const maximumUploadBytes = 100 * 1024 * 1024;

function scoped(context: Context) {
  requirePermission(context, 'content:write');
  if (!context.brandId) throw new AccessDeniedError('Media requires a brand context.');
  return { organizationId: context.organizationId, brandId: context.brandId };
}

function inspectMediaBytes(content: Uint8Array): DetectedMedia {
  if (content.byteLength >= 12 && String.fromCharCode(...content.slice(4, 8)) === 'ftyp') {
    return { mimeType: 'video/mp4', extension: 'mp4' };
  }
  if (
    content.byteLength >= 8 &&
    content[0] === 0x89 &&
    content[1] === 0x50 &&
    content[2] === 0x4e &&
    content[3] === 0x47 &&
    content[4] === 0x0d &&
    content[5] === 0x0a &&
    content[6] === 0x1a &&
    content[7] === 0x0a
  ) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  if (
    content.byteLength >= 3 &&
    content[0] === 0xff &&
    content[1] === 0xd8 &&
    content[2] === 0xff
  ) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
  throw new Error('Uploaded bytes are not a supported MP4, PNG, or JPEG media file.');
}

function validateUploadMetadata(input: { type: string; filename: string; content: Uint8Array }) {
  if (!input.type.trim()) throw new Error('Media type is required.');
  if (!input.filename.trim() || input.filename.includes('/') || input.filename.includes('\\')) {
    throw new Error('Media filename must be a basename.');
  }
  if (input.content.byteLength === 0 || input.content.byteLength > maximumUploadBytes) {
    throw new Error(`Media size must be between 1 and ${maximumUploadBytes} bytes.`);
  }
}

function generatedStorageKey(input: {
  organizationId: string;
  brandId: string;
  checksum: string;
  extension: string;
}) {
  return `media/${input.organizationId}/${input.brandId}/${input.checksum}.${input.extension}`;
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
  QC: ['FAILED', 'COMPOSING'],
  READY: [],
  FAILED: ['GENERATING', 'CANCELLED'],
  CANCELLED: [],
};

export function createMediaService(options: {
  prisma?: PrismaClient;
  storage: StorageProvider;
  storageDriver: string;
  repository?: ReturnType<typeof createMediaRepository>;
}) {
  const repository = options.repository ?? createMediaRepository(options.prisma);
  return {
    async store(
      context: Context,
      input: {
        type: string;
        filename: string;
        content: Uint8Array;
        sourceType: MediaSourceType;
        sourceUrl?: string;
        metadata?: object;
      },
    ) {
      const activeScope = scoped(context);
      validateUploadMetadata(input);
      const checksum = createHash('sha256').update(input.content).digest('hex');
      const extension = extname(input.filename).replace('.', '').toLowerCase() || 'bin';
      const storageKey = generatedStorageKey({ ...activeScope, checksum, extension });
      const result = await repository.createOrGetPendingAsset({
        ...activeScope,
        type: input.type,
        mimeType: 'application/octet-stream',
        filename: input.filename,
        storageKey,
        storageDriver: options.storageDriver,
        sizeBytes: BigInt(input.content.byteLength),
        checksum,
        sourceType: input.sourceType,
        ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      });
      if (!result) throw new AccessDeniedError('Brand is unavailable for media storage.');
      if (result.asset.status === 'READY') return result.asset;

      try {
        const detected = inspectMediaBytes(input.content);
        const existing = await options.storage.get(storageKey);
        if (!existing) {
          await options.storage.put({
            key: storageKey,
            content: input.content,
            contentType: detected.mimeType,
          });
        }
        const updated = await repository.updateAssetStatus({
          ...activeScope,
          id: result.asset.id,
          from: 'PENDING',
          to: 'READY',
          mimeType: detected.mimeType,
        });
        if (updated.count !== 1) throw new Error('Media asset status transition was rejected.');
        return (await repository.findAsset({ ...activeScope, id: result.asset.id }))!;
      } catch (error) {
        await options.storage.delete(storageKey).catch(() => undefined);
        await repository
          .updateAssetStatus({ ...activeScope, id: result.asset.id, from: 'PENDING', to: 'FAILED' })
          .catch(() => undefined);
        throw error;
      }
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
      input: {
        videoProductionId: string;
        provider: string;
        operation: string;
        idempotencyKey: string;
        input?: object;
      },
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

/** Product-path lifecycle: only an approved storyboard of an approved project can enter production. */
export function createVideoProductionWorkflowService(options: { prisma?: PrismaClient } = {}) {
  const repository = createMediaRepository(options.prisma);
  return {
    create(
      context: Context,
      input: {
        contentProjectId: string;
        storyboardId: string;
        videoRecipeId: string;
        aspectRatio: string;
        targetDuration?: number;
      },
    ) {
      return repository.createProductionFromApprovedStoryboard({ ...scoped(context), ...input });
    },
    async advance(context: Context, input: { id: string; to: VideoProductionStatus }) {
      const scope = scoped(context);
      const production = await repository.findProduction({ ...scope, id: input.id });
      if (!production) throw new AccessDeniedError('Video production is outside the active brand.');
      if (!videoProductionTransitions[production.status].includes(input.to)) {
        throw new Error(`Invalid video production transition: ${production.status} -> ${input.to}`);
      }
      if (input.to === 'SCRIPT_READY' && production.contentProject.status !== 'APPROVED') {
        throw new Error('Production script is not approved.');
      }
      if (
        input.to === 'STORYBOARD_READY' &&
        (production.storyboard.status !== 'APPROVED' || production.storyboard.beats.length === 0)
      ) {
        throw new Error('Production storyboard is not approved and complete.');
      }
      const transition = await repository.transitionProduction({
        ...scope,
        id: input.id,
        from: production.status,
        to: input.to,
      });
      if (transition.count !== 1) throw new Error('Video production transition was rejected.');
      return repository.findProduction({ ...scope, id: input.id });
    },
    find: (context: Context, id: string) => repository.findProduction({ ...scoped(context), id }),
  };
}
