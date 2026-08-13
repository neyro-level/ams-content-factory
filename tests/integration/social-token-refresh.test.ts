import 'dotenv/config';
import {
  AccessDeniedError,
  createSocialTokenRefreshService,
  createTokenEncryptor,
  SocialTokenRefreshBlockedExternalError,
  SocialTokenRefreshError,
} from '../../packages/core/src/index.js';
import {
  createPrismaClient,
  createPublishingRepository,
  createTenantRepository,
} from '../../packages/db/src/index.js';
import type { SocialOAuthTokenRefreshProvider } from '../../packages/providers/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const publishing = createPublishingRepository(prisma);
const encryptor = createTokenEncryptor(Buffer.alloc(32, 19).toString('base64'));
const slug = 'social-token-refresh-contract';
const email = `${slug}@local`;
const currentTime = new Date('2026-08-12T12:00:00.000Z');

class RefreshingVkProvider implements SocialOAuthTokenRefreshProvider {
  public readonly platform = 'VK' as const;
  public calls: string[] = [];

  async refreshToken(input: { refreshToken: string }) {
    this.calls.push(input.refreshToken);
    return {
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: new Date('2026-08-12T14:00:00.000Z'),
    };
  }
}

class FailingVkProvider implements SocialOAuthTokenRefreshProvider {
  public readonly platform = 'VK' as const;

  async refreshToken() {
    throw new Error('Provider refresh rejected the credential.');
  }
}

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { organization: { slug: { startsWith: slug } } } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: slug } } });
  await prisma.$disconnect();
});

