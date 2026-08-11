import {
  KnowledgeDocumentStatus,
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
    markDocumentReady(organizationId: string, brandId: string, documentId: string) {
      return prisma.knowledgeDocument.updateMany({
        where: { id: documentId, organizationId, brandId },
        data: { status: KnowledgeDocumentStatus.READY },
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
