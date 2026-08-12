import 'dotenv/config';
import {
  createContentService,
  createPublishingService,
  createTokenEncryptor,
  PublicationDispatchInProgressError,
  PublicationOutcomeUnknownError,
  PublicationTransitionError,
  resolveTenantContext,
} from '../../packages/core/src/index.js';
import {
  createPrismaClient,
  createPublishingRepository,
  createTenantRepository,
} from '../../packages/db/src/index.js';
import {
  MockPublishingProvider,
  type PublishingProvider,
} from '../../packages/providers/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';
import { CountingPublishingProvider } from '../helpers/failure-harness.js';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const slug = 'publishing-contract';
const email = `${slug}@local`;
const encryptor = createTokenEncryptor(Buffer.alloc(32, 7).toString('base64'));

class UnknownPublishingProvider implements PublishingProvider {
  public readonly platform = 'VK' as const;

  async publish() {
    return {
      status: 'OUTCOME_UNKNOWN' as const,
      providerOperation: 'mock:vk:publish',
      providerJobId: 'uncertain-job',
    };
  }

  async getStatus() {
    return { status: 'NOT_FOUND' as const };
  }
}

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('publishing foundation', () => {
  it('encrypts credentials, publishes idempotently and isolates brands', async () => {
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
    const content = createContentService({ prisma });
    const project = await content.create(firstContext, {
      title: 'Publishing project',
      contentType: 'SOCIAL_POST',
    });
    const variant = await prisma.platformVariant.create({
      data: { contentProjectId: project!.id, platform: 'VK', caption: 'Publication text' },
    });
    const service = createPublishingService({
      prisma,
      encryptor,
      providers: {
        INSTAGRAM: new MockPublishingProvider('INSTAGRAM'),
        VK: new MockPublishingProvider('VK'),
      },
    });
    const account = await service.connectAccount(firstContext, {
      platform: 'VK',
      externalAccountId: 'account-one',
      name: 'Account one',
      accessToken: 'sensitive-token',
    });
    const foreignAccount = await service.connectAccount(secondContext, {
      platform: 'VK',
      externalAccountId: 'account-two',
      name: 'Account two',
      accessToken: 'sensitive-token-two',
    });
    const credential = await prisma.socialCredential.findUnique({
      where: { socialAccountId: account.id },
    });
    expect(credential!.accessTokenCiphertext).not.toContain('sensitive-token');
    const publication = await service.create(firstContext, {
      contentProjectId: project!.id,
      platformVariantId: variant.id,
      socialAccountId: account.id,
    });
    await expect(
      service.create(firstContext, {
        contentProjectId: project!.id,
        platformVariantId: variant.id,
        socialAccountId: foreignAccount.id,
      }),
    ).rejects.toThrow('Publication references are outside the active tenant');
    await expect(service.schedule(secondContext, publication.id)).rejects.toThrow(
      'outside the active tenant',
    );
    const published = await service.publish(firstContext, {
      id: publication.id,
      idempotencyKey: 'publication-one',
    });
    expect(published.status).toBe('PUBLISHED');
    expect(published.externalPostId).toBeTruthy();
    await expect(
      service.publish(firstContext, { id: publication.id, idempotencyKey: 'publication-one' }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PUBLISHED' }));
    await expect(service.schedule(firstContext, publication.id)).rejects.toBeInstanceOf(
      PublicationTransitionError,
    );
    expect(
      await prisma.publicationAttempt.count({ where: { publicationId: publication.id } }),
    ).toBe(1);
  });

  it('does not retry an uncertain provider mutation before investigation', async () => {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const brand = await prisma.brand.findFirstOrThrow({
      where: { organizationId: organization.id, slug: 'first' },
    });
    const context = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: brand.id },
      tenants,
    );
    const content = createContentService({ prisma });
    const project = await content.create(context, {
      title: 'Unknown project',
      contentType: 'SOCIAL_POST',
    });
    const variant = await prisma.platformVariant.create({
      data: { contentProjectId: project!.id, platform: 'VK', caption: 'Uncertain text' },
    });
    const account = await prisma.socialAccount.findFirstOrThrow({
      where: { brandId: brand.id, platform: 'VK' },
    });
    const service = createPublishingService({
      prisma,
      encryptor,
      providers: {
        INSTAGRAM: new MockPublishingProvider('INSTAGRAM'),
        VK: new UnknownPublishingProvider(),
      },
    });
    const publication = await service.create(context, {
      contentProjectId: project!.id,
      platformVariantId: variant.id,
      socialAccountId: account.id,
    });
    await expect(
      service.publish(context, { id: publication.id, idempotencyKey: 'unknown-one' }),
    ).rejects.toBeInstanceOf(PublicationOutcomeUnknownError);
    await expect(service.schedule(context, publication.id)).rejects.toBeInstanceOf(
      PublicationTransitionError,
    );
    await expect(
      service.publish(context, { id: publication.id, idempotencyKey: 'unknown-one' }),
    ).rejects.toBeInstanceOf(PublicationOutcomeUnknownError);
    expect(
      await prisma.publicationAttempt.count({ where: { publicationId: publication.id } }),
    ).toBe(1);
    await expect(service.investigate(context, publication.id)).resolves.toEqual(
      expect.objectContaining({ status: 'QUEUED' }),
    );
  });

  it('reconciles a provider success when final persistence fails without a second publish', async () => {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const brand = await prisma.brand.findFirstOrThrow({
      where: { organizationId: organization.id, slug: 'first' },
    });
    const context = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: brand.id },
      tenants,
    );
    const content = createContentService({ prisma });
    const project = await content.create(context, {
      title: 'Persistence failure reconciliation project',
      contentType: 'SOCIAL_POST',
    });
    const variant = await prisma.platformVariant.create({
      data: { contentProjectId: project!.id, platform: 'VK', caption: 'Reconcile text' },
    });
    const account = await prisma.socialAccount.findFirstOrThrow({
      where: { brandId: brand.id, platform: 'VK' },
    });
    const baseRepository = createPublishingRepository(prisma);
    let failFinalPersistence = true;
    const repository = {
      ...baseRepository,
      updatePublication: async (input: Parameters<typeof baseRepository.updatePublication>[0]) => {
        if (failFinalPersistence && input.from === 'PUBLISHING' && input.to === 'PUBLISHED') {
          failFinalPersistence = false;
          throw new Error('Simulated database failure after provider success.');
        }
        return baseRepository.updatePublication(input);
      },
    };
    const provider = new CountingPublishingProvider(new MockPublishingProvider('VK'));
    const service = createPublishingService({
      repository,
      encryptor,
      providers: {
        INSTAGRAM: new MockPublishingProvider('INSTAGRAM'),
        VK: provider,
      },
    });
    const publication = await service.create(context, {
      contentProjectId: project!.id,
      platformVariantId: variant.id,
      socialAccountId: account.id,
    });

    await expect(
      service.publish(context, { id: publication.id, idempotencyKey: 'persistence-failure-one' }),
    ).rejects.toBeInstanceOf(PublicationOutcomeUnknownError);
    expect(provider.publishCalls).toBe(1);
    await expect(
      service.publish(context, { id: publication.id, idempotencyKey: 'persistence-failure-one' }),
    ).rejects.toBeInstanceOf(PublicationOutcomeUnknownError);
    expect(provider.publishCalls).toBe(1);
    await expect(service.investigate(context, publication.id)).resolves.toEqual(
      expect.objectContaining({ status: 'PUBLISHED' }),
    );
    expect(provider.getStatusCalls).toBe(1);
  });

  it('atomically acquires one logical attempt across twenty parallel identical dispatches', async () => {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const brand = await prisma.brand.findFirstOrThrow({
      where: { organizationId: organization.id, slug: 'first' },
    });
    const context = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: brand.id },
      tenants,
    );
    const content = createContentService({ prisma });
    const project = await content.create(context, {
      title: 'Atomic attempt project',
      contentType: 'SOCIAL_POST',
    });
    const variant = await prisma.platformVariant.create({
      data: { contentProjectId: project!.id, platform: 'VK', caption: 'Atomic attempt text' },
    });
    const account = await prisma.socialAccount.findFirstOrThrow({
      where: { brandId: brand.id, platform: 'VK' },
    });
    const provider = new CountingPublishingProvider(new MockPublishingProvider('VK'));
    const service = createPublishingService({
      prisma,
      encryptor,
      providers: {
        INSTAGRAM: new MockPublishingProvider('INSTAGRAM'),
        VK: provider,
      },
    });
    const publication = await service.create(context, {
      contentProjectId: project!.id,
      platformVariantId: variant.id,
      socialAccountId: account.id,
    });
    await service.schedule(context, publication.id);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        service.publish(context, { id: publication.id, idempotencyKey: 'parallel-attempt-one' }),
      ),
    );
    const unexpected = results.filter(
      (result) =>
        result.status === 'rejected' &&
        !(result.reason instanceof PublicationDispatchInProgressError),
    );
    expect(unexpected).toHaveLength(0);
    expect(provider.publishCalls).toBe(1);
    expect(
      await prisma.publicationAttempt.count({
        where: { publicationId: publication.id, idempotencyKey: 'parallel-attempt-one' },
      }),
    ).toBe(1);
    await expect(
      prisma.publication.findUniqueOrThrow({ where: { id: publication.id } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PUBLISHED' }));
  });

  it('recovers an interrupted legacy preparation state without entering it for new dispatches', async () => {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const brand = await prisma.brand.findFirstOrThrow({
      where: { organizationId: organization.id, slug: 'first' },
    });
    const context = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: brand.id },
      tenants,
    );
    const content = createContentService({ prisma });
    const project = await content.create(context, {
      title: 'Legacy preparation recovery project',
      contentType: 'SOCIAL_POST',
    });
    const variant = await prisma.platformVariant.create({
      data: { contentProjectId: project!.id, platform: 'VK', caption: 'Recovery text' },
    });
    const account = await prisma.socialAccount.findFirstOrThrow({
      where: { brandId: brand.id, platform: 'VK' },
    });
    const service = createPublishingService({
      prisma,
      encryptor,
      providers: {
        INSTAGRAM: new MockPublishingProvider('INSTAGRAM'),
        VK: new MockPublishingProvider('VK'),
      },
    });
    const publication = await service.create(context, {
      contentProjectId: project!.id,
      platformVariantId: variant.id,
      socialAccountId: account.id,
    });
    await prisma.publication.update({
      where: { id: publication.id },
      data: { status: 'PREPARING' },
    });

    await expect(service.recover(context, publication.id)).resolves.toEqual(
      expect.objectContaining({ status: 'QUEUED' }),
    );
    await expect(service.recover(context, publication.id)).rejects.toBeInstanceOf(
      PublicationTransitionError,
    );
  });
});
