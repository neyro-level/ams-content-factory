import { getPrisma } from '../client';
import type {
  ContentProjectStatus,
  ContentType,
  ContentVersionAuthorType,
  Prisma,
  PrismaClient,
} from '../generated/prisma/client';

export function createContentRepository(prisma: PrismaClient = getPrisma()) {
  const boundedTake = (value: number | undefined, fallback: number, maximum: number) =>
    Math.min(Math.max(value ?? fallback, 1), maximum);
  const projectScope = (input: {
    organizationId: string;
    brandId: string;
    contentProjectId: string;
  }) => ({
    contentProjectId: input.contentProjectId,
    contentProject: { organizationId: input.organizationId, brandId: input.brandId },
  });
  const validateProjectGraph = async (
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      organizationId: string;
      brandId: string;
      pillarId?: string;
      opportunityId?: string;
    },
  ) => {
    const [brand, pillar, opportunity] = await Promise.all([
      client.brand.findFirst({
        where: { id: input.brandId, organizationId: input.organizationId, deletedAt: null },
        select: { id: true },
      }),
      input.pillarId
        ? client.contentPillar.findFirst({
            where: { id: input.pillarId, brandId: input.brandId },
            select: { id: true },
          })
        : Promise.resolve({ id: null }),
      input.opportunityId
        ? client.contentOpportunity.findFirst({
            where: { id: input.opportunityId, brandId: input.brandId },
            select: { id: true, pillarId: true },
          })
        : Promise.resolve({ id: null, pillarId: null }),
    ]);
    if (!brand || (input.pillarId && !pillar) || (input.opportunityId && !opportunity))
      return false;
    return !(input.pillarId && opportunity?.pillarId && opportunity.pillarId !== input.pillarId);
  };
  return {
    async createProject(input: {
      organizationId: string;
      brandId: string;
      title: string;
      contentType: ContentType;
      pillarId?: string;
      opportunityId?: string;
      goal?: string;
      audience?: string;
      createdBy?: string;
    }) {
      if (!(await validateProjectGraph(prisma, input))) return null;
      return prisma.contentProject.create({
        data: {
          organizationId: input.organizationId,
          brandId: input.brandId,
          title: input.title,
          contentType: input.contentType,
          ...(input.pillarId !== undefined ? { pillarId: input.pillarId } : {}),
          ...(input.opportunityId !== undefined ? { opportunityId: input.opportunityId } : {}),
          ...(input.goal !== undefined ? { goal: input.goal } : {}),
          ...(input.audience !== undefined ? { audience: input.audience } : {}),
          ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {}),
        },
      });
    },
    async createProjectWithBrief(input: {
      organizationId: string;
      brandId: string;
      title: string;
      contentType: ContentType;
      goal: string;
      audience: string;
      brief: string;
      createdBy: string;
      pillarId?: string;
      opportunityId?: string;
    }) {
      return prisma.$transaction(async (tx) => {
        if (!(await validateProjectGraph(tx, input))) return null;
        const project = await tx.contentProject.create({
          data: {
            organizationId: input.organizationId,
            brandId: input.brandId,
            title: input.title,
            contentType: input.contentType,
            goal: input.goal,
            audience: input.audience,
            createdBy: input.createdBy,
            nextVersion: 2,
            ...(input.pillarId !== undefined ? { pillarId: input.pillarId } : {}),
            ...(input.opportunityId !== undefined ? { opportunityId: input.opportunityId } : {}),
          },
        });
        const briefVersion = await tx.contentVersion.create({
          data: {
            contentProjectId: project.id,
            version: 1,
            createdByType: 'USER',
            createdByUserId: input.createdBy,
            brief: input.brief,
            body: input.brief,
          },
        });
        return { project, briefVersion };
      });
    },
    transition(input: {
      organizationId: string;
      brandId: string;
      id: string;
      from: ContentProjectStatus;
      to: ContentProjectStatus;
    }) {
      return prisma.contentProject.updateMany({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          brandId: input.brandId,
          status: input.from,
        },
        data: { status: input.to },
      });
    },
    async appendVersion(input: {
      organizationId: string;
      brandId: string;
      contentProjectId: string;
      createdByType: ContentVersionAuthorType;
      createdByUserId?: string;
      aiExecutionId?: string;
      brief?: string;
      hook?: string;
      body?: string;
      cta?: string;
      script?: string;
      notes?: string;
    }) {
      return prisma.$transaction(async (tx) => {
        const project = await tx.contentProject.updateMany({
          where: {
            id: input.contentProjectId,
            organizationId: input.organizationId,
            brandId: input.brandId,
          },
          data: { nextVersion: { increment: 1 } },
        });
        if (project.count !== 1) return null;
        const allocated = await tx.contentProject.findUnique({
          where: { id: input.contentProjectId },
          select: { nextVersion: true },
        });
        if (!allocated) return null;
        return tx.contentVersion.create({
          data: {
            contentProjectId: input.contentProjectId,
            createdByType: input.createdByType,
            version: allocated.nextVersion - 1,
            ...(input.createdByUserId !== undefined
              ? { createdByUserId: input.createdByUserId }
              : {}),
            ...(input.aiExecutionId !== undefined ? { aiExecutionId: input.aiExecutionId } : {}),
            ...(input.brief !== undefined ? { brief: input.brief } : {}),
            ...(input.hook !== undefined ? { hook: input.hook } : {}),
            ...(input.body !== undefined ? { body: input.body } : {}),
            ...(input.cta !== undefined ? { cta: input.cta } : {}),
            ...(input.script !== undefined ? { script: input.script } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
          },
        });
      });
    },
    async addApproval(input: {
      organizationId: string;
      brandId: string;
      contentProjectId: string;
      status: string;
      reviewerUserId?: string;
      note?: string;
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
      return prisma.approval.create({
        data: {
          contentProjectId: input.contentProjectId,
          status: input.status,
          ...(input.reviewerUserId !== undefined ? { reviewerUserId: input.reviewerUserId } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
      });
    },
    async approveManual(input: {
      organizationId: string;
      brandId: string;
      contentProjectId: string;
      reviewerUserId: string;
      note?: string;
    }) {
      return prisma.$transaction(async (tx) => {
        const transitioned = await tx.contentProject.updateMany({
          where: {
            id: input.contentProjectId,
            organizationId: input.organizationId,
            brandId: input.brandId,
            status: 'REVIEW',
          },
          data: { status: 'APPROVED' },
        });
        if (transitioned.count !== 1) return null;
        return tx.approval.create({
          data: {
            contentProjectId: input.contentProjectId,
            status: 'APPROVED',
            reviewerUserId: input.reviewerUserId,
            ...(input.note === undefined ? {} : { note: input.note }),
          },
        });
      });
    },
    async recordEditorialDecision(input: {
      organizationId: string;
      brandId: string;
      contentProjectId: string;
      reviewerUserId: string;
      from: ContentProjectStatus;
      to: ContentProjectStatus;
      status: string;
      note?: string;
    }) {
      return prisma.$transaction(async (tx) => {
        const transitioned = await tx.contentProject.updateMany({
          where: {
            id: input.contentProjectId,
            organizationId: input.organizationId,
            brandId: input.brandId,
            status: input.from,
          },
          data: { status: input.to },
        });
        if (transitioned.count !== 1) return null;
        return tx.approval.create({
          data: {
            contentProjectId: input.contentProjectId,
            status: input.status,
            reviewerUserId: input.reviewerUserId,
            ...(input.note === undefined ? {} : { note: input.note }),
          },
        });
      });
    },
    async addComment(input: {
      organizationId: string;
      brandId: string;
      contentProjectId: string;
      authorUserId: string;
      body: string;
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
      return prisma.editorialComment.create({
        data: {
          contentProjectId: input.contentProjectId,
          authorUserId: input.authorUserId,
          body: input.body,
        },
      });
    },
    findProject(input: {
      organizationId: string;
      brandId: string;
      id: string;
      commentsTake?: number;
    }) {
      return prisma.contentProject.findFirst({
        where: { id: input.id, organizationId: input.organizationId, brandId: input.brandId },
        include: {
          versions: { orderBy: { version: 'desc' }, take: 1 },
          variants: { orderBy: { platform: 'asc' }, take: 10 },
          approvals: { orderBy: { createdAt: 'desc' }, take: 1 },
          comments: {
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            take: boundedTake(input.commentsTake, 20, 50),
          },
          _count: { select: { versions: true, approvals: true, comments: true } },
        },
      });
    },
    listProjectVersions(input: {
      organizationId: string;
      brandId: string;
      contentProjectId: string;
      take?: number;
      cursor?: string;
    }) {
      return prisma.contentVersion.findMany({
        where: projectScope(input),
        orderBy: [{ version: 'desc' }, { id: 'asc' }],
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        take: boundedTake(input.take, 20, 50),
      });
    },
    listProjectApprovals(input: {
      organizationId: string;
      brandId: string;
      contentProjectId: string;
      take?: number;
      cursor?: string;
    }) {
      return prisma.approval.findMany({
        where: projectScope(input),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        take: boundedTake(input.take, 20, 50),
      });
    },
    listProjectComments(input: {
      organizationId: string;
      brandId: string;
      contentProjectId: string;
      take?: number;
      cursor?: string;
    }) {
      return prisma.editorialComment.findMany({
        where: projectScope(input),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        take: boundedTake(input.take, 20, 50),
      });
    },
    listProjects(input: {
      organizationId: string;
      brandId: string;
      take?: number;
      cursor?: string;
    }) {
      return prisma.contentProject.findMany({
        where: { organizationId: input.organizationId, brandId: input.brandId },
        include: {
          versions: { orderBy: { version: 'desc' }, take: 1 },
          _count: { select: { versions: true, approvals: true } },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        take: boundedTake(input.take, 50, 100),
      });
    },
    findVersion(input: {
      organizationId: string;
      brandId: string;
      contentProjectId: string;
      id: string;
    }) {
      return prisma.contentVersion.findFirst({
        where: {
          id: input.id,
          contentProjectId: input.contentProjectId,
          contentProject: {
            organizationId: input.organizationId,
            brandId: input.brandId,
          },
        },
      });
    },
    hasActiveVideoProduction(input: {
      organizationId: string;
      brandId: string;
      contentProjectId: string;
    }) {
      return prisma.videoProduction.findFirst({
        where: {
          contentProjectId: input.contentProjectId,
          contentProject: { organizationId: input.organizationId, brandId: input.brandId },
          status: { notIn: ['READY', 'FAILED', 'CANCELLED'] },
        },
        select: { id: true },
      });
    },
  };
}
