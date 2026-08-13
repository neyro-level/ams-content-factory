import 'dotenv/config';
import {
  createResearchService,
  createResearchWorkspaceService,
  ResearchInProgressError,
  resolveTenantContext,
} from '../../packages/core/src/index.js';
import {
  createPrismaClient,
  createResearchRepository,
  createTenantRepository,
  ResearchInboxStatus,
} from '../../packages/db/src/index.js';
import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns/promises')>();
  return {
    ...actual,
    lookup: async (hostname: string) => {
      if (hostname === 'example.com') return [{ address: '93.184.216.34', family: 4 }];
      return actual.lookup(hostname, { all: true, verbatim: true });
    },
  };
});

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
    const service = createResearchService({ prisma });
    const firstItem = await service.ingest({
      kind: 'TEXT',
      context: firstContext,
      title: 'Source',
      content: 'Verified research source.',
    });
    const repeated = await service.ingest({
      kind: 'TEXT',
      context: firstContext,
      title: 'Source',
      content: 'Verified research source.',
    });
    expect(repeated?.id).toBe(firstItem?.id);
    expect(await service.list(secondContext)).toEqual([]);
    expect(await service.list(firstContext)).toEqual([
      expect.objectContaining({
        id: firstItem?.id,
      }),
    ]);
  });

  it('rejects concurrent processing and retries a failed persistence path in a controlled transition', async () => {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug: suffix } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: `${suffix}@local` } });
    const brand = await prisma.brand.findFirstOrThrow({
      where: { organizationId: organization.id, slug: 'first' },
    });
    const context = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: brand.id },
      tenants,
    );
    const repository = createResearchRepository(prisma);
    const blockedContent = 'A source being processed by another worker.';
    const blockedChecksum = createHash('sha256').update(`TEXT\0\0${blockedContent}`).digest('hex');
    const blocked = await repository.createInboxItem({
      organizationId: organization.id,
      brandId: brand.id,
      kind: 'TEXT',
      title: 'Processing source',
      content: blockedContent,
      checksum: blockedChecksum,
    });
    await repository.transitionInboxStatus({
      organizationId: organization.id,
      brandId: brand.id,
      id: blocked!.id,
      from: ResearchInboxStatus.NEW,
      to: ResearchInboxStatus.PROCESSING,
    });
    await expect(
      createResearchService({ prisma }).ingest({
        kind: 'TEXT',
        context,
        title: 'Processing source',
        content: blockedContent,
      }),
    ).rejects.toBeInstanceOf(ResearchInProgressError);

    let failOnce = true;
    const retryService = createResearchService({
      prisma,
      repository: {
        ...repository,
        async createItem(input) {
          if (failOnce) {
            failOnce = false;
            throw new Error('Simulated research persistence failure.');
          }
          return repository.createItem(input);
        },
      },
    });
    const retryInput = {
      kind: 'TEXT' as const,
      context,
      title: 'Retry source',
      content: 'A source that succeeds after controlled retry.',
    };
    await expect(retryService.ingest(retryInput)).rejects.toThrow(
      'Simulated research persistence failure',
    );
    const failedInbox = await prisma.researchInboxItem.findFirstOrThrow({
      where: { organizationId: organization.id, brandId: brand.id, title: retryInput.title },
    });
    expect(failedInbox.status).toBe(ResearchInboxStatus.FAILED);
    await expect(retryService.ingest(retryInput)).resolves.toEqual(
      expect.objectContaining({ title: retryInput.title }),
    );
    await expect(
      prisma.researchInboxItem.findUnique({ where: { id: failedInbox.id } }),
    ).resolves.toEqual(expect.objectContaining({ status: ResearchInboxStatus.READY }));
  });

  it('allows only one live parallel request to process a source', async () => {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug: suffix } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: `${suffix}@local` } });
    const brand = await prisma.brand.findFirstOrThrow({
      where: { organizationId: organization.id, slug: 'first' },
    });
    const context = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: brand.id },
      tenants,
    );
    const repository = createResearchRepository(prisma);
    let releasePersistence: (() => void) | undefined;
    const persistenceStarted = new Promise<void>((resolve) => {
      releasePersistence = resolve;
    });
    let signalStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const service = createResearchService({
      prisma,
      repository: {
        ...repository,
        async createItem(input) {
          signalStarted!();
          await persistenceStarted;
          return repository.createItem(input);
        },
      },
    });
    const input = {
      kind: 'TEXT' as const,
      context,
      title: 'Parallel source',
      content: 'Only one request can process this source at a time.',
    };
    const first = service.ingest(input);
    await started;
    await expect(service.ingest(input)).rejects.toBeInstanceOf(ResearchInProgressError);
    releasePersistence!();
    await expect(first).resolves.toEqual(expect.objectContaining({ title: input.title }));
  });

  it('binds the workspace to the verified brand for URL ingestion, list, and search', async () => {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug: suffix } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: `${suffix}@local` } });
    const brand = await prisma.brand.findFirstOrThrow({
      where: { organizationId: organization.id, slug: 'first' },
    });
    const otherBrand = await prisma.brand.findFirstOrThrow({
      where: { organizationId: organization.id, slug: 'second' },
    });
    const fetchedUrls: string[] = [];
    const workspace = createResearchWorkspaceService({
      provider: {
        async fetchPage(url) {
          fetchedUrls.push(url);
          return {
            title: 'Verified URL source',
            content: 'Extracted content remains inside the verified brand boundary.',
            finalUrl: url,
          };
        },
        async search(query) {
          return [{ title: `Result for ${query}`, url: 'https://example.com/research' }];
        },
      },
    });
    const actor = { userId: user.id, organizationId: organization.id, brandId: brand.id };

    await expect(
      workspace.ingestUrl(actor, {
        title: 'URL source',
        sourceUrl: 'https://example.com/research',
      }),
    ).resolves.toEqual(expect.objectContaining({ title: 'Verified URL source' }));
    expect(fetchedUrls).toEqual(['https://example.com/research']);
    const visibleItems = await workspace.list(actor);
    expect(visibleItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Verified URL source', brandId: brand.id }),
      ]),
    );
    expect(visibleItems.every((item) => item.brandId === brand.id)).toBe(true);
    await expect(workspace.list({ ...actor, brandId: otherBrand.id })).resolves.toEqual([]);
    await expect(workspace.search(actor, 'tenant isolation')).resolves.toEqual([
      { title: 'Result for tenant isolation', url: 'https://example.com/research' },
    ]);
  });
});
