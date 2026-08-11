import 'dotenv/config';
import {
  createContentService,
  createPublishingService,
  createTokenEncryptor,
  PublicationOutcomeUnknownError,
  resolveTenantContext,
} from '../../packages/core/src/index.js';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';
import {
  MockPublishingProvider,
  type PublishingProvider,
} from '../../packages/providers/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

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
    const credential = await prisma.socialCredential.findUnique({
      where: { socialAccountId: account.id },
    });
    expect(credential!.accessTokenCiphertext).not.toContain('sensitive-token');
    const publication = await service.create(firstContext, {
      contentProjectId: project!.id,
      platformVariantId: variant.id,
      socialAccountId: account.id,
    });
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
});
