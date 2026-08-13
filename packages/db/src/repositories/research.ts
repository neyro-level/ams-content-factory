import { getPrisma } from '../client';
import {
  ClaimStatus,
  type PrismaClient,
  type ResearchInboxStatus,
} from '../generated/prisma/client';

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
    findInboxItem(input: { organizationId: string; brandId: string; checksum: string }) {
      return prisma.researchInboxItem.findFirst({
        where: {
          organizationId: input.organizationId,
          brandId: input.brandId,
          checksum: input.checksum,
        },
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
    findItems(input: { organizationId: string; brandId: string; take?: number; cursor?: string }) {
      return prisma.researchItem.findMany({
        where: { brandId: input.brandId, brand: { organizationId: input.organizationId } },
        include: { source: true },
        orderBy: [{ capturedAt: 'desc' }, { id: 'asc' }],
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        take: Math.min(Math.max(input.take ?? 50, 1), 100),
      });
    },
    listContentOpportunities(input: {
      organizationId: string;
      brandId: string;
      take?: number;
      cursor?: string;
    }) {
      return prisma.contentOpportunity.findMany({
        where: { brandId: input.brandId, brand: { organizationId: input.organizationId } },
        orderBy: [{ overallScore: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        take: Math.min(Math.max(input.take ?? 50, 1), 100),
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
    findRecentEvidence(input: {
      organizationId: string;
      brandId: string;
      take?: number;
      cursor?: string;
    }) {
      return prisma.evidence.findMany({
        where: {
          claim: { brandId: input.brandId, brand: { organizationId: input.organizationId } },
        },
        select: {
          id: true,
          sourceUrl: true,
          sourceTitle: true,
          excerpt: true,
          confidence: true,
          capturedAt: true,
          claim: { select: { id: true, text: true, status: true } },
        },
        orderBy: [{ capturedAt: 'desc' }, { id: 'asc' }],
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        take: Math.min(Math.max(input.take ?? 10, 1), 50),
      });
    },
    async upsertContentClaim(input: {
      organizationId: string;
      brandId: string;
      contentProjectId: string;
      take?: number;
      cursor?: string;
      text: string;
    }) {
      const project = await prisma.contentProject.findFirst({
        where: {
          id: input.contentProjectId,
          organizationId: input.organizationId,
          brandId: input.brandId,
        },
        select: { id: true },
      });
      if (!project) return null;
      const claim = await prisma.claim.findFirst({
        where: {
          brandId: input.brandId,
          contentProjectId: input.contentProjectId,
          text: input.text,
        },
        include: { _count: { select: { evidence: true } } },
      });
      if (claim) {
        const status = claim._count.evidence > 0 ? ClaimStatus.SUPPORTED : ClaimStatus.UNVERIFIED;
        return prisma.claim.update({
          where: { id: claim.id },
          data: { status },
          include: { _count: { select: { evidence: true } } },
        });
      }
      return prisma.claim.create({
        data: {
          brandId: input.brandId,
          contentProjectId: input.contentProjectId,
          text: input.text,
          type: 'CONTENT_ASSERTION',
          status: ClaimStatus.UNVERIFIED,
        },
        include: { _count: { select: { evidence: true } } },
      });
    },
    findContentClaims(input: {
      organizationId: string;
      brandId: string;
      contentProjectId: string;
      take?: number;
      cursor?: string;
    }) {
      return prisma.claim.findMany({
        where: {
          brandId: input.brandId,
          contentProjectId: input.contentProjectId,
          brand: { organizationId: input.organizationId },
        },
        include: { evidence: { orderBy: { capturedAt: 'desc' }, take: 10 } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        take: Math.min(Math.max(input.take ?? 50, 1), 100),
      });
    },
  };
}
