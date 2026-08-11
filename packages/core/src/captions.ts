import { createCaptionsRepository, type PrismaClient } from '@ams-content-factory/db';
import type { FfmpegProvider } from '@ams-content-factory/providers';
import { AccessDeniedError, requirePermission, type Permission } from './tenant-context';
export type CaptionWord = { word: string; startMs: number; endMs: number };
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
        technical?: object;
        visual?: object;
        content?: object;
        compliance?: object;
      },
    ) => repo.createQcReport({ ...scoped(c), ...input, status: 'PASSED' }),
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

export function evaluateQc(input: {
  technical: { passed: boolean; issues: string[] };
  visual: { passed: boolean; issues: string[] };
  content: { passed: boolean; issues: string[] };
  compliance?: { passed: boolean; issues: string[] };
}) {
  const sections = [input.technical, input.visual, input.content, input.compliance].filter(
    (value): value is { passed: boolean; issues: string[] } => value !== undefined,
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
