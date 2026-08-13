import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createRateLimitService,
  rateLimitPolicies,
  requirePermission,
  type McpAuthContext,
  type Permission,
} from '@ams-content-factory/core';
import { z } from 'zod';

export type McpToolResult = { text: string };
export type McpApplicationHandlers = {
  listBrands(context: McpAuthContext): Promise<McpToolResult>;
  getBrand(context: McpAuthContext, input: { brandId: string }): Promise<McpToolResult>;
  searchKnowledge(
    context: McpAuthContext,
    input: { brandId: string; query: string },
  ): Promise<McpToolResult>;
  addResearchItem(
    context: McpAuthContext,
    input: { brandId: string; title: string; content: string },
  ): Promise<McpToolResult>;
  listContentOpportunities(
    context: McpAuthContext,
    input: { brandId: string },
  ): Promise<McpToolResult>;
  createContentProject(
    context: McpAuthContext,
    input: { brandId: string; title: string; contentType: string },
  ): Promise<McpToolResult>;
  getContentProject(
    context: McpAuthContext,
    input: { brandId: string; contentProjectId: string },
  ): Promise<McpToolResult>;
  generateContentDraft(
    context: McpAuthContext,
    input: { brandId: string; contentProjectId: string },
  ): Promise<McpToolResult>;
  requestContentReview(
    context: McpAuthContext,
    input: { brandId: string; contentProjectId: string },
  ): Promise<McpToolResult>;
  getPublicationCalendar(
    context: McpAuthContext,
    input: { brandId: string },
  ): Promise<McpToolResult>;
  getAnalyticsSummary(context: McpAuthContext, input: { brandId: string }): Promise<McpToolResult>;
};
export type McpBrandAuthorizer = {
  assertBrand(context: McpAuthContext, brandId: string): Promise<void>;
};
export type McpToolRateLimiter = Pick<ReturnType<typeof createRateLimitService>, 'consume'>;

const response = (result: McpToolResult) => ({
  content: [{ type: 'text' as const, text: result.text }],
});
const brand = z.string().uuid();

export async function executeMcpBrandTool<T extends { brandId: string }>(input: {
  context: McpAuthContext;
  requiredPermission: Permission;
  brandAuthorizer: McpBrandAuthorizer;
  toolInput: T;
  handler: (context: McpAuthContext, toolInput: T) => Promise<McpToolResult>;
}) {
  requirePermission(input.context, input.requiredPermission);
  await input.brandAuthorizer.assertBrand(input.context, input.toolInput.brandId);
  return input.handler(input.context, input.toolInput);
}

/**
 * Transport and authentication are composed at the application edge. Tool execution is
 * delegated to core application services so MCP never becomes a second business-logic layer.
 */
export function createMcpServer(
  context: McpAuthContext,
  handlers: McpApplicationHandlers,
  brandAuthorizer: McpBrandAuthorizer,
  options: { rateLimiter?: McpToolRateLimiter } = {},
) {
  const server = new McpServer({ name: 'ams-content-factory', version: '0.1.0' });
  const rateLimiter = options.rateLimiter ?? createRateLimitService();
  const limitTool = () =>
    rateLimiter.consume(rateLimitPolicies.mcp, `${context.organizationId}:${context.apiKeyId}`);
  const withBrand = async <T extends { brandId: string }>(
    input: T,
    requiredPermission: Permission,
    handler: (input: T) => Promise<McpToolResult>,
  ) => {
    await limitTool();
    return response(
      await executeMcpBrandTool({
        context,
        requiredPermission,
        brandAuthorizer,
        toolInput: input,
        handler: (_context, toolInput) => handler(toolInput),
      }),
    );
  };
  server.registerTool(
    'list_brands',
    { description: 'List brands visible to the authenticated organization.' },
    async () => {
      await limitTool();
      requirePermission(context, 'brand:read');
      return response(await handlers.listBrands(context));
    },
  );
  server.registerTool(
    'get_brand',
    {
      description: 'Get a brand in the authenticated organization.',
      inputSchema: { brandId: brand },
    },
    async (input) =>
      withBrand(input, 'brand:read', (brandInput) => handlers.getBrand(context, brandInput)),
  );
  server.registerTool(
    'search_knowledge',
    {
      description: 'Search only the selected brand knowledge base.',
      inputSchema: { brandId: brand, query: z.string().min(1).max(1000) },
    },
    async (input) =>
      withBrand(input, 'brand:read', (brandInput) => handlers.searchKnowledge(context, brandInput)),
  );
  server.registerTool(
    'add_research_item',
    {
      description: 'Add a text research item to the selected brand.',
      inputSchema: {
        brandId: brand,
        title: z.string().min(1).max(500),
        content: z.string().min(1).max(100_000),
      },
    },
    async (input) =>
      withBrand(input, 'content:write', (brandInput) =>
        handlers.addResearchItem(context, brandInput),
      ),
  );
  server.registerTool(
    'list_content_opportunities',
    {
      description: 'List content opportunities for the selected brand.',
      inputSchema: { brandId: brand },
    },
    async (input) =>
      withBrand(input, 'brand:read', (brandInput) =>
        handlers.listContentOpportunities(context, brandInput),
      ),
  );
  server.registerTool(
    'create_content_project',
    {
      description: 'Create a content project for the selected brand.',
      inputSchema: {
        brandId: brand,
        title: z.string().min(1).max(500),
        contentType: z.string().min(1).max(80),
      },
    },
    async (input) =>
      withBrand(input, 'content:write', (brandInput) =>
        handlers.createContentProject(context, brandInput),
      ),
  );
  server.registerTool(
    'get_content_project',
    {
      description: 'Get a content project in the selected brand.',
      inputSchema: { brandId: brand, contentProjectId: z.string().uuid() },
    },
    async (input) =>
      withBrand(input, 'brand:read', (brandInput) =>
        handlers.getContentProject(context, brandInput),
      ),
  );
  server.registerTool(
    'generate_content_draft',
    {
      description: 'Generate a draft only through the configured content application service.',
      inputSchema: { brandId: brand, contentProjectId: z.string().uuid() },
    },
    async (input) =>
      withBrand(input, 'content:write', (brandInput) =>
        handlers.generateContentDraft(context, brandInput),
      ),
  );
  server.registerTool(
    'request_content_review',
    {
      description: 'Request a review for a content project.',
      inputSchema: { brandId: brand, contentProjectId: z.string().uuid() },
    },
    async (input) =>
      withBrand(input, 'content:write', (brandInput) =>
        handlers.requestContentReview(context, brandInput),
      ),
  );
  server.registerTool(
    'get_publication_calendar',
    {
      description: 'Get the selected brand publication calendar.',
      inputSchema: { brandId: brand },
    },
    async (input) =>
      withBrand(input, 'brand:read', (brandInput) =>
        handlers.getPublicationCalendar(context, brandInput),
      ),
  );
  server.registerTool(
    'get_analytics_summary',
    { description: 'Get the selected brand analytics summary.', inputSchema: { brandId: brand } },
    async (input) =>
      withBrand(input, 'brand:read', (brandInput) =>
        handlers.getAnalyticsSummary(context, brandInput),
      ),
  );
  return server;
}
