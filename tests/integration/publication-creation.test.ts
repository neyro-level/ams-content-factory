import 'dotenv/config';
import {
  createContentService,
  createPublishingService,
  createTokenEncryptor,
  resolveTenantContext,
} from '../../packages/core/src/index.js';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';
import { MockPublishingProvider } from '../../packages/providers/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const encryptor = createTokenEncryptor(Buffer.alloc(32, 29).toString('base64'));
const slug = 'publication-creation-contract';
const email = `${slug}@local`;

async function approveProject(
  service: ReturnType<typeof createContentService>,
  context: Awaited<ReturnType<typeof resolveTenantContext>>,
  id: string,
) {
  for (const status of ['RESEARCHING', 'DRAFT', 'FACT_CHECK', 'REVIEW', 'APPROVED'] as const) {
    await service.transition(context, id, status);
  }
}

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { organization: { slug: { startsWith: slug } } } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: slug } } });
  await prisma.$disconnect();
});

describe('publication creation', () => {
  it('creates a DRAFT only from an approved project, matching variant and connected scoped account', async () => {
    await prisma.auditLog.deleteMany({ where: { organization: { slug } } });
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
    const brand = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Publication brand',
      slug: 'publication-brand',
    });
    const other = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Other publication brand',
      slug: 'other-publication-brand',
    });
    const context = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: brand.id },
      tenants,
    );
    const content = createContentService({ prisma });
    const project = await content.create(context, {
      title: 'Approved publication project',
      contentType: 'SOCIAL_POST',
    });
    const variant = await prisma.platformVariant.create({
      data: { contentProjectId: project!.id, platform: 'VK', caption: 'Ready caption' },
    });
    const publishing = createPublishingService({
      prisma,
      encryptor,
      providers: {
        VK: new MockPublishingProvider('VK'),
        INSTAGRAM: new MockPublishingProvider('INSTAGRAM'),
      },
    });
    const account = await publishing.connectAccount(context, {
      platform: 'VK',
      externalAccountId: 'vk-publication',
      name: 'VK publication account',
      accessToken: 'publication-access-token',
    });

    await expect(
      publishing.create(context, {
        contentProjectId: project!.id,
        platformVariantId: variant.id,
        socialAccountId: account.id,
      }),
    ).rejects.toThrow('Publication references are outside the active tenant');

    await approveProject(content, context, project!.id);
    const publication = await publishing.create(context, {
      contentProjectId: project!.id,
      platformVariantId: variant.id,
      socialAccountId: account.id,
    });
    expect(publication).toEqual(
      expect.objectContaining({
        status: 'DRAFT',
        scheduledAt: null,
        contentProjectId: project!.id,
      }),
    );

    const instagramAccount = await publishing.connectAccount(context, {
      platform: 'INSTAGRAM',
      externalAccountId: 'instagram-publication',
      name: 'Instagram publication account',
      accessToken: 'instagram-access-token',
    });
    await expect(
      publishing.create(context, {
        contentProjectId: project!.id,
        platformVariantId: variant.id,
        socialAccountId: instagramAccount.id,
      }),
    ).rejects.toThrow('Publication references are outside the active tenant');
    await expect(
      publishing.create(
        { ...context, brandId: other.id },
        {
          contentProjectId: project!.id,
          platformVariantId: variant.id,
          socialAccountId: account.id,
        },
      ),
    ).rejects.toThrow('Publication references are outside the active tenant');
  });
});
