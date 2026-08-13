import 'dotenv/config';
import {
  AccessDeniedError,
  createPublishingService,
  createSocialTokenRefreshService,
  createTokenEncryptor,
  SocialTokenRefreshError,
  resolveTenantContext,
} from '../../packages/core/src/index.js';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';
import {
  MockPublishingProvider,
  type SocialOAuthTokenRefreshProvider,
} from '../../packages/providers/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const encryptor = createTokenEncryptor(Buffer.alloc(32, 23).toString('base64'));
const slug = 'social-account-audit-contract';
const email = `${slug}@local`;
const now = new Date('2026-08-12T12:00:00.000Z');

class RejectedVkRefreshProvider implements SocialOAuthTokenRefreshProvider {
  public readonly platform = 'VK' as const;

  async refreshToken() {
    throw new Error('Provider rejected refresh.');
  }
}

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { organization: { slug: { startsWith: slug } } } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: slug } } });
  await prisma.$disconnect();
});

describe('social account audit events', () => {
  it('records connect, disconnect, expiry and refresh failure without tokens or cross-brand leakage', async () => {
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
    const first = await tenants.createBrand({
      organizationId: organization.id,
      name: 'First audit brand',
      slug: 'first-audit',
    });
    const second = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Second audit brand',
      slug: 'second-audit',
    });
    const firstContext = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: first.id },
      tenants,
    );
    const secondContext = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: second.id },
      tenants,
    );
    const publishing = createPublishingService({
      prisma,
      tenantRepository: tenants,
      encryptor,
      providers: {
        VK: new MockPublishingProvider('VK'),
        INSTAGRAM: new MockPublishingProvider('INSTAGRAM'),
      },
    });
    const connected = await publishing.connectAccount(firstContext, {
      platform: 'VK',
      externalAccountId: 'connected-audit',
      name: 'Connected audit account',
      accessToken: 'connect-access-secret',
      refreshToken: 'connect-refresh-secret',
    });
    await expect(publishing.disconnectAccount(secondContext, connected.id)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
    const disconnected = await publishing.disconnectAccount(firstContext, connected.id);
    expect(disconnected.status).toBe('DISCONNECTED');
    await expect(
      prisma.socialCredential.findUnique({ where: { socialAccountId: connected.id } }),
    ).resolves.toBeNull();

    const expiring = await prisma.socialAccount.create({
      data: {
        brandId: first.id,
        platform: 'VK',
        externalAccountId: 'expired-audit',
        name: 'Expired audit account',
      },
    });
    await prisma.socialCredential.create({
      data: {
        socialAccountId: expiring.id,
        accessTokenCiphertext: encryptor.encrypt('expiry-access-secret'),
        encryptionVersion: encryptor.encryptionVersion,
      },
    });
    const failing = await prisma.socialAccount.create({
      data: {
        brandId: first.id,
        platform: 'VK',
        externalAccountId: 'failed-audit',
        name: 'Failed audit account',
      },
    });
    await prisma.socialCredential.create({
      data: {
        socialAccountId: failing.id,
        accessTokenCiphertext: encryptor.encrypt('failure-access-secret'),
        refreshTokenCiphertext: encryptor.encrypt('failure-refresh-secret'),
        expiresAt: new Date('2026-08-12T11:00:00.000Z'),
        encryptionVersion: encryptor.encryptionVersion,
      },
    });
    const refresh = createSocialTokenRefreshService({
      prisma,
      tenantRepository: tenants,
      encryptor,
      providers: { VK: new RejectedVkRefreshProvider() },
      now: () => now,
    });
    await expect(refresh.refreshIfDue(firstContext, expiring.id)).rejects.toBeInstanceOf(
      SocialTokenRefreshError,
    );
    await expect(refresh.refreshIfDue(firstContext, failing.id)).rejects.toBeInstanceOf(
      SocialTokenRefreshError,
    );

    const events = await prisma.auditLog.findMany({
      where: { organizationId: organization.id, brandId: first.id, entityType: 'SocialAccount' },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((event) => event.action)).toEqual([
      'social.connect',
      'social.disconnect',
      'social.expired',
      'social.refresh_failed',
    ]);
    expect(events.every((event) => event.actorUserId === user.id)).toBe(true);
    expect(JSON.stringify(events)).not.toContain('secret');
    await expect(
      prisma.auditLog.count({
        where: { organizationId: organization.id, brandId: second.id, entityType: 'SocialAccount' },
      }),
    ).resolves.toBe(0);
  });
});
