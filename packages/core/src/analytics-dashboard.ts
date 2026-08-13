import { createAnalyticsRepository, createTenantRepository } from '@ams-content-factory/db';
import { AccessDeniedError, requirePermission, resolveTenantContext } from './tenant-context';

type DashboardActor = { userId: string; organizationId: string; brandId: string };
type ReportedMetric = { value: number; reported: boolean };

export type AnalyticsDashboard = {
  periodStart?: Date;
  periodEnd?: Date;
  snapshotCount: number;
  totals: {
    views: ReportedMetric;
    reach: ReportedMetric;
    impressions: ReportedMetric;
    engagement: ReportedMetric;
    clicks: ReportedMetric;
    followersDelta: ReportedMetric;
  };
  platforms: Array<{
    platform: string;
    publications: number;
    views: ReportedMetric;
    reach: ReportedMetric;
    engagement: ReportedMetric;
    clicks: ReportedMetric;
  }>;
  pillars: Array<{ name: string; publications: number; engagement: ReportedMetric }>;
  topics: Array<{ name: string; publications: number; engagement: ReportedMetric }>;
  topContent: ContentPerformance[];
  worstContent: ContentPerformance[];
};

export type ContentPerformance = {
  publicationId: string;
  title: string;
  platform: string;
  pillar: string | null;
  topic: string | null;
  engagement: number;
  engagementRate: number | null;
  reach: ReportedMetric;
  views: ReportedMetric;
};

type Snapshot = Awaited<
  ReturnType<ReturnType<typeof createAnalyticsRepository>['listSnapshots']>
>[number];

const pageSize = 250;

function metric(value: number | null | undefined): ReportedMetric {
  return { value: value ?? 0, reported: value !== null && value !== undefined };
}

function addMetric(current: ReportedMetric, value: number | null | undefined): ReportedMetric {
  if (value === null || value === undefined) return current;
  return { value: current.value + value, reported: true };
}

function emptyMetric(): ReportedMetric {
  return { value: 0, reported: false };
}

function engagement(snapshot: Snapshot) {
  const values = [snapshot.likes, snapshot.comments, snapshot.shares, snapshot.saves];
  return {
    value: values.reduce<number>((sum, value) => sum + (value ?? 0), 0),
    reported: values.some((value) => value !== null),
  };
}

function audience(snapshot: Snapshot) {
  return snapshot.reach ?? snapshot.impressions ?? snapshot.views;
}

function isNewer(candidate: Snapshot, current: Snapshot) {
  return (
    candidate.capturedAt.getTime() > current.capturedAt.getTime() ||
    (candidate.capturedAt.getTime() === current.capturedAt.getTime() && candidate.id > current.id)
  );
}

async function listAllSnapshots(
  analytics: ReturnType<typeof createAnalyticsRepository>,
  input: { organizationId: string; brandId: string; periodStart?: Date; periodEnd?: Date },
) {
  const result: Snapshot[] = [];
  let cursor: string | undefined;
  do {
    const page = await analytics.listSnapshots({
      ...input,
      take: pageSize,
      ...(cursor ? { cursor } : {}),
    });
    result.push(...page);
    cursor = page.length === pageSize ? page.at(-1)?.id : undefined;
  } while (cursor);
  return result;
}

