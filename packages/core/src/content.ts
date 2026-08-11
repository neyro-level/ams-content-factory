import {
  ContentProjectStatus,
  ContentVersionAuthorType,
  createContentRepository,
  type ContentType,
  type PrismaClient,
} from '@ams-content-factory/db';
import { AccessDeniedError, requirePermission, type Permission } from './tenant-context';

type Context = { organizationId: string; brandId?: string; permissions: Set<Permission> };
const transitions: Record<ContentProjectStatus, ContentProjectStatus[]> = {
  IDEA: ['RESEARCHING', 'REJECTED', 'CANCELLED'],
  RESEARCHING: ['DRAFT', 'FAILED', 'CANCELLED'],
  DRAFT: ['FACT_CHECK', 'REJECTED', 'CANCELLED'],
  FACT_CHECK: ['REVIEW', 'DRAFT', 'FAILED'],
  REVIEW: ['APPROVED', 'DRAFT', 'REJECTED'],
  APPROVED: ['PRODUCTION', 'CANCELLED'],
  PRODUCTION: ['QC', 'FAILED'],
  QC: ['READY', 'PRODUCTION', 'FAILED'],
  READY: ['SCHEDULED', 'ARCHIVED'],
  SCHEDULED: ['PUBLISHED', 'READY', 'FAILED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: [],
  REJECTED: [],
  FAILED: ['DRAFT', 'RESEARCHING', 'CANCELLED'],
  CANCELLED: [],
};

export function createContentService(options: { prisma?: PrismaClient } = {}) {
  const repository = createContentRepository(options.prisma);
  const scoped = (context: Context) => {
    requirePermission(context, 'content:write');
    if (!context.brandId) throw new AccessDeniedError('Content requires a brand context.');
    return { organizationId: context.organizationId, brandId: context.brandId };
  };
  return {
    async create(
      context: Context,
      input: {
        title: string;
        contentType: ContentType;
        opportunityId?: string;
        pillarId?: string;
        goal?: string;
        audience?: string;
      },
    ) {
      return repository.createProject({ ...scoped(context), ...input });
    },
    async transition(context: Context, id: string, to: ContentProjectStatus) {
      const scope = scoped(context);
      const project = await repository.findProject({ ...scope, id });
      if (!project)
        throw new AccessDeniedError('Content project is outside the active organization.');
      if (!transitions[project.status].includes(to))
        throw new Error(`Invalid content transition: ${project.status} -> ${to}`);
      const result = await repository.transition({ ...scope, id, from: project.status, to });
      if (result.count !== 1) throw new Error('Content transition was rejected.');
      return repository.findProject({ ...scope, id });
    },
    appendVersion(
      context: Context,
      id: string,
      input: {
        createdByType: ContentVersionAuthorType;
        body?: string;
        brief?: string;
        hook?: string;
        cta?: string;
        script?: string;
        notes?: string;
      },
    ) {
      return repository.appendVersion({ ...scoped(context), contentProjectId: id, ...input });
    },
  };
}
export { transitions as contentTransitions };
