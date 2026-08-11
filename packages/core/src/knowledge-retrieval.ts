import {
  createKnowledgeRepository,
  getPrisma,
  KnowledgeDocumentStatus,
  Prisma,
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
  const prisma = options.prisma ?? getPrisma();

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
        await prisma.$executeRaw`
          UPDATE "knowledge_chunk"
          SET "embedding" = ${toVectorLiteral(embedding)}::vector
          WHERE "id" = ${chunk.id}
            AND "brandId" = ${brandId}
            AND "documentId" = ${input.documentId}
        `;
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
      const documentTypes = input.documentTypes?.length
        ? Prisma.sql`AND document."type" IN (${Prisma.join(input.documentTypes)})`
        : Prisma.empty;
      return prisma.$queryRaw<KnowledgeRetrievalHit[]>(Prisma.sql`
        SELECT
          chunk."id" AS "chunkId",
          chunk."documentId" AS "documentId",
          chunk."content" AS "content",
          (
            0.7 * (1 - (chunk."embedding" <=> ${toVectorLiteral(embedding)}::vector)) +
            0.3 * ts_rank_cd(
              to_tsvector('simple', chunk."content"),
              websearch_to_tsquery('simple', ${query})
            )
          )::float8 AS "score"
        FROM "knowledge_chunk" AS chunk
        INNER JOIN "knowledge_document" AS document ON document."id" = chunk."documentId"
        WHERE chunk."brandId" = ${brandId}
          AND document."organizationId" = ${organizationId}
          AND document."brandId" = ${brandId}
          AND document."status" = ${KnowledgeDocumentStatus.READY}
          AND chunk."embedding" IS NOT NULL
          ${documentTypes}
        ORDER BY "score" DESC, chunk."documentId" ASC, chunk."ordinal" ASC
        LIMIT ${take}
      `);
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

function toVectorLiteral(vector: number[]) {
  return `[${vector.join(',')}]`;
}
