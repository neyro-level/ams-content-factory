import 'dotenv/config';
import { createResearchService, resolveTenantContext } from '../../packages/core/src/index.js';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';
import { MockPageFetcherProvider } from '../../packages/providers/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const suffix = 'research-isolation-contract';

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: suffix } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: suffix } } });
  await prisma.$disconnect();
});

describe('research isolation', () => {
  it('deduplicates within a brand and never exposes research across brands', async () => {
    await prisma.organization.deleteMany({ where: { slug: suffix } });
    const user = await prisma.user.upsert({
      where: { email: `${suffix}@local` },
      create: { name: suffix, email: `${suffix}@local` },
      update: {},
    });
    const organization = await tenants.createOrganizationWithOwner({
      ownerUserId: user.id,
      name: suffix,
      slug: suffix,
    });
    const first = await tenants.createBrand({
      organizationId: organization.id,
      name: 'First',
      slug: 'first',
    });
    const second = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Second',
      slug: 'second',
    });
    const firstContext = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: first.id },
      tenants,
    );
    const secondContext = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: second.id },
      tenants,
    );
    const service = createResearchService({
      prisma,
      pageFetcher: new MockPageFetcherProvider({
        'https://example.com/a': {
          title: 'Source',
          finalUrl: 'https://example.com/a',
          content: 'Verified research source.',
        },
      }),
    });
    const firstItem = await service.ingest({
      kind: 'URL',
      context: firstContext,
      title: 'Source',
      sourceUrl: 'https://example.com/a',
    });
    const repeated = await service.ingest({
      kind: 'URL',
      context: firstContext,
      title: 'Source',
      sourceUrl: 'https://example.com/a',
    });
    expect(repeated?.id).toBe(firstItem?.id);
    expect(await service.list(secondContext)).toEqual([]);
    expect(await service.list(firstContext)).toEqual([
      expect.objectContaining({
        id: firstItem?.id,
        source: expect.objectContaining({ canonicalUrl: 'https://example.com/a' }),
      }),
    ]);
  });
});