export function createAnalyticsDashboardService(
  options: {
    tenantRepository?: ReturnType<typeof createTenantRepository>;
    analyticsRepository?: ReturnType<typeof createAnalyticsRepository>;
  } = {},
) {
  const tenants = options.tenantRepository ?? createTenantRepository();
  const analytics = options.analyticsRepository ?? createAnalyticsRepository();

  return {
    async get(
      actor: DashboardActor,
      input: { periodStart?: Date; periodEnd?: Date } = {},
    ): Promise<AnalyticsDashboard> {
      if (input.periodStart && input.periodEnd && input.periodStart > input.periodEnd) {
        throw new Error('Analytics dashboard period must not end before it starts.');
      }
      const context = await resolveTenantContext(actor, tenants);
      requirePermission(context, 'brand:read');
      if (!context.brandId)
        throw new AccessDeniedError('Analytics dashboard requires a brand context.');

      const snapshots = await listAllSnapshots(analytics, {
        organizationId: context.organizationId,
        brandId: context.brandId,
        ...input,
      });
      const latestByPublication = new Map<string, Snapshot>();
      for (const snapshot of snapshots) {
        const current = latestByPublication.get(snapshot.publicationId);
        if (!current || isNewer(snapshot, current))
          latestByPublication.set(snapshot.publicationId, snapshot);
      }

      const totals = {
        views: emptyMetric(),
        reach: emptyMetric(),
        impressions: emptyMetric(),
        engagement: emptyMetric(),
        clicks: emptyMetric(),
        followersDelta: emptyMetric(),
      };
      const platforms = new Map<
        string,
        {
          publications: number;
          views: ReportedMetric;
          reach: ReportedMetric;
          engagement: ReportedMetric;
          clicks: ReportedMetric;
        }
      >();
      const pillars = new Map<string, { publications: number; engagement: ReportedMetric }>();
      const topics = new Map<string, { publications: number; engagement: ReportedMetric }>();
      const content: ContentPerformance[] = [];

      for (const snapshot of latestByPublication.values()) {
        const currentEngagement = engagement(snapshot);
        totals.views = addMetric(totals.views, snapshot.views);
        totals.reach = addMetric(totals.reach, snapshot.reach);
        totals.impressions = addMetric(totals.impressions, snapshot.impressions);
        totals.engagement = {
          value: totals.engagement.value + currentEngagement.value,
          reported: totals.engagement.reported || currentEngagement.reported,
        };
        totals.clicks = addMetric(totals.clicks, snapshot.clicks);
        totals.followersDelta = addMetric(totals.followersDelta, snapshot.followersDelta);

        const platform = snapshot.publication.socialAccount.platform;
        const platformTotals = platforms.get(platform) ?? {
          publications: 0,
          views: emptyMetric(),
          reach: emptyMetric(),
          engagement: emptyMetric(),
          clicks: emptyMetric(),
        };
        platformTotals.publications += 1;
        platformTotals.views = addMetric(platformTotals.views, snapshot.views);
        platformTotals.reach = addMetric(platformTotals.reach, snapshot.reach);
        platformTotals.engagement = {
          value: platformTotals.engagement.value + currentEngagement.value,
          reported: platformTotals.engagement.reported || currentEngagement.reported,
        };
        platformTotals.clicks = addMetric(platformTotals.clicks, snapshot.clicks);
        platforms.set(platform, platformTotals);

        const updateGroup = (
          groups: Map<string, { publications: number; engagement: ReportedMetric }>,
          name: string | null,
        ) => {
          if (!name) return;
          const group = groups.get(name) ?? { publications: 0, engagement: emptyMetric() };
          group.publications += 1;
          group.engagement = {
            value: group.engagement.value + currentEngagement.value,
            reported: group.engagement.reported || currentEngagement.reported,
          };
          groups.set(name, group);
        };
        updateGroup(pillars, snapshot.publication.contentProject.pillar?.name ?? null);
        updateGroup(topics, snapshot.publication.contentProject.opportunity?.title ?? null);

        const base = audience(snapshot);
        content.push({
          publicationId: snapshot.publicationId,
          title: snapshot.publication.contentProject.title,
          platform,
          pillar: snapshot.publication.contentProject.pillar?.name ?? null,
          topic: snapshot.publication.contentProject.opportunity?.title ?? null,
          engagement: currentEngagement.value,
          engagementRate:
            base && currentEngagement.reported ? currentEngagement.value / base : null,
          reach: metric(snapshot.reach),
          views: metric(snapshot.views),
        });
      }

      const ranked = content
        .filter((item) => item.engagementRate !== null)
        .sort(
          (left, right) =>
            right.engagementRate! - left.engagementRate! ||
            right.engagement - left.engagement ||
            left.publicationId.localeCompare(right.publicationId),
        );
      const groupEntries = (
        groups: Map<string, { publications: number; engagement: ReportedMetric }>,
      ) =>
        [...groups.entries()]
          .map(([name, value]) => ({ name, ...value }))
          .sort(
            (left, right) =>
              right.engagement.value - left.engagement.value || left.name.localeCompare(right.name),
          );

      return {
        ...input,
        snapshotCount: snapshots.length,
        totals,
        platforms: [...platforms.entries()]
          .map(([platform, value]) => ({ platform, ...value }))
          .sort((left, right) => left.platform.localeCompare(right.platform)),
        pillars: groupEntries(pillars),
        topics: groupEntries(topics),
        topContent: ranked.slice(0, 5),
        worstContent: [...ranked].reverse().slice(0, 5),
      };
    },
  };
}
