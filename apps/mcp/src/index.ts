import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export type McpToolResult = { text: string };
export type McpApplicationHandlers = {
  listBrands(): Promise<McpToolResult>;
  getBrand(input: { brandId: string }): Promise<McpToolResult>;
  searchKnowledge(input: { brandId: string; query: string }): Promise<McpToolResult>;
  addResearchItem(input: {
    brandId: string;
    title: string;
    content: string;
  }): Promise<McpToolResult>;
  listContentOpportunities(input: { brandId: string }): Promise<McpToolResult>;
  createContentProject(input: {
    brandId: string;
    title: string;
    contentType: string;
  }): Promise<McpToolResult>;
  getContentProject(input: { brandId: string; contentProjectId: string }): Promise<McpToolResult>;
  generateContentDraft(input: {
    brandId: string;
    contentProjectId: string;
  }): Promise<McpToolResult>;
  requestContentReview(input: {
    brandId: string;
    contentProjectId: string;
  }): Promise<McpToolResult>;
  getPublicationCalendar(input: { brandId: string }): Promise<McpToolResult>;
  getAnalyticsSummary(input: { brandId: string }): Promise<McpToolResult>;
};

const response = (result: McpToolResult) => ({
  content: [{ type: 'text' as const, text: result.text }],
});
const brand = z.string().uuid();

/**
 * Transport and authentication are composed at the application edge. Tool execution is
 * delegated to core application services so MCP never becomes a second business-logic layer.
 */
export function createMcpServer(handlers: McpApplicationHandlers) {
  const server = new McpServer({ name: 'ams-content-factory', version: '0.1.0' });
  server.registerTool(
    'list_brands',
    { description: 'List brands visible to the authenticated organization.' },
    async () => response(await handlers.listBrands()),
  );
  server.registerTool(
    'get_brand',
    {
      description: 'Get a brand in the authenticated organization.',
      inputSchema: { brandId: brand },
    },
    async (input) => response(await handlers.getBrand(input)),
  );
  server.registerTool(
    'search_knowledge',
    {
      description: 'Search only the selected brand knowledge base.',
      inputSchema: { brandId: brand, query: z.string().min(1).max(1000) },
    },
    async (input) => response(await handlers.searchKnowledge(input)),
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
    async (input) => response(await handlers.addResearchItem(input)),
  );
  server.registerTool(
    'list_content_opportunities',
    {
      description: 'List content opportunities for the selected brand.',
      inputSchema: { brandId: brand },
    },
    async (input) => response(await handlers.listContentOpportunities(input)),
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
    async (input) => response(await handlers.createContentProject(input)),
  );
  server.registerTool(
    'get_content_project',
    {
      description: 'Get a content project in the selected brand.',
      inputSchema: { brandId: brand, contentProjectId: z.string().uuid() },
    },
    async (input) => response(await handlers.getContentProject(input)),
  );
  server.registerTool(
    'generate_content_draft',
    {
      description: 'Generate a draft only through the configured content application service.',
      inputSchema: { brandId: brand, contentProjectId: z.string().uuid() },
    },
    async (input) => response(await handlers.generateContentDraft(input)),
  );
  server.registerTool(
    'request_content_review',
    {
      description: 'Request a review for a content project.',
      inputSchema: { brandId: brand, contentProjectId: z.string().uuid() },
    },
    async (input) => response(await handlers.requestContentReview(input)),
  );
  server.registerTool(
    'get_publication_calendar',
    {
      description: 'Get the selected brand publication calendar.',
      inputSchema: { brandId: brand },
    },
    async (input) => response(await handlers.getPublicationCalendar(input)),
  );
  server.registerTool(
    'get_analytics_summary',
    { description: 'Get the selected brand analytics summary.', inputSchema: { brandId: brand } },
    async (input) => response(await handlers.getAnalyticsSummary(input)),
  );
  return server;
}
