import {
  createCaptionsRepository,
  createMediaRepository,
  type PrismaClient,
} from '@ams-content-factory/db';
import type { TranscriptionProvider } from '@ams-content-factory/providers';
import { AccessDeniedError, requirePermission, type Permission } from './tenant-context';

type Context = { organizationId: string; brandId?: string; permissions: Set<Permission> };

function scoped(context: Context) {
  requirePermission(context, 'content:write');
  if (!context.brandId) throw new AccessDeniedError('Transcription requires a brand context.');
  return { organizationId: context.organizationId, brandId: context.brandId };
}

export function createVideoOutputService(options: { prisma?: PrismaClient } = {}) {
  const media = createMediaRepository(options.prisma);
  return {
    attachOutput(context: Context, input: { videoProductionId: string; mediaAssetId: string }) {
      return media.setOutputAsset({ ...scoped(context), ...input });
    },
  };
}

export function createTranscriptionService(options: {
  provider: TranscriptionProvider;
  prisma?: PrismaClient;
}) {
  const media = createMediaRepository(options.prisma);
  const captions = createCaptionsRepository(options.prisma);
  return {
    async transcribe(context: Context, input: { videoProductionId: string; language: string }) {
      const scope = scoped(context);
      const production = await media.findProduction({ ...scope, id: input.videoProductionId });
      if (
        !production ||
        production.status !== 'COMPOSING' ||
        !production.outputAsset ||
        production.outputAsset.status !== 'READY'
      ) {
        throw new Error('A durable READY output asset is required before transcription.');
      }
      const result = await options.provider.transcribe({
        assetKey: production.outputAsset.storageKey,
        language: input.language,
      });
      const transcript = await captions.createTranscript({
        ...scope,
        videoProductionId: production.id,
        assetId: production.outputAsset.id,
        provider: 'configured-transcription-provider',
        language: input.language,
        text: result.text,
        wordsJson: result.words,
        durationMs: result.durationMs,
      });
      if (!transcript) throw new Error('Transcript persistence was rejected.');
      return transcript;
    },
  };
}
