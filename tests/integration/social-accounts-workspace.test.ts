import 'dotenv/config';
import {
  AccessDeniedError,
  createSocialAccountsWorkspaceService,
} from '../../packages/core/src/index.js';
import {
  createPrismaClient,
  createPublishingRepository,
  createTenantRepository,
} from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const publishing = createPublishingRepository(prisma);
const slug = 'social-accounts-workspace-contract';
const email = `${slug}@local`;

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: slug } } });
  await prisma.$disconnect();
});

describe('social accounts workspace', () => {
  it('lists only the verified brand accounts and never returns credentials', async () => {
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
      name: 'First social brand',
      slug: 'first-social',
    });
    const second = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Second social brand',
      slug: 'second-social',
    });
    const firstAccount = await publishing.createSocialAccount({
      organizationId: organization.id,
      brandId: first.id,
      platform: 'VK',
      externalAccountId: 'vk-first',
      name: 'First VK',
      username: 'first_vk',
    });
    const secondAccount = await publishing.createSocialAccount({
      organizationId: organization.id,
      brandId: second.id,
      platform: 'INSTAGRAM',
      externalAccountId: 'instagram-second',
      name: 'Second Instagram',
    });
    await prisma.socialAccount.update({
      where: { id: secondAccount!.id },
      data: { status: 'EXPIRED' },
    });
    await prisma.socialCredential.create({
      data: {
        socialAccountId: firstAccount!.id,
        accessTokenCiphertext: 'ciphertext-not-for-workspace',
        encryptionVersion: 'test',
      },
    });

    const workspace = createSocialAccountsWorkspaceService({
      tenantRepository: tenants,
      publishingRepository: publishing,
    });
    const actor = { userId: user.id, organizationId: organization.id, brandId: first.id };
    await expect(workspace.list(actor)).resolves.toEqual([
      expect.objectContaining({
        id: firstAccount!.id,
        platform: 'VK',
        status: 'CONNECTED',
        username: 'first_vk',
      }),
    ]);
    await expect(workspace.list({ ...actor, brandId: second.id })).resolves.toEqual([
      expect.objectContaining({ id: secondAccount!.id, platform: 'INSTAGRAM', status: 'EXPIRED' }),
    ]);
    const visible = await workspace.list(actor);
    expect(JSON.stringify(visible)).not.toContain('ciphertext-not-for-workspace');
  });

  it('rejects an active user trying to bind a foreign organization to the route', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const foreignOrganization = await tenants.createOrganizationWithOwner({
      ownerUserId: user.id,
      name: `${slug} foreign`,
      slug: `${slug}-foreign`,
    });
    const foreignBrand = await tenants.createBrand({
      organizationId: foreignOrganization.id,
      name: 'Foreign social brand',
      slug: 'foreign-social',
    });
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug } });
    const ownBrand = await prisma.brand.findFirstOrThrow({
      where: { organizationId: organization.id, slug: 'first-social' },
    });
    const workspace = createSocialAccountsWorkspaceService({
      tenantRepository: tenants,
      publishingRepository: publishing,
    });

    await expect(
      workspace.list({
        userId: user.id,
        organizationId: organization.id,
        brandId: foreignBrand.id,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      workspace.list({
        userId: user.id,
        organizationId: foreignOrganization.id,
        brandId: ownBrand.id,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
