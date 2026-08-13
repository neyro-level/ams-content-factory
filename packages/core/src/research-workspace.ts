import { createResearchRepository, createTenantRepository } from '@ams-content-factory/db';
import {
  FirecrawlResearchProvider,
  ResearchProviderUnavailableError,
  type PageFetcherProvider,
  type SearchProvider,
} from '@ams-content-factory/providers';
import { createResearchService } from './research';
import { requirePermission, resolveTenantContext } from './tenant-context';

type ResearchActor = { userId: string; organizationId: string; brandId: string };
type ResearchProvider = SearchProvider & PageFetcherProvider;

export class ResearchWorkspaceBlockedExternalError extends Error {
  constructor() {
    super('Research provider is not configured for this environment.');
    this.name = 'ResearchWorkspaceBlockedExternalError';
  }
}

export function createResearchWorkspaceService(
  options: {
    researchRepository?: ReturnType<typeof createResearchRepository>;
    tenantRepository?: ReturnType<typeof createTenantRepository>;
    researchService?: ReturnType<typeof createResearchService>;
    provider?: ResearchProvider;
  } = {},
) {
  const researchRepository = options.researchRepository ?? createResearchRepository();
  const tenantRepository = options.tenantRepository ?? createTenantRepository();
  const provider = options.provider ?? new FirecrawlResearchProvider();
  const researchService =
    options.researchService ??
    createResearchService({ repository: researchRepository, pageFetcher: provider });

  return {
    async list(actor: ResearchActor) {
      const context = await resolveTenantContext(actor, tenantRepository);
      return researchService.list(context);
    },

    async listContentOpportunities(
      actor: ResearchActor,
      input: { take?: number; cursor?: string } = {},
    ) {
      const context = await resolveTenantContext(actor, tenantRepository);
      requirePermission(context, 'brand:read');
      return researchRepository.listContentOpportunities({
        organizationId: context.organizationId,
        brandId: context.brandId!,
        ...input,
      });
    },

    async ingestText(actor: ResearchActor, input: { title: string; content: string }) {
      const context = await resolveTenantContext(actor, tenantRepository);
      return researchService.ingest({ context, kind: 'TEXT', ...input });
    },

    async ingestUrl(actor: ResearchActor, input: { title: string; sourceUrl: string }) {
      const context = await resolveTenantContext(actor, tenantRepository);
      try {
        return await researchService.ingest({ context, kind: 'URL', ...input });
      } catch (error) {
        if (error instanceof ResearchProviderUnavailableError)
          throw new ResearchWorkspaceBlockedExternalError();
        throw error;
      }
    },

    async search(actor: ResearchActor, query: string) {
      const context = await resolveTenantContext(actor, tenantRepository);
      requirePermission(context, 'brand:read');
      const prepared = query.trim();
      if (!prepared) return [];
      try {
        return await provider.search(prepared);
      } catch (error) {
        if (error instanceof ResearchProviderUnavailableError)
          throw new ResearchWorkspaceBlockedExternalError();
        throw error;
      }
    },
  };
}
