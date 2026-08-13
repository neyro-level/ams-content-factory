import { createHash } from 'node:crypto';
import {
  createCaptionsRepository,
  createMediaRepository,
  type PrismaClient,
} from '@ams-content-factory/db';
import type { FfmpegProvider, StorageProvider } from '@ams-content-factory/providers';
import { AccessDeniedError, requirePermission, type Permission } from './tenant-context';
export type CaptionWord = { word: string; startMs: number; endMs: number };
export type QcSection = { passed: boolean; issues: string[] };
type Context = { organizationId: string; brandId?: string; permissions: Set<Permission> };
const scoped = (c: Context) => {
  requirePermission(c, 'content:write');
  if (!c.brandId) throw new AccessDeniedError('Captions require a brand context.');
  return { organizationId: c.organizationId, brandId: c.brandId };
};
const timestamp = (ms: number) => new Date(ms).toISOString().slice(11, 23).replace('.', ',');
const assTimestamp = (ms: number) => {
  const centiseconds = Math.floor(ms / 10) % 100;
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 60_000) % 60;
  const hours = Math.floor(ms / 3_600_000);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
};
export function toSrt(words: CaptionWord[]) {
  return words
    .map(
      (word, index) =>
        `${index + 1}\n${timestamp(word.startMs)} --> ${timestamp(word.endMs)}\n${word.word}`,
    )
    .join('\n\n');
}
export function toAss(words: CaptionWord[]) {
  return words
    .map(
      (word) =>
        `Dialogue: 0,${assTimestamp(word.startMs)},${assTimestamp(word.endMs)},Default,,0,0,0,,${word.word}`,
    )
    .join('\n');
}
export function createCaptionsService(options: { prisma?: PrismaClient } = {}) {
  const repo = createCaptionsRepository(options.prisma);
  return {
    createTranscript: (
      c: Context,
      input: {
        videoProductionId: string;
        assetId: string;
        provider: string;
        language: string;
        text: string;
        words: CaptionWord[];
        durationMs: number;
      },
    ) => repo.createTranscript({ ...scoped(c), ...input, wordsJson: input.words }),
    createTrack: (
      c: Context,
      input: {
        videoProductionId: string;
        transcriptId: string;
        style: object;
        srtAssetId?: string;
        assAssetId?: string;
      },
    ) => repo.createCaptionTrack({ ...scoped(c), ...input }),
    createQc: (
      c: Context,
      input: {
        videoProductionId: string;
        technical: QcSection;
        visual: QcSection;
        content: QcSection;
        compliance?: QcSection;
      },
    ) => {
      const result = evaluateQc(input);
      return repo.createQcReport({ ...scoped(c), ...input, status: result.status });
    },
  };
}

export function createCaptionBurnInService(options: { ffmpeg: FfmpegProvider }) {
  return {
    async burn(input: { videoKey: string; captionKey: string; outputKey: string }) {
      return options.ffmpeg.burnCaptions({
        inputKey: input.videoKey,
        captionKey: input.captionKey,
        outputKey: input.outputKey,
      });
    },
  };
}

export function createCaptionSerializationService(options: {
  storage: StorageProvider;
  storageDriver: string;
  prisma?: PrismaClient;
}) {
  const captions = createCaptionsRepository(options.prisma);
  const media = createMediaRepository(options.prisma);
  const encoder = new TextEncoder();

  async function store(
    scope: { organizationId: string; brandId: string },
    input: { filename: string; content: string; mimeType: string },
  ) {
    const bytes = encoder.encode(input.content);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const extension = input.filename.endsWith('.srt') ? 'srt' : 'ass';
    const storageKey = `captions/${scope.organizationId}/${scope.brandId}/${checksum}.${extension}`;
    const result = await media.createOrGetPendingAsset({
      ...scope,
      type: 'CAPTION',
      mimeType: input.mimeType,
      filename: input.filename,
      storageKey,
      storageDriver: options.storageDriver,
      sizeBytes: BigInt(bytes.byteLength),
      checksum,
      sourceType: 'DERIVED',
    });
    if (!result) throw new AccessDeniedError('Caption asset is outside the active brand.');
    if (result.asset.status === 'READY') return result.asset;
    try {
      if (!(await options.storage.get(storageKey))) {
        await options.storage.put({ key: storageKey, content: bytes, contentType: input.mimeType });
      }
      const updated = await media.updateAssetStatus({
        ...scope,
        id: result.asset.id,
        from: 'PENDING',
        to: 'READY',
        mimeType: input.mimeType,
      });
      if (updated.count !== 1) throw new Error('Caption asset status transition was rejected.');
      return (await media.findAsset({ ...scope, id: result.asset.id }))!;
    } catch (error) {
      await options.storage.delete(storageKey).catch(() => undefined);
      await media.updateAssetStatus({
        ...scope,
        id: result.asset.id,
        from: 'PENDING',
        to: 'FAILED',
      });
      throw error;
    }
  }

  return {
    async serialize(
      context: Context,
      input: { videoProductionId: string; transcriptId: string; style: object },
    ) {
      const scope = scoped(context);
      const transcript = await captions.findTranscriptForProduction({ ...scope, ...input });
      if (!transcript)
        throw new AccessDeniedError('Transcript is outside the active video production.');
      const words = parseWords(transcript.wordsJson);
      if (!words.length) throw new Error('Transcript has no timestamped words for captions.');
      const [srt, ass] = await Promise.all([
        store(scope, {
          filename: `${transcript.id}.srt`,
          content: toSrt(words),
          mimeType: 'application/x-subrip',
        }),
        store(scope, {
          filename: `${transcript.id}.ass`,
          content: toAss(words),
          mimeType: 'text/x-ass',
        }),
      ]);
      const track = await captions.createCaptionTrack({
        ...scope,
        videoProductionId: input.videoProductionId,
        transcriptId: transcript.id,
        style: input.style,
        srtAssetId: srt.id,
        assAssetId: ass.id,
      });
      if (!track) throw new Error('Caption track persistence was rejected.');
      return track;
    },
  };
}

function parseWords(value: unknown): CaptionWord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((word): word is CaptionWord =>
    Boolean(
      word &&
      typeof word === 'object' &&
      typeof (word as CaptionWord).word === 'string' &&
      Number.isFinite((word as CaptionWord).startMs) &&
      Number.isFinite((word as CaptionWord).endMs),
    ),
  );
}

export function evaluateQc(input: {
  technical: QcSection;
  visual: QcSection;
  content: QcSection;
  compliance?: QcSection;
}) {
  const sections = [input.technical, input.visual, input.content, input.compliance].filter(
    (value): value is QcSection => value !== undefined,
  );
  const issues = sections.flatMap((section) => section.issues);
  return {
    status: issues.length
      ? sections.every((section) => section.passed)
        ? 'WARNING'
        : 'FAILED'
      : 'PASSED',
    issues,
  } as const;
}
