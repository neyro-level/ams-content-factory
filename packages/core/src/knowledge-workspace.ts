import { createKnowledgeRepository, createTenantRepository } from '@ams-content-factory/db';
import { createKnowledgeIngestionService } from './knowledge-ingestion';
import { requirePermission, resolveTenantContext } from './tenant-context';

type KnowledgeActor = { userId: string; organizationId: string; brandId: string };

export function createKnowledgeWorkspaceService(
  options: {
    knowledgeRepository?: ReturnType<typeof createKnowledgeRepository>;
    tenantRepository?: ReturnType<typeof createTenantRepository>;
    ingestionService?: ReturnType<typeof createKnowledgeIngestionService>;
  } = {},
) {
  const knowledgeRepository = options.knowledgeRepository ?? createKnowledgeRepository();
  const tenantRepository = options.tenantRepository ?? createTenantRepository();
  const ingestionService =
    options.ingestionService ??
    createKnowledgeIngestionService({ repository: knowledgeRepository });

  return {
    async list(actor: KnowledgeActor) {
      const context = await resolveTenantContext(actor, tenantRepository);
      requirePermission(context, 'brand:read');
      return knowledgeRepository.listDocuments({
        organizationId: context.organizationId,
        brandId: context.brandId!,
      });
    },

    async ingestText(actor: KnowledgeActor, input: { title: string; text: string }) {
      const context = await resolveTenantContext(actor, tenantRepository);
      return ingestionService.ingest({
        context,
        kind: 'TEXT',
        title: input.title,
        text: input.text,
      });
    },

    async ingestUrl(actor: KnowledgeActor, input: { title: string; sourceUrl: string }) {
      const context = await resolveTenantContext(actor, tenantRepository);
      return ingestionService.ingest({
        context,
        kind: 'URL',
        title: input.title,
        sourceUrl: input.sourceUrl,
      });
    },

    async ingestFile(
      actor: KnowledgeActor,
      input: { title: string; fileName: string; contentType?: string; bytes: Uint8Array },
    ) {
      const context = await resolveTenantContext(actor, tenantRepository);
      return ingestionService.ingest({ context, kind: 'FILE', ...input });
    },
  };
}
