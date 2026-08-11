import {
  createKnowledgeRepository,
  type KnowledgeDocumentType,
  type PrismaClient,
} from '@ams-content-factory/db';
import { assertEmbeddingDimensions, type EmbeddingProvider } from '@ams-content-factory/providers';
import { AccessDeniedError, requirePermission, type Permission } from './tenant-context';

type KnowledgeReadContext = {
  organizationId: string;
  brandId?: string;
  permissions: Set<Permission>;
};

export type KnowledgeRetrievalHit = {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
};

export function createKnowledgeRetrievalService(options: {
  embeddingProvider: EmbeddingProvider;
  prisma?: PrismaClient;
}) {
  const repository = createKnowledgeRepository(options.prisma);

  return {
    async embedDocument(input: { context: KnowledgeReadContext; documentId: string }) {
      const { organizationId, brandId } = requireReadContext(input.context);
      const chunks = await repository.findDocumentChunks({
        organizationId,
        brandId,
        documentId: input.documentId,
      });

      for (const chunk of chunks) {
        const embedding = await options.embeddingProvider.embed(chunk.content);
        assertEmbeddingDimensions(embedding);
        await repository.setChunkEmbedding({
          brandId,
          documentId: input.documentId,
          chunkId: chunk.id,
          embedding,
        });
      }

      return chunks.length;
    },
    async search(input: {
      context: KnowledgeReadContext;
      query: string;
      take?: number;
      documentTypes?: KnowledgeDocumentType[];
    }): Promise<KnowledgeRetrievalHit[]> {
      const { organizationId, brandId } = requireReadContext(input.context);
      const query = input.query.trim();
      if (!query) return [];

      const embedding = await options.embeddingProvider.embed(query);
      assertEmbeddingDimensions(embedding);
      const take = Math.min(Math.max(input.take ?? 10, 1), 50);
      return repository.hybridSearch({
        organizationId,
        brandId,
        query,
        embedding,
        take,
        ...(input.documentTypes !== undefined ? { documentTypes: input.documentTypes } : {}),
      });
    },
  };
}

function requireReadContext(context: KnowledgeReadContext) {
  requirePermission(context, 'brand:read');
  if (!context.brandId) {
    throw new AccessDeniedError('Knowledge retrieval requires a brand context.');
  }
  return { organizationId: context.organizationId, brandId: context.brandId };
}
