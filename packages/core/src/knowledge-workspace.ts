import { createKnowledgeRepository, createTenantRepository } from '@ams-content-factory/db';
import { requirePermission, resolveTenantContext } from './tenant-context';

type KnowledgeActor = { userId: string; organizationId: string; brandId: string };

export function createKnowledgeWorkspaceService(
  options: {
    knowledgeRepository?: ReturnType<typeof createKnowledgeRepository>;
    tenantRepository?: ReturnType<typeof createTenantRepository>;
  } = {},
) {
  const knowledgeRepository = options.knowledgeRepository ?? createKnowledgeRepository();
  const tenantRepository = options.tenantRepository ?? createTenantRepository();

  return {
    async list(actor: KnowledgeActor) {
      const context = await resolveTenantContext(actor, tenantRepository);
      requirePermission(context, 'brand:read');
      return knowledgeRepository.listDocuments({
        organizationId: context.organizationId,
        brandId: context.brandId!,
      });
    },
  };
}
