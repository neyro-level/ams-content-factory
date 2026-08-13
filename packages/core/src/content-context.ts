import {
  createContentRepository,
  createKnowledgeRepository,
  createResearchRepository,
  createTenantRepository,
} from '@ams-content-factory/db';
import { AccessDeniedError, requirePermission, resolveTenantContext } from './tenant-context';
import type { KnowledgeRetrievalHit } from './knowledge-retrieval';

type Actor = { userId: string; organizationId: string; brandId: string };
type KnowledgeSearch = {
  search(input: {
    context: {
      organizationId: string;
      brandId: string;
      permissions: Set<'brand:read' | 'content:write'>;
    };
    query: string;
    take?: number;
  }): Promise<KnowledgeRetrievalHit[]>;
};

export function createContentContextAssembler(
  options: {
    tenantRepository?: ReturnType<typeof createTenantRepository>;
    contentRepository?: ReturnType<typeof createContentRepository>;
    knowledgeRepository?: ReturnType<typeof createKnowledgeRepository>;
    researchRepository?: ReturnType<typeof createResearchRepository>;
    knowledgeSearch?: KnowledgeSearch;
  } = {},
) {
  const tenants = options.tenantRepository ?? createTenantRepository();
  const content = options.contentRepository ?? createContentRepository();
  const knowledge = options.knowledgeRepository ?? createKnowledgeRepository();
  const research = options.researchRepository ?? createResearchRepository();

  return {
    async assemble(
      actor: Actor,
      input: { contentProjectId: string; knowledgeQuery?: string; evidenceTake?: number },
    ) {
      const context = await resolveTenantContext(actor, tenants);
      requirePermission(context, 'content:write');
      const scope = { organizationId: context.organizationId, brandId: actor.brandId };
      const project = await content.findProject({ ...scope, id: input.contentProjectId });
      if (!project)
        throw new AccessDeniedError('Content project is outside the active organization.');

      const [brand, evidence] = await Promise.all([
        knowledge.findBrandGenerationContext(scope),
        research.findRecentEvidence({
          ...scope,
          ...(input.evidenceTake === undefined ? {} : { take: input.evidenceTake }),
        }),
      ]);
      if (!brand) throw new AccessDeniedError('Brand is outside the active organization.');

      const query = input.knowledgeQuery?.trim();
      if (query && !options.knowledgeSearch)
        throw new Error('Knowledge retrieval is required when a knowledge query is supplied.');
      const knowledgeHits = query
        ? await options.knowledgeSearch!.search({
            context: {
              organizationId: context.organizationId,
              brandId: actor.brandId,
              permissions: new Set(['brand:read', 'content:write']),
            },
            query,
            take: 10,
          })
        : [];

      return { project, brand, evidence, knowledgeHits };
    },
  };
}
