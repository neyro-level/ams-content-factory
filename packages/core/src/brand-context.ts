import { createKnowledgeRepository, createTenantRepository } from '@ams-content-factory/db';
import { AccessDeniedError, requirePermission, resolveTenantContext } from './tenant-context';

type Actor = { userId: string; organizationId: string; brandId: string };

const splitLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 50);

export function createBrandContextService(
  options: {
    tenants?: ReturnType<typeof createTenantRepository>;
    knowledge?: ReturnType<typeof createKnowledgeRepository>;
  } = {},
) {
  const tenants = options.tenants ?? createTenantRepository();
  const knowledge = options.knowledge ?? createKnowledgeRepository();
  async function contextFor(actor: Actor) {
    const context = await resolveTenantContext(actor, tenants);
    requirePermission(context, 'brand:read');
    return context;
  }
  return {
    async get(actor: Actor) {
      const context = await contextFor(actor);
      const brand = await tenants.findBrandInOrganization(context.organizationId, actor.brandId);
      if (!brand) throw new AccessDeniedError('Brand is outside the active organization.');
      const generation = await knowledge.findBrandGenerationContext({
        organizationId: context.organizationId,
        brandId: actor.brandId,
      });
      return { brand, generation };
    },
    async save(
      actor: Actor,
      input: {
        description: string;
        websiteUrl: string;
        positioning: string;
        targetAudience: string;
        offers: string;
        constraints: string;
        forbiddenClaims: string;
        toneSummary: string;
        styleRules: string;
        forbiddenWords: string;
      },
    ) {
      const context = await contextFor(actor);
      requirePermission(context, 'brand:manage');
      const websiteUrl = input.websiteUrl.trim();
      if (websiteUrl && !/^https:\/\/[^\s]+$/i.test(websiteUrl))
        throw new Error('Укажите полный HTTPS-адрес сайта или оставьте поле пустым.');
      const updated = await tenants.updateBrandDetails({
        organizationId: context.organizationId,
        brandId: actor.brandId,
        description: input.description.trim(),
        websiteUrl: websiteUrl || null,
      });
      if (updated.count !== 1)
        throw new AccessDeniedError('Brand is outside the active organization.');
      await knowledge.upsertProfile({
        organizationId: context.organizationId,
        brandId: actor.brandId,
        data: {
          positioning: { text: input.positioning.trim() },
          targetAudience: { text: input.targetAudience.trim() },
          offers: splitLines(input.offers),
          constraints: splitLines(input.constraints),
          forbiddenClaims: splitLines(input.forbiddenClaims),
        },
      });
      if (input.toneSummary.trim()) {
        await knowledge.upsertVoice({
          organizationId: context.organizationId,
          brandId: actor.brandId,
          toneSummary: input.toneSummary.trim(),
          styleRules: splitLines(input.styleRules),
          forbiddenWords: splitLines(input.forbiddenWords),
        });
      }
      await tenants.appendAuditLog({
        organizationId: context.organizationId,
        brandId: actor.brandId,
        actorUserId: actor.userId,
        action: 'brand.context.update',
        entityType: 'Brand',
        entityId: actor.brandId,
      });
    },
  };
}
