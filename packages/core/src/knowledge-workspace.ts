import { createKnowledgeRepository, createTenantRepository } from '@ams-content-factory/db';
import {
  EmbeddingProviderUnavailableError,
  OpenAiEmbeddingProvider,
} from '@ams-content-factory/providers';
import { createKnowledgeIngestionService } from './knowledge-ingestion';
import { createKnowledgeRetrievalService } from './knowledge-retrieval';
import { requirePermission, resolveTenantContext } from './tenant-context';

type KnowledgeActor = { userId: string; organizationId: string; brandId: string };

export class KnowledgeRetrievalBlockedExternalError extends Error {
  constructor() {
    super('BLOCKED_EXTERNAL: OpenAI embeddings are not configured for this environment.');
    this.name = 'KnowledgeRetrievalBlockedExternalError';
  }
}

export function createKnowledgeWorkspaceService(
  options: {
    knowledgeRepository?: ReturnType<typeof createKnowledgeRepository>;
    tenantRepository?: ReturnType<typeof createTenantRepository>;
    ingestionService?: ReturnType<typeof createKnowledgeIngestionService>;
    retrievalService?: ReturnType<typeof createKnowledgeRetrievalService>;
  } = {},
) {
  const knowledgeRepository = options.knowledgeRepository ?? createKnowledgeRepository();
  const tenantRepository = options.tenantRepository ?? createTenantRepository();
  const ingestionService =
    options.ingestionService ??
    createKnowledgeIngestionService({ repository: knowledgeRepository });
  const retrievalService =
    options.retrievalService ??
    createKnowledgeRetrievalService({ embeddingProvider: new OpenAiEmbeddingProvider() });

  return {
    async list(actor: KnowledgeActor, input: { take?: number; cursor?: string } = {}) {
      const context = await resolveTenantContext(actor, tenantRepository);
      requirePermission(context, 'brand:read');
      return knowledgeRepository.listDocuments({
        organizationId: context.organizationId,
        brandId: context.brandId!,
        ...input,
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

    async retry(actor: KnowledgeActor, documentId: string) {
      const context = await resolveTenantContext(actor, tenantRepository);
      return ingestionService.retry({ context, documentId });
    },

    async indexDocument(actor: KnowledgeActor, documentId: string) {
      const context = await resolveTenantContext(actor, tenantRepository);
      try {
        return await retrievalService.embedDocument({ context, documentId });
      } catch (error) {
        if (error instanceof EmbeddingProviderUnavailableError)
          throw new KnowledgeRetrievalBlockedExternalError();
        throw error;
      }
    },

    async search(actor: KnowledgeActor, input: { query: string; take?: number }) {
      const context = await resolveTenantContext(actor, tenantRepository);
      try {
        return await retrievalService.search({ context, ...input });
      } catch (error) {
        if (error instanceof EmbeddingProviderUnavailableError)
          throw new KnowledgeRetrievalBlockedExternalError();
        throw error;
      }
    },
  };
}
