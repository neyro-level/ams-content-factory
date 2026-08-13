import { createPublishingRepository, createTenantRepository } from '@ams-content-factory/db';
import { AccessDeniedError, requirePermission, resolveTenantContext } from './tenant-context';

type SocialAccountsActor = { userId: string; organizationId: string; brandId: string };

export function createSocialAccountsWorkspaceService(
  options: {
    tenantRepository?: ReturnType<typeof createTenantRepository>;
    publishingRepository?: ReturnType<typeof createPublishingRepository>;
  } = {},
) {
  const tenants = options.tenantRepository ?? createTenantRepository();
  const publishing = options.publishingRepository ?? createPublishingRepository();

  return {
    async list(actor: SocialAccountsActor, input: { take?: number; cursor?: string } = {}) {
      const context = await resolveTenantContext(actor, tenants);
      requirePermission(context, 'brand:read');
      if (!context.brandId) throw new AccessDeniedError('Social accounts require a brand context.');
      return publishing.listSocialAccounts({
        organizationId: context.organizationId,
        brandId: context.brandId,
        ...input,
      });
    },
  };
}
