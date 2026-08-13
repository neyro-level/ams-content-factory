import {
  createAnalyticsDashboardService,
  createBrandService,
  createContentGenerationService,
  createContentService,
  createContentWorkspaceService,
  createEditorialApprovalService,
  createFactCheckService,
  createKnowledgeWorkspaceService,
  createProductionContentGenerationService,
  createPublicationCalendarService,
  createResearchWorkspaceService,
  limitActor,
  rateLimitPolicies,
  type McpAuthContext,
} from '@ams-content-factory/core';
import type { ContentType } from '@ams-content-factory/db';

import type { McpApplicationHandlers, McpToolResult } from './index.js';

type Actor = { userId: string; organizationId: string; brandId: string };

function result(value: unknown): McpToolResult {
  return {
    text: JSON.stringify(value, (_key, item: unknown) => {
      if (item instanceof Date) return item.toISOString();
      if (item instanceof Set) return [...item];
      return item;
    }),
  };
}

function actor(context: McpAuthContext, brandId: string): Actor {
  return { userId: context.userId, organizationId: context.organizationId, brandId };
}

const contentTypes = new Set<ContentType>([
  'REEL',
  'SHORT_VIDEO',
  'SOCIAL_POST',
  'CAROUSEL',
  'STORY',
  'ARTICLE',
  'CASE',
  'EXPLAINER',
]);

function contentType(value: string): ContentType {
  if (!contentTypes.has(value as ContentType)) throw new Error('Unsupported content type.');
  return value as ContentType;
}

/**
 * The only MCP-to-product adapter. It serializes already-authorized application-service
 * DTOs, while every business operation still resolves the authenticated actor in core.
 */
export function createMcpApplicationHandlers(
  options: {
    brands?: ReturnType<typeof createBrandService>;
    knowledge?: ReturnType<typeof createKnowledgeWorkspaceService>;
    research?: ReturnType<typeof createResearchWorkspaceService>;
    content?: ReturnType<typeof createContentService>;
    contentWorkspace?: ReturnType<typeof createContentWorkspaceService>;
    generation?: ReturnType<typeof createContentGenerationService>;
    factCheck?: ReturnType<typeof createFactCheckService>;
    editorial?: ReturnType<typeof createEditorialApprovalService>;
    calendar?: ReturnType<typeof createPublicationCalendarService>;
    analytics?: ReturnType<typeof createAnalyticsDashboardService>;
  } = {},
): McpApplicationHandlers {
  const brands = options.brands ?? createBrandService();
  const knowledge = options.knowledge ?? createKnowledgeWorkspaceService();
  const research = options.research ?? createResearchWorkspaceService();
  const content = options.content ?? createContentService();
  const contentWorkspace = options.contentWorkspace ?? createContentWorkspaceService();
  const generation = options.generation ?? createProductionContentGenerationService();
  const factCheck = options.factCheck ?? createFactCheckService();
  const editorial = options.editorial ?? createEditorialApprovalService();
  const calendar = options.calendar ?? createPublicationCalendarService();
  const analytics = options.analytics ?? createAnalyticsDashboardService();

  return {
    async listBrands(context) {
      return result(
        await brands.list({ userId: context.userId, organizationId: context.organizationId }),
      );
    },
    async getBrand(context, input) {
      const visible = await brands.list({
        userId: context.userId,
        organizationId: context.organizationId,
      });
      const brand = visible.find((item) => item.id === input.brandId);
      if (!brand) throw new Error('Brand is outside the authenticated organization.');
      return result(brand);
    },
    async searchKnowledge(context, input) {
      return result(
        await knowledge.search(actor(context, input.brandId), { query: input.query, take: 20 }),
      );
    },
    async addResearchItem(context, input) {
      return result(
        await research.ingestText(actor(context, input.brandId), {
          title: input.title,
          content: input.content,
        }),
      );
    },
    async listContentOpportunities(context, input) {
      return result(
        await research.listContentOpportunities(actor(context, input.brandId), { take: 50 }),
      );
    },
    async createContentProject(context, input) {
      return result(
        await content.create(
          {
            organizationId: context.organizationId,
            brandId: input.brandId,
            permissions: context.permissions,
          },
          { title: input.title, contentType: contentType(input.contentType) },
        ),
      );
    },
    async getContentProject(context, input) {
      return result(
        await contentWorkspace.get(actor(context, input.brandId), input.contentProjectId),
      );
    },
    async generateContentDraft(context, input) {
      await limitActor(rateLimitPolicies.aiGeneration, actor(context, input.brandId));
      return result(
        await generation.generateDraft(actor(context, input.brandId), {
          contentProjectId: input.contentProjectId,
          promptKey: 'social-post',
        }),
      );
    },
    async requestContentReview(context, input) {
      const currentActor = actor(context, input.brandId);
      const factCheckResult = await factCheck.run(currentActor, {
        contentProjectId: input.contentProjectId,
      });
      await editorial.requestReview(currentActor, { contentProjectId: input.contentProjectId });
      return result({ status: 'REVIEW', factCheck: factCheckResult });
    },
    async getPublicationCalendar(context, input) {
      return result(
        await calendar.get(actor(context, input.brandId), { view: 'month', anchor: new Date() }),
      );
    },
    async getAnalyticsSummary(context, input) {
      return result(await analytics.get(actor(context, input.brandId)));
    },
  };
}
