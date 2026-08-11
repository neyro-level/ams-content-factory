import { getPrisma } from '../client';
import type { PrismaClient, ResearchInboxStatus } from '../generated/prisma/client';

export function createResearchRepository(prisma: PrismaClient = getPrisma()) {
  const brandExists = (organizationId: string, brandId: string) =>
    prisma.brand.findFirst({
      where: { id: brandId, organizationId, deletedAt: null },
      select: { id: true },
    });

  return {
    async createInboxItem(input: {
      organizationId: string;
      brandId: string;
      kind: string;
      title: string;
      checksum: string;
      content?: string;
      sourceUrl?: string;
      metadata?: object;
    }) {
      if (!(await brandExists(input.organizationId, input.brandId))) return null;
      return prisma.researchInboxItem.upsert({
        where: { brandId_checksum: { brandId: input.brandId, checksum: input.checksum } },
        create: input,
        update: {},
      });
    },
    transitionInboxStatus(input: {
      organizationId: string;
      brandId: string;
      id: string;
      from: ResearchInboxStatus;
      to: ResearchInboxStatus;
    }) {
      return prisma.researchInboxItem.updateMany({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          brandId: input.brandId,
          status: input.from,
        },
        data: { status: input.to },
      });
    },
    async upsertSource(input: {
      organizationId: string;
      brandId: string;
      canonicalUrl: string;
      domain: string;
      sourceType: string;
      title?: string;
      metadata?: object;
    }) {
      if (!(await brandExists(input.organizationId, input.brandId))) return null;
      const data = {
        brandId: input.brandId,
        canonicalUrl: input.canonicalUrl,
        domain: input.domain,
        sourceType: input.sourceType,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      };
      return prisma.researchSource.upsert({
        where: {
          brandId_canonicalUrl: { brandId: input.brandId, canonicalUrl: input.canonicalUrl },
        },
        create: data,
        update: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        },
      });
    },
    async createItem(input: {
      organizationId: string;
      brandId: string;
      sourceId?: string;
      title: string;
      contentHash: string;
      rawContent?: string;
      summary?: string;
    }) {
      if (!(await brandExists(input.organizationId, input.brandId))) return null;
      const data = {
        brandId: input.brandId,
        title: input.title,
        contentHash: input.contentHash,
        ...(input.sourceId !== undefined ? { sourceId: input.sourceId } : {}),
        ...(input.rawContent !== undefined ? { rawContent: input.rawContent } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
      };
      return prisma.researchItem.upsert({
        where: { brandId_contentHash: { brandId: input.brandId, contentHash: input.contentHash } },
        create: data,
        update: {},
      });
    },
    findItems(input: { organizationId: string; brandId: string }) {
      return prisma.researchItem.findMany({
        where: { brandId: input.brandId, brand: { organizationId: input.organizationId } },
        include: { source: true },
        orderBy: { capturedAt: 'desc' },
      });
    },
    findItemByContentHash(input: { organizationId: string; brandId: string; contentHash: string }) {
      return prisma.researchItem.findFirst({
        where: {
          brandId: input.brandId,
          contentHash: input.contentHash,
          brand: { organizationId: input.organizationId },
        },
        include: { source: true },
      });
    },
  };
}
