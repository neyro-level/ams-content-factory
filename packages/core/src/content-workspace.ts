import {
  createContentRepository,
  createResearchRepository,
  createTenantRepository,
} from '@ams-content-factory/db';
import { AccessDeniedError, requirePermission, resolveTenantContext } from './tenant-context';

type Actor = { userId: string; organizationId: string; brandId: string };

export function createContentWorkspaceService(
  options: {
    tenantRepository?: ReturnType<typeof createTenantRepository>;
    contentRepository?: ReturnType<typeof createContentRepository>;
    researchRepository?: ReturnType<typeof createResearchRepository>;
  } = {},
) {
  const tenants = options.tenantRepository ?? createTenantRepository();
  const content = options.contentRepository ?? createContentRepository();
  const research = options.researchRepository ?? createResearchRepository();

  async function contextFor(actor: Actor) {
    const context = await resolveTenantContext(actor, tenants);
    requirePermission(context, 'brand:read');
    return context;
  }

  return {
    async list(actor: Actor, input: { take?: number; cursor?: string } = {}) {
      const context = await contextFor(actor);
      return content.listProjects({
        organizationId: context.organizationId,
        brandId: actor.brandId,
        ...input,
      });
    },
    async get(actor: Actor, contentProjectId: string) {
      const context = await contextFor(actor);
      const checkedScope = { organizationId: context.organizationId, brandId: actor.brandId };
      const project = await content.findProject({ ...checkedScope, id: contentProjectId });
      if (!project)
        throw new AccessDeniedError('Content project is outside the active organization.');
      const claims = await research.findContentClaims({ ...checkedScope, contentProjectId });
      return {
        project,
        claims,
        canWrite: context.permissions.has('content:write'),
        canReview: context.permissions.has('content:review'),
      };
    },
  };
}
