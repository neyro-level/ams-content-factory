import {
  createPublishingRepository,
  createTenantRepository,
  type PrismaClient,
  type SocialPlatform,
} from '@ams-content-factory/db';
import {
  SocialOAuthRefreshUnsupportedError,
  type SocialOAuthTokenRefreshProvider,
} from '@ams-content-factory/providers';
import { createTokenEncryptor, TokenEncryptionError } from './token-encryption';
import { AccessDeniedError, requirePermission, resolveTenantContext } from './tenant-context';

type RefreshActor = { userId: string; organizationId: string; brandId: string };
type Encryptor = ReturnType<typeof createTokenEncryptor>;

export class SocialTokenRefreshBlockedExternalError extends Error {
  constructor(platform: SocialPlatform) {
    super(`BLOCKED_EXTERNAL: ${platform} token refresh is not configured.`);
    this.name = 'SocialTokenRefreshBlockedExternalError';
  }
}

export class SocialTokenRefreshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SocialTokenRefreshError';
  }
}

export function createSocialTokenRefreshService(options: {
  prisma?: PrismaClient;
  tenantRepository?: ReturnType<typeof createTenantRepository>;
  publishingRepository?: ReturnType<typeof createPublishingRepository>;
  encryptor: Encryptor;
  providers: Partial<Record<SocialPlatform, SocialOAuthTokenRefreshProvider>>;
  now?: () => Date;
  refreshWindowMs?: number;
}) {
  const tenants = options.tenantRepository ?? createTenantRepository(options.prisma);
  const publishing = options.publishingRepository ?? createPublishingRepository(options.prisma);
  const now = options.now ?? (() => new Date());
  const refreshWindowMs = options.refreshWindowMs ?? 5 * 60_000;

  return {
    async refreshIfDue(actor: RefreshActor, socialAccountId: string) {
      const context = await resolveTenantContext(actor, tenants);
      requirePermission(context, 'brand:manage');
      const scope = { organizationId: context.organizationId, brandId: actor.brandId };
      const account = await publishing.findSocialAccountCredential({
        ...scope,
        id: socialAccountId,
      });
      if (!account) throw new AccessDeniedError('Social account is outside the active brand.');
      if (account.status === 'DISCONNECTED')
        throw new SocialTokenRefreshError(
          'A disconnected social account cannot refresh credentials.',
        );
      const credential = account.credential;
      if (!credential?.refreshTokenCiphertext) {
        await publishing.updateSocialAccountStatus({ ...scope, id: account.id, status: 'EXPIRED' });
        await tenants.appendAuditLog({
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          actorUserId: context.userId,
          action: 'social.expired',
          entityType: 'SocialAccount',
          entityId: account.id,
          metadata: { platform: account.platform, reason: 'missing_refresh_token' },
        });
        throw new SocialTokenRefreshError(
          'A refresh token is required to renew this social account.',
        );
      }
      const currentTime = now();
      if (
        credential.expiresAt &&
        credential.expiresAt.getTime() > currentTime.getTime() + refreshWindowMs
      ) {
        return { refreshed: false as const, account };
      }
      const provider = options.providers[account.platform];
      if (!provider || provider.platform !== account.platform)
        throw new SocialTokenRefreshBlockedExternalError(account.platform);
      try {
        const refreshed = await provider.refreshToken({
          refreshToken: options.encryptor.decrypt(credential.refreshTokenCiphertext),
        });
        const updated = await publishing.replaceCredentialAndSetStatus({
          ...scope,
          socialAccountId: account.id,
          accessTokenCiphertext: options.encryptor.encrypt(refreshed.accessToken),
          ...(refreshed.refreshToken !== undefined
            ? { refreshTokenCiphertext: options.encryptor.encrypt(refreshed.refreshToken) }
            : {}),
          expiresAt: refreshed.expiresAt,
          encryptionVersion: options.encryptor.encryptionVersion,
        });
        if (!updated) throw new AccessDeniedError('Social account is outside the active brand.');
        return { refreshed: true as const, account: updated };
      } catch (error) {
        if (
          error instanceof AccessDeniedError ||
          error instanceof SocialTokenRefreshBlockedExternalError ||
          error instanceof SocialOAuthRefreshUnsupportedError
        )
          throw error;
        await publishing.updateSocialAccountStatus({ ...scope, id: account.id, status: 'ERROR' });
        await tenants.appendAuditLog({
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          actorUserId: context.userId,
          action: 'social.refresh_failed',
          entityType: 'SocialAccount',
          entityId: account.id,
          metadata: { platform: account.platform, reason: 'provider_or_credential_error' },
        });
        if (error instanceof TokenEncryptionError) throw error;
        const message = error instanceof Error ? error.message : 'Social token refresh failed.';
        throw new SocialTokenRefreshError(message);
      }
    },
  };
}
