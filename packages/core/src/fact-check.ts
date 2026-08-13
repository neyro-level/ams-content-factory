import {
  ContentProjectStatus,
  createContentRepository,
  createResearchRepository,
  createTenantRepository,
} from '@ams-content-factory/db';
import { AccessDeniedError, requirePermission, resolveTenantContext } from './tenant-context';

type Actor = { userId: string; organizationId: string; brandId: string };

export function createFactCheckService(
  options: {
    tenantRepository?: ReturnType<typeof createTenantRepository>;
    contentRepository?: ReturnType<typeof createContentRepository>;
    researchRepository?: ReturnType<typeof createResearchRepository>;
  } = {},
) {
  const tenants = options.tenantRepository ?? createTenantRepository();
  const content = options.contentRepository ?? createContentRepository();
  const research = options.researchRepository ?? createResearchRepository();

  return {
    async run(actor: Actor, input: { contentProjectId: string }) {
      const context = await resolveTenantContext(actor, tenants);
      requirePermission(context, 'content:write');
      const scope = { organizationId: context.organizationId, brandId: actor.brandId };
      const project = await content.findProject({ ...scope, id: input.contentProjectId });
      if (!project)
        throw new AccessDeniedError('Content project is outside the active organization.');
      if (project.status !== ContentProjectStatus.DRAFT)
        throw new Error('Content project is not ready for fact-check.');
      const version = project.versions.at(-1);
      if (!version) throw new Error('Content project has no version to fact-check.');
      if (
        (
          await content.transition({
            ...scope,
            id: project.id,
            from: ContentProjectStatus.DRAFT,
            to: ContentProjectStatus.FACT_CHECK,
          })
        ).count !== 1
      )
        throw new Error('Content project could not enter fact-check.');

      const claims = await Promise.all(
        extractClaims(version.body ?? version.script ?? '').map((text) =>
          research.upsertContentClaim({ ...scope, contentProjectId: project.id, text }),
        ),
      );
      if (claims.some((claim) => !claim))
        throw new AccessDeniedError('Claim is outside active scope.');
      const findings = claims.map((claim) => ({
        claimId: claim!.id,
        text: claim!.text,
        supported: claim!._count.evidence > 0,
        evidenceCount: claim!._count.evidence,
      }));
      return {
        versionId: version.id,
        findings,
        unsupported: findings.filter((finding) => !finding.supported),
      };
    },
  };
}

function extractClaims(text: string) {
  return [
    ...new Set(
      text
        .split(/(?<=[.!?])\s+|\n+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}
