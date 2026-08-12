import {
  createMediaRepository,
  createProviderUsageRepository,
  type PrismaClient,
  type RenderJobStatus,
} from '@ams-content-factory/db';
import type {
  AvatarVideoProvider,
  MotionVideoProvider,
  VideoProviderJobStatus,
} from '@ams-content-factory/providers';
import { AccessDeniedError, requirePermission, type Permission } from './tenant-context';

type Context = { organizationId: string; brandId?: string; permissions: Set<Permission> };
type ProviderKind = 'avatar' | 'motion';
type MediaRepository = ReturnType<typeof createMediaRepository>;
type ProviderUsageRepository = ReturnType<typeof createProviderUsageRepository>;

export class VideoProviderOutcomeUnknownError extends Error {
  constructor() {
    super('Video provider outcome is unknown and requires reconciliation before retry.');
    this.name = 'VideoProviderOutcomeUnknownError';
  }
}

function scoped(context: Context) {
  requirePermission(context, 'content:write');
  if (!context.brandId) throw new AccessDeniedError('Video providers require a brand context.');
  return { organizationId: context.organizationId, brandId: context.brandId };
}

function renderStatus(status: VideoProviderJobStatus): RenderJobStatus {
  return status;
}

export function createVideoProviderService(options: {
  prisma?: PrismaClient;
  mediaRepository?: MediaRepository;
  usageRepository?: ProviderUsageRepository;
  avatarProvider: AvatarVideoProvider;
  motionProvider: MotionVideoProvider;
}) {
  const media = options.mediaRepository ?? createMediaRepository(options.prisma);
  const usage = options.usageRepository ?? createProviderUsageRepository(options.prisma);
  const providerFor = (kind: ProviderKind) =>
    kind === 'avatar' ? options.avatarProvider : options.motionProvider;

  return {
    async submit(
      context: Context,
      input: {
        kind: ProviderKind;
        provider: string;
        operation: string;
        model: string;
        unit: string;
        quantity: number;
        contentProjectId: string;
        videoProductionId: string;
        script: string;
        aspectRatio: string;
        outputKey: string;
        idempotencyKey: string;
      },
    ) {
      const scope = scoped(context);
      if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
        throw new Error('Provider usage quantity must be positive.');
      }
      const production = await media.findProduction({ ...scope, id: input.videoProductionId });
      if (!production || production.contentProjectId !== input.contentProjectId) {
        throw new AccessDeniedError('Video production is outside the active content project.');
      }
      const existing = await media.findRenderJobByIdempotency({
        ...scope,
        videoProductionId: input.videoProductionId,
        idempotencyKey: input.idempotencyKey,
      });
      if (existing) {
        if (!existing.providerUsageId || !existing.providerJobId) {
          throw new Error('An earlier idempotent provider submission did not complete safely.');
        }
        return {
          renderId: existing.id,
          providerUsageId: existing.providerUsageId,
          providerJob: {
            externalJobId: existing.providerJobId,
            status: existing.status as VideoProviderJobStatus,
          },
        };
      }
      const rate = await usage.findActiveRate({
        provider: input.provider,
        operation: input.operation,
        model: input.model,
        unit: input.unit,
      });
      if (!rate) {
        throw new Error('A configured provider rate is required before video generation.');
      }
      const trackedUsage = await usage.createUsage({
        ...scope,
        contentProjectId: input.contentProjectId,
        provider: input.provider,
        operation: input.operation,
        model: input.model,
        unit: input.unit,
        quantity: input.quantity,
        estimatedCost: Number(rate.unitCost) * input.quantity,
        currency: rate.currency,
      });
      if (!trackedUsage)
        throw new AccessDeniedError('Provider usage is outside the active tenant.');
      const render = await media.createRenderJob({
        ...scope,
        videoProductionId: input.videoProductionId,
        provider: input.provider,
        operation: input.operation,
        idempotencyKey: input.idempotencyKey,
        providerUsageId: trackedUsage.id,
        input: { model: input.model, unit: input.unit, quantity: input.quantity },
      });
      if (!render) throw new AccessDeniedError('Render job is outside the active tenant.');
      let providerJob: Awaited<ReturnType<AvatarVideoProvider['create']>> | undefined;
      try {
        providerJob = await providerFor(input.kind).create({
          idempotencyKey: input.idempotencyKey,
          script: input.script,
          aspectRatio: input.aspectRatio,
          outputKey: input.outputKey,
          model: input.model,
        });
        await usage.updateUsage({
          ...scope,
          id: trackedUsage.id,
          externalJobId: providerJob.externalJobId,
        });
        await media.updateRenderJob({
          ...scope,
          id: render.id,
          from: 'QUEUED',
          to: renderStatus(providerJob.status),
          providerJobId: providerJob.externalJobId,
        });
        return { renderId: render.id, providerUsageId: trackedUsage.id, providerJob };
      } catch (error) {
        if (providerJob) {
          try {
            await usage.updateUsage({
              ...scope,
              id: trackedUsage.id,
              externalJobId: providerJob.externalJobId,
            });
            await media.updateRenderJob({
              ...scope,
              id: render.id,
              from: 'QUEUED',
              to: 'OUTCOME_UNKNOWN',
              providerJobId: providerJob.externalJobId,
              errorCode: 'PERSISTENCE_AFTER_PROVIDER_SUCCESS_FAILED',
              errorMessage:
                error instanceof Error ? error.message : 'Could not persist video provider result.',
            });
          } catch {
            // Do not convert a completed external job into FAILED when the
            // recovery write itself is unavailable. A later operator/worker
            // reconciliation can still use the provider idempotency key.
          }
          throw new VideoProviderOutcomeUnknownError();
        }
        await media.updateRenderJob({
          ...scope,
          id: render.id,
          from: 'QUEUED',
          to: 'FAILED',
          errorCode: 'PROVIDER_SUBMIT_FAILED',
          errorMessage: error instanceof Error ? error.message : 'Provider submission failed.',
        });
        throw error;
      }
    },
    async poll(
      context: Context,
      input: { kind: ProviderKind; videoProductionId: string; renderJobId: string },
    ) {
      const scope = scoped(context);
      const production = await media.findProduction({ ...scope, id: input.videoProductionId });
      const render = production?.renderJobs.find((job) => job.id === input.renderJobId);
      if (!render || !render.providerJobId || !render.providerUsageId) {
        throw new AccessDeniedError('Render job is outside the active tenant or is not submitted.');
      }
      const providerJob = await providerFor(input.kind).getStatus(render.providerJobId);
      if (providerJob.status !== render.status) {
        await media.updateRenderJob({
          ...scope,
          id: render.id,
          from: render.status,
          to: renderStatus(providerJob.status),
          ...(providerJob.outputKey !== undefined
            ? { output: { outputKey: providerJob.outputKey } }
            : {}),
          ...(providerJob.errorCode !== undefined ? { errorCode: providerJob.errorCode } : {}),
          ...(providerJob.errorMessage !== undefined
            ? { errorMessage: providerJob.errorMessage }
            : {}),
        });
      }
      if (providerJob.actualCost !== undefined) {
        await usage.updateUsage({
          ...scope,
          id: render.providerUsageId,
          actualCost: providerJob.actualCost,
        });
      }
      return providerJob;
    },
  };
}
