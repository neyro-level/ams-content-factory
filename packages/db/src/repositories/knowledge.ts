import {
  KnowledgeDocumentStatus,
  Prisma,
  type KnowledgeDocumentType,
  type PrismaClient,
} from '../generated/prisma/client';
import { getPrisma } from '../client';

export function createKnowledgeRepository(prisma: PrismaClient = getPrisma()) {
  return {
    async upsertProfile(input: {
      organizationId: string;
      brandId: string;
      data: Record<string, object>;
    }) {
      const brand = await findBrand(input.organizationId, input.brandId);

      if (!brand) {
        return null;
      }

      return prisma.brandProfile.upsert({
        where: { brandId: input.brandId },
        create: { brandId: input.brandId, ...input.data },
        update: input.data,
      });
    },
    async createDocument(input: {
      organizationId: string;
      brandId: string;
      title: string;
      type: KnowledgeDocumentType;
      sourceUrl?: string;
      sourceText?: string;
      checksum?: string;
      metadata?: object;
    }) {
      const brand = await findBrand(input.organizationId, input.brandId);

      if (!brand) {
        return null;
      }

      return prisma.knowledgeDocument.create({
        data: { ...input, status: KnowledgeDocumentStatus.PENDING },
      });
    },
    findDocumentByChecksum(input: { organizationId: string; brandId: string; checksum: string }) {
      return prisma.knowledgeDocument.findFirst({
        where: input,
      });
    },
    findDocumentChunks(input: { organizationId: string; brandId: string; documentId: string }) {
      return prisma.knowledgeChunk.findMany({
        where: {
          documentId: input.documentId,
          brandId: input.brandId,
          document: { organizationId: input.organizationId, brandId: input.brandId },
        },
        orderBy: { ordinal: 'asc' },
      });
    },
    async addChunk(input: {
      organizationId: string;
      brandId: string;
      documentId: string;
      ordinal: number;
      content: string;
      tokenCount?: number;
    }) {
      const document = await prisma.knowledgeDocument.findFirst({
        where: {
          id: input.documentId,
          organizationId: input.organizationId,
          brandId: input.brandId,
        },
        select: { id: true },
      });

      if (!document) {
        return null;
      }

      return prisma.knowledgeChunk.create({
        data: {
          brandId: input.brandId,
          documentId: input.documentId,
          ordinal: input.ordinal,
          content: input.content,
          ...(input.tokenCount ? { tokenCount: input.tokenCount } : {}),
        },
      });
    },
    findChunks(input: { organizationId: string; brandId: string; query: string; take?: number }) {
      return prisma.knowledgeChunk.findMany({
        where: {
          brandId: input.brandId,
          document: {
            organizationId: input.organizationId,
            brandId: input.brandId,
            status: KnowledgeDocumentStatus.READY,
          },
          content: { contains: input.query, mode: 'insensitive' },
        },
        orderBy: [{ documentId: 'asc' }, { ordinal: 'asc' }],
        take: input.take ?? 20,
      });
    },
    setChunkEmbedding(input: {
      brandId: string;
      documentId: string;
      chunkId: string;
      embedding: number[];
    }) {
      return prisma.$executeRaw`
        UPDATE "knowledge_chunk" SET "embedding" = ${vector(input.embedding)}::vector
        WHERE "id" = ${input.chunkId} AND "brandId" = ${input.brandId} AND "documentId" = ${input.documentId}`;
    },
    hybridSearch(input: {
      organizationId: string;
      brandId: string;
      query: string;
      embedding: number[];
      take: number;
      documentTypes?: KnowledgeDocumentType[];
    }) {
      const types = input.documentTypes?.length
        ? Prisma.sql`AND document."type" IN (${Prisma.join(input.documentTypes)})`
        : Prisma.empty;
      return prisma.$queryRaw<
        { chunkId: string; documentId: string; content: string; score: number }[]
      >(Prisma.sql`
        SELECT chunk."id" AS "chunkId", chunk."documentId" AS "documentId", chunk."content" AS "content",
        (0.7 * (1 - (chunk."embedding" <=> ${vector(input.embedding)}::vector)) + 0.3 * ts_rank_cd(to_tsvector('simple', chunk."content"), websearch_to_tsquery('simple', ${input.query})))::float8 AS "score"
        FROM "knowledge_chunk" AS chunk INNER JOIN "knowledge_document" AS document ON document."id" = chunk."documentId"
        WHERE chunk."brandId" = ${input.brandId} AND document."organizationId" = ${input.organizationId} AND document."brandId" = ${input.brandId} AND document."status" = ${KnowledgeDocumentStatus.READY} AND chunk."embedding" IS NOT NULL ${types}
        ORDER BY "score" DESC, chunk."documentId" ASC, chunk."ordinal" ASC LIMIT ${input.take}`);
    },
    markDocumentReady(organizationId: string, brandId: string, documentId: string) {
      return prisma.knowledgeDocument.updateMany({
        where: { id: documentId, organizationId, brandId },
        data: { status: KnowledgeDocumentStatus.READY },
      });
    },
    transitionDocumentStatus(input: {
      organizationId: string;
      brandId: string;
      documentId: string;
      from: KnowledgeDocumentStatus;
      to: KnowledgeDocumentStatus;
    }) {
      return prisma.knowledgeDocument.updateMany({
        where: {
          id: input.documentId,
          organizationId: input.organizationId,
          brandId: input.brandId,
          status: input.from,
        },
        data: { status: input.to },
      });
    },
  };

  function findBrand(organizationId: string, brandId: string) {
    return prisma.brand.findFirst({
      where: { id: brandId, organizationId, deletedAt: null },
      select: { id: true },
    });
  }
}

function vector(value: number[]) {
  return `[${value.join(',')}]`;
}
