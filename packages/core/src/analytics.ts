import {
  createAnalyticsRepository,
  createPublishingRepository,
  type PrismaClient,
  type SocialPlatform,
} from '@ams-content-factory/db';
import type {
  AnalyticsProvider,
  DerivedMetrics,
  LearningProvider,
  NormalizedMetricValues,
} from '@ams-content-factory/providers';
import { AccessDeniedError, requirePermission, type Permission } from './tenant-context';
import { createTokenEncryptor } from './token-encryption';

type Context = { organizationId: string; brandId?: string; permissions: Set<Permission> };
type Encryptor = ReturnType<typeof createTokenEncryptor>;

export const defaultAnalyticsSnapshotDelaysHours = [24, 72, 168] as const;

function scope(context: Context) {
  requirePermission(context, 'content:write');
  if (!context.brandId) throw new AccessDeniedError('Analytics requires a brand context.');
  return { organizationId: context.organizationId, brandId: context.brandId };
}

function asNonNegativeInteger(value: number | undefined, name: string) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${name} must be a non-negative integer.`);
  return value;
}

function normalizeMetrics(metrics: NormalizedMetricValues) {
  return {
    ...(asNonNegativeInteger(metrics.views, 'views') !== undefined ? { views: metrics.views } : {}),
    ...(asNonNegativeInteger(metrics.reach, 'reach') !== undefined ? { reach: metrics.reach } : {}),
    ...(asNonNegativeInteger(metrics.impressions, 'impressions') !== undefined
      ? { impressions: metrics.impressions }
      : {}),
    ...(asNonNegativeInteger(metrics.likes, 'likes') !== undefined ? { likes: metrics.likes } : {}),
    ...(asNonNegativeInteger(metrics.comments, 'comments') !== undefined
      ? { comments: metrics.comments }
      : {}),
    ...(asNonNegativeInteger(metrics.shares, 'shares') !== undefined
      ? { shares: metrics.shares }
      : {}),
    ...(asNonNegativeInteger(metrics.saves, 'saves') !== undefined ? { saves: metrics.saves } : {}),
    ...(asNonNegativeInteger(metrics.clicks, 'clicks') !== undefined
      ? { clicks: metrics.clicks }
      : {}),
    ...(asNonNegativeInteger(metrics.watchTimeMs, 'watchTimeMs') !== undefined
      ? { watchTimeMs: metrics.watchTimeMs }
      : {}),
    ...(asNonNegativeInteger(metrics.averageWatchTimeMs, 'averageWatchTimeMs') !== undefined
      ? { averageWatchTimeMs: metrics.averageWatchTimeMs }
      : {}),
    ...(metrics.followersDelta !== undefined && Number.isInteger(metrics.followersDelta)
      ? { followersDelta: metrics.followersDelta }
      : {}),
  };
}

export function calculateDerivedMetrics(input: {
  views: number | null;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
}): DerivedMetrics {
  const engagementSignals = [input.likes, input.comments, input.shares, input.saves].filter(
    (metric): metric is number => metric !== null,
  );
  const engagementBase = input.reach ?? input.impressions ?? input.views;
  return {
    engagementRate:
      engagementBase && engagementSignals.length
        ? engagementSignals.reduce((sum, value) => sum + value, 0) / engagementBase
        : null,
    clickThroughRate:
      input.clicks !== null && input.impressions ? input.clicks / input.impressions : null,
  };
}

export function createAnalyticsService(options: {
  prisma?: PrismaClient;
  encryptor: Encryptor;
  providers: Record<SocialPlatform, AnalyticsProvider>;
  learningProvider: LearningProvider;
}) {
  const analytics = createAnalyticsRepository(options.prisma);
  const publishing = createPublishingRepository(options.prisma);
  return {
    collectionSchedule(publishedAt: Date, delaysHours = [...defaultAnalyticsSnapshotDelaysHours]) {
      if (
        !delaysHours.length ||
        delaysHours.some((hours) => !Number.isInteger(hours) || hours <= 0)
      ) {
        throw new Error('Analytics snapshot delays must be positive whole hours.');
      }
      return [...new Set(delaysHours)]
        .sort((a, b) => a - b)
        .map((hours) => new Date(publishedAt.getTime() + hours * 3_600_000));
    },
    async collect(context: Context, input: { publicationId: string; capturedAt: Date }) {
      const activeScope = scope(context);
      const publication = await publishing.findPublicationForProvider({
        ...activeScope,
        id: input.publicationId,
      });
      if (!publication || publication.status !== 'PUBLISHED') {
        throw new AccessDeniedError(
          'Only a published publication in the active tenant can be collected.',
        );
      }
      if (!publication.externalPostId || !publication.socialAccount.credential) {
        throw new Error('Published social account and external post credentials are required.');
      }
      const provider = options.providers[publication.socialAccount.platform];
      if (!provider || provider.platform !== publication.socialAccount.platform) {
        throw new Error(
          `No analytics provider is configured for ${publication.socialAccount.platform}.`,
        );
      }
      const credential = publication.socialAccount.credential;
      const snapshot = await provider.fetchSnapshot({
        externalAccountId: publication.socialAccount.externalAccountId,
        externalPostId: publication.externalPostId,
        credentials: {
          accessToken: options.encryptor.decrypt(credential.accessTokenCiphertext),
          ...(credential.refreshTokenCiphertext !== null
            ? { refreshToken: options.encryptor.decrypt(credential.refreshTokenCiphertext) }
            : {}),
          ...(credential.expiresAt !== null ? { expiresAt: credential.expiresAt } : {}),
        },
        capturedAt: input.capturedAt,
      });
      const saved = await analytics.upsertSnapshot({
        ...activeScope,
        publicationId: publication.id,
        capturedAt: input.capturedAt,
        rawMetrics: snapshot.rawMetrics,
        ...normalizeMetrics(snapshot.metrics),
      });
      if (!saved) throw new AccessDeniedError('Metric snapshot is outside the active tenant.');
      return saved;
    },
    list(
      context: Context,
      input: {
        publicationId?: string;
        periodStart?: Date;
        periodEnd?: Date;
        take?: number;
        cursor?: string;
      } = {},
    ) {
      return analytics.listSnapshots({ ...scope(context), ...input });
    },
    async analyze(context: Context, input: { periodStart: Date; periodEnd: Date }) {
      if (input.periodStart >= input.periodEnd)
        throw new Error('Analysis period must have a positive duration.');
      const activeScope = scope(context);
      const snapshots = await analytics.listSnapshots({ ...activeScope, ...input });
      const analysis = await options.learningProvider.analyze({
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        metrics: snapshots.map((snapshot) => ({
          platform: snapshot.publication.socialAccount.platform,
          derived: calculateDerivedMetrics(snapshot),
        })),
      });
      const insight = await analytics.createInsight({ ...activeScope, ...input, ...analysis });
      if (!insight)
        throw new AccessDeniedError('Performance insight is outside the active tenant.');
      return insight;
    },
    listInsights(context: Context, input: { take?: number; cursor?: string } = {}) {
      return analytics.listInsights({ ...scope(context), ...input });
    },
  };
}