describe('controlled social token refresh', () => {
  it('refreshes only a due credential, replaces ciphertext atomically and keeps the brand boundary', async () => {
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
      name: 'First refresh brand',
      slug: 'first-refresh',
    });
    const second = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Second refresh brand',
      slug: 'second-refresh',
    });
    const account = await publishing.createSocialAccount({
      organizationId: organization.id,
      brandId: first.id,
      platform: 'VK',
      externalAccountId: 'refresh-vk',
      name: 'Refresh VK',
    });
    await publishing.upsertCredential({
      organizationId: organization.id,
      brandId: first.id,
      socialAccountId: account!.id,
      accessTokenCiphertext: encryptor.encrypt('old-access-token'),
      refreshTokenCiphertext: encryptor.encrypt('old-refresh-token'),
      expiresAt: new Date('2026-08-12T12:01:00.000Z'),
      encryptionVersion: encryptor.encryptionVersion,
    });
    const provider = new RefreshingVkProvider();
    const service = createSocialTokenRefreshService({
      prisma,
      encryptor,
      providers: { VK: provider },
      now: () => currentTime,
      refreshWindowMs: 5 * 60_000,
    });
    const actor = { userId: user.id, organizationId: organization.id, brandId: first.id };

    await expect(service.refreshIfDue(actor, account!.id)).resolves.toEqual(
      expect.objectContaining({ refreshed: true }),
    );
    expect(provider.calls).toEqual(['old-refresh-token']);
    const updated = await publishing.findSocialAccountCredential({
      organizationId: organization.id,
      brandId: first.id,
      id: account!.id,
    });
    expect(updated).toEqual(expect.objectContaining({ status: 'CONNECTED' }));
    expect(encryptor.decrypt(updated!.credential!.accessTokenCiphertext)).toBe('new-access-token');
    expect(encryptor.decrypt(updated!.credential!.refreshTokenCiphertext!)).toBe(
      'new-refresh-token',
    );
    expect(updated!.credential!.expiresAt).toEqual(new Date('2026-08-12T14:00:00.000Z'));

    await expect(
      service.refreshIfDue({ ...actor, brandId: second.id }, account!.id),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it('does not call the provider before the configured refresh window', async () => {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const brand = await prisma.brand.findFirstOrThrow({
      where: { organizationId: organization.id, slug: 'first-refresh' },
    });
    const account = await prisma.socialAccount.findFirstOrThrow({
      where: { brandId: brand.id, externalAccountId: 'refresh-vk' },
    });
    const provider = new RefreshingVkProvider();
    const service = createSocialTokenRefreshService({
      prisma,
      encryptor,
      providers: { VK: provider },
      now: () => currentTime,
      refreshWindowMs: 5 * 60_000,
    });

    await expect(
      service.refreshIfDue(
        { userId: user.id, organizationId: organization.id, brandId: brand.id },
        account.id,
      ),
    ).resolves.toEqual(expect.objectContaining({ refreshed: false }));
    expect(provider.calls).toEqual([]);
  });

  it('does not turn absent provider configuration into a successful or failed refresh', async () => {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const brand = await prisma.brand.findFirstOrThrow({
      where: { organizationId: organization.id, slug: 'first-refresh' },
    });
    const account = await publishing.createSocialAccount({
      organizationId: organization.id,
      brandId: brand.id,
      platform: 'VK',
      externalAccountId: 'blocked-refresh-vk',
      name: 'Blocked refresh token',
    });
    await publishing.upsertCredential({
      organizationId: organization.id,
      brandId: brand.id,
      socialAccountId: account!.id,
      accessTokenCiphertext: encryptor.encrypt('blocked-access-token'),
      refreshTokenCiphertext: encryptor.encrypt('blocked-refresh-token'),
      expiresAt: new Date('2026-08-12T11:00:00.000Z'),
      encryptionVersion: encryptor.encryptionVersion,
    });
    const service = createSocialTokenRefreshService({
      prisma,
      encryptor,
      providers: {},
      now: () => currentTime,
    });

    await expect(
      service.refreshIfDue(
        { userId: user.id, organizationId: organization.id, brandId: brand.id },
        account!.id,
      ),
    ).rejects.toBeInstanceOf(SocialTokenRefreshBlockedExternalError);
    await expect(
      publishing.findSocialAccountCredential({
        organizationId: organization.id,
        brandId: brand.id,
        id: account!.id,
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'CONNECTED' }));
  });

  it('marks missing and rejected refresh credentials without persisting plaintext', async () => {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const brand = await prisma.brand.findFirstOrThrow({
      where: { organizationId: organization.id, slug: 'first-refresh' },
    });
    const noRefresh = await publishing.createSocialAccount({
      organizationId: organization.id,
      brandId: brand.id,
      platform: 'VK',
      externalAccountId: 'no-refresh-vk',
      name: 'No refresh token',
    });
    await publishing.upsertCredential({
      organizationId: organization.id,
      brandId: brand.id,
      socialAccountId: noRefresh!.id,
      accessTokenCiphertext: encryptor.encrypt('access-only-token'),
      expiresAt: new Date('2026-08-12T11:00:00.000Z'),
      encryptionVersion: encryptor.encryptionVersion,
    });
    const rejected = await publishing.createSocialAccount({
      organizationId: organization.id,
      brandId: brand.id,
      platform: 'VK',
      externalAccountId: 'rejected-refresh-vk',
      name: 'Rejected refresh token',
    });
    await publishing.upsertCredential({
      organizationId: organization.id,
      brandId: brand.id,
      socialAccountId: rejected!.id,
      accessTokenCiphertext: encryptor.encrypt('rejected-access-token'),
      refreshTokenCiphertext: encryptor.encrypt('rejected-refresh-token'),
      expiresAt: new Date('2026-08-12T11:00:00.000Z'),
      encryptionVersion: encryptor.encryptionVersion,
    });
    const service = createSocialTokenRefreshService({
      prisma,
      encryptor,
      providers: { VK: new FailingVkProvider() },
      now: () => currentTime,
    });
    const actor = { userId: user.id, organizationId: organization.id, brandId: brand.id };

    await expect(service.refreshIfDue(actor, noRefresh!.id)).rejects.toBeInstanceOf(
      SocialTokenRefreshError,
    );
    await expect(service.refreshIfDue(actor, rejected!.id)).rejects.toThrow(
      'Provider refresh rejected the credential.',
    );
    const [missing, failed] = await Promise.all([
      publishing.findSocialAccountCredential({ ...actor, id: noRefresh!.id }),
      publishing.findSocialAccountCredential({ ...actor, id: rejected!.id }),
    ]);
    expect(missing).toEqual(expect.objectContaining({ status: 'EXPIRED' }));
    expect(failed).toEqual(expect.objectContaining({ status: 'ERROR' }));
    expect(JSON.stringify([missing, failed])).not.toContain('rejected-refresh-token');
  });
});
