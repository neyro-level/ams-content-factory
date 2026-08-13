import 'dotenv/config';
import { createAnalyticsDashboardService } from '../../packages/core/src/index.js';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const slug = 'analytics-dashboard-contract';
const email = `${slug}@local`;

async function createPublication(input: {
  organizationId: string;
  brandId: string;
  title: string;
  platform: 'VK' | 'INSTAGRAM';
  accountId: string;
  pillarName?: string;
  topic?: string;
}) {
  const pillar = input.pillarName
    ? await prisma.contentPillar.create({
        data: { brandId: input.brandId, name: input.pillarName },
      })
    : null;
  const opportunity = input.topic
    ? await prisma.contentOpportunity.create({
        data: { brandId: input.brandId, title: input.topic, angle: 'Dashboard test angle' },
      })
    : null;
  const project = await prisma.contentProject.create({
    data: {
      organizationId: input.organizationId,
      brandId: input.brandId,
      title: input.title,
      contentType: 'SOCIAL_POST',
      status: 'APPROVED',
      pillarId: pillar?.id,
      opportunityId: opportunity?.id,
    },
  });
  const variant = await prisma.platformVariant.create({
    data: { contentProjectId: project.id, platform: input.platform, caption: input.title },
  });
  const account = await prisma.socialAccount.create({
    data: {
      brandId: input.brandId,
      platform: input.platform,
      externalAccountId: input.accountId,
      name: `${input.title} account`,
    },
  });
  return prisma.publication.create({
    data: {
      organizationId: input.organizationId,
      brandId: input.brandId,
      contentProjectId: project.id,
      platformVariantId: variant.id,
      socialAccountId: account.id,
      status: 'PUBLISHED',
      publishedAt: new Date('2026-08-12T00:00:00.000Z'),
      externalPostId: `${input.platform.toLowerCase()}-${input.title}`,
    },
  });
}

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('analytics dashboard', () => {
  it('aggregates the latest in-scope snapshot without fabricating unavailable metrics', async () => {
    await prisma.organization.deleteMany({ where: { slug } });
    const user = await prisma.user.upsert({
      where: { email },
      create: { name: slug, email },
      update: {},
    });
    const organization = await tenants.createOrganizationWithOwner({
      ownerUserId: user.id,
      name: slug,
      slug,
    });
    const first = await tenants.createBrand({
      organizationId: organization.id,
      ownerUserId: user.id,
      name: 'Dashboard first',
      slug: 'dashboard-first',
    });
    const second = await tenants.createBrand({
      organizationId: organization.id,
      ownerUserId: user.id,
      name: 'Dashboard second',
      slug: 'dashboard-second',
    });
    const high = await createPublication({
      organizationId: organization.id,
      brandId: first.id,
      title: 'High engagement content',
      platform: 'VK',
      accountId: 'dashboard-vk',
      pillarName: 'Expertise',
      topic: 'Research topic',
    });
    const low = await createPublication({
      organizationId: organization.id,
      brandId: first.id,
      title: 'Low engagement content',
      platform: 'INSTAGRAM',
      accountId: 'dashboard-instagram',
      pillarName: 'Cases',
    });
    const foreign = await createPublication({
      organizationId: organization.id,
      brandId: second.id,
      title: 'Foreign dashboard content',
      platform: 'VK',
      accountId: 'dashboard-foreign',
      pillarName: 'Foreign',
    });
    await prisma.metricSnapshot.createMany({
      data: [
        {
          brandId: first.id,
          publicationId: high.id,
          capturedAt: new Date('2026-08-13T00:00:00.000Z'),
          views: 50,
          reach: 40,
          likes: 2,
          rawMetrics: {},
        },
        {
          brandId: first.id,
          publicationId: high.id,
          capturedAt: new Date('2026-08-14T00:00:00.000Z'),
          views: 120,
          reach: 100,
          likes: 10,
          comments: 2,
          shares: 3,
          clicks: 5,
          followersDelta: 1,
          rawMetrics: {},
        },
        {
          brandId: first.id,
          publicationId: low.id,
          capturedAt: new Date('2026-08-14T00:00:00.000Z'),
          impressions: 200,
          likes: 1,
          comments: 1,
          rawMetrics: {},
        },
        {
          brandId: second.id,
          publicationId: foreign.id,
          capturedAt: new Date('2026-08-14T00:00:00.000Z'),
          reach: 999,
          likes: 999,
          rawMetrics: {},
        },
      ],
    });

    const dashboard = await createAnalyticsDashboardService({ tenantRepository: tenants }).get({
      userId: user.id,
      organizationId: organization.id,
      brandId: first.id,
    });

    expect(dashboard.snapshotCount).toBe(3);
    expect(dashboard.totals.views).toEqual({ value: 120, reported: true });
    expect(dashboard.totals.reach).toEqual({ value: 100, reported: true });
    expect(dashboard.totals.engagement).toEqual({ value: 17, reported: true });
    expect(dashboard.totals.clicks).toEqual({ value: 5, reported: true });
    expect(dashboard.totals.followersDelta).toEqual({ value: 1, reported: true });
    expect(dashboard.platforms).toEqual([
      expect.objectContaining({
        platform: 'INSTAGRAM',
        publications: 1,
        reach: { value: 0, reported: false },
      }),
      expect.objectContaining({
        platform: 'VK',
        publications: 1,
        reach: { value: 100, reported: true },
      }),
    ]);
    expect(dashboard.pillars).toEqual([
      expect.objectContaining({ name: 'Expertise', engagement: { value: 15, reported: true } }),
      expect.objectContaining({ name: 'Cases', engagement: { value: 2, reported: true } }),
    ]);
    expect(dashboard.topics).toEqual([
      expect.objectContaining({ name: 'Research topic', publications: 1 }),
    ]);
    expect(dashboard.topContent[0]).toMatchObject({
      title: 'High engagement content',
      engagementRate: 0.15,
    });
    expect(dashboard.worstContent[0]).toMatchObject({
      title: 'Low engagement content',
      engagementRate: 0.01,
    });
    expect(JSON.stringify(dashboard)).not.toContain('Foreign dashboard content');
  });
});
