import { getPrisma } from '../client';
import type { PrismaClient } from '../generated/prisma/client';

export function createAnalyticsRepository(prisma: PrismaClient = getPrisma()) {
  const publicationInScope = (input: {
    organizationId: string;
    brandId: string;
    publicationId: string;
  }) =>
    prisma.publication.findFirst({
      where: {
        id: input.publicationId,
        organizationId: input.organizationId,
        brandId: input.brandId,
        status: 'PUBLISHED',
      },
      select: { id: true },
    });
  return {
    async upsertSnapshot(input: {
      organizationId: string;
      brandId: string;
      publicationId: string;
      capturedAt: Date;
      rawMetrics: object;
      views?: number;
      reach?: number;
      impressions?: number;
      likes?: number;
      comments?: number;
      shares?: number;
      saves?: number;
      clicks?: number;
      watchTimeMs?: number;
      averageWatchTimeMs?: number;
      followersDelta?: number;
    }) {
      if (!(await publicationInScope(input))) return null;
      const data = {
        brandId: input.brandId,
        rawMetrics: input.rawMetrics,
        ...(input.views !== undefined ? { views: input.views } : {}),
        ...(input.reach !== undefined ? { reach: input.reach } : {}),
        ...(input.impressions !== undefined ? { impressions: input.impressions } : {}),
        ...(input.likes !== undefined ? { likes: input.likes } : {}),
        ...(input.comments !== undefined ? { comments: input.comments } : {}),
        ...(input.shares !== undefined ? { shares: input.shares } : {}),
        ...(input.saves !== undefined ? { saves: input.saves } : {}),
        ...(input.clicks !== undefined ? { clicks: input.clicks } : {}),
        ...(input.watchTimeMs !== undefined ? { watchTimeMs: input.watchTimeMs } : {}),
        ...(input.averageWatchTimeMs !== undefined
          ? { averageWatchTimeMs: input.averageWatchTimeMs }
          : {}),
        ...(input.followersDelta !== undefined ? { followersDelta: input.followersDelta } : {}),
      };
      return prisma.metricSnapshot.upsert({
        where: {
          publicationId_capturedAt: {
            publicationId: input.publicationId,
            capturedAt: input.capturedAt,
          },
        },
        create: { publicationId: input.publicationId, capturedAt: input.capturedAt, ...data },
        update: data,
      });
    },
    listSnapshots(input: {
      organizationId: string;
      brandId: string;
      publicationId?: string;
      periodStart?: Date;
      periodEnd?: Date;
      take?: number;
      cursor?: string;
    }) {
      return prisma.metricSnapshot.findMany({
        where: {
          brandId: input.brandId,
          publication: { organizationId: input.organizationId, brandId: input.brandId },
          ...(input.publicationId !== undefined ? { publicationId: input.publicationId } : {}),
          ...(input.periodStart !== undefined || input.periodEnd !== undefined
            ? {
                capturedAt: {
                  ...(input.periodStart !== undefined ? { gte: input.periodStart } : {}),
                  ...(input.periodEnd !== undefined ? { lte: input.periodEnd } : {}),
                },
              }
            : {}),
        },
        include: {
          publication: {
            include: {
              socialAccount: true,
              contentProject: {
                select: {
                  id: true,
                  title: true,
                  pillar: { select: { name: true } },
                  opportunity: { select: { title: true } },
                },
              },
            },
          },
        },
        orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        take: Math.min(Math.max(input.take ?? 100, 1), 250),
      });
    },
    async createInsight(input: {
      organizationId: string;
      brandId: string;
      periodStart: Date;
      periodEnd: Date;
      insight: string;
      recommendation: string;
      experiment: string;
      metadata?: object;
    }) {
      const brand = await prisma.brand.findFirst({
        where: { id: input.brandId, organizationId: input.organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!brand) return null;
      return prisma.performanceInsight.create({
        data: {
          brandId: input.brandId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          insight: input.insight,
          recommendation: input.recommendation,
          experiment: input.experiment,
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        },
      });
    },
    listInsights(input: {
      organizationId: string;
      brandId: string;
      take?: number;
      cursor?: string;
    }) {
      return prisma.performanceInsight.findMany({
        where: { brandId: input.brandId, brand: { organizationId: input.organizationId } },
        orderBy: [{ periodEnd: 'desc' }, { id: 'asc' }],
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        take: Math.min(Math.max(input.take ?? 50, 1), 100),
      });
    },
  };
}
