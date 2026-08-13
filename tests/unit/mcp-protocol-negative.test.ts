import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';

import { createMcpServer } from '../../apps/mcp/src/index.js';
import type { McpApplicationHandlers } from '../../apps/mcp/src/index.js';
import type { McpAuthContext } from '../../packages/core/src/index.js';

const context: McpAuthContext = Object.freeze({
  organizationId: 'organization-id',
  userId: 'user-id',
  apiKeyId: 'key-id',
  scopes: ['READ'],
  permissions: new Set(['brand:read']),
});

function handlers(): McpApplicationHandlers {
  const read = vi.fn().mockResolvedValue({ text: 'ok' });
  const write = vi.fn().mockResolvedValue({ text: 'must not run' });
  return {
    listBrands: read,
    getBrand: write,
    searchKnowledge: write,
    addResearchItem: write,
    listContentOpportunities: write,
    createContentProject: write,
    getContentProject: write,
    generateContentDraft: write,
    requestContentReview: write,
    getPublicationCalendar: write,
    getAnalyticsSummary: write,
  };
}

async function connectedServer() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const application = handlers();
  const brandAuthorizer = { assertBrand: vi.fn().mockResolvedValue(undefined) };
  const server = createMcpServer(context, application, brandAuthorizer);
  await server.connect(serverTransport);
  const client = new Client({ name: 'mcp-negative-test', version: '1.0.0' });
  await client.connect(clientTransport);
  return { application, brandAuthorizer, client, clientTransport, serverTransport };
}

describe('MCP protocol negative boundary', () => {
  it('returns an error for a write tool invoked with a read-only key before handler execution', async () => {
    const connection = await connectedServer();
    const result = await connection.client.callTool({
      name: 'add_research_item',
      arguments: {
        brandId: '00000000-0000-4000-8000-000000000001',
        title: 'Blocked',
        content: 'Must not be persisted.',
      },
    });

    expect(result).toMatchObject({ isError: true });
    expect(connection.brandAuthorizer.assertBrand).not.toHaveBeenCalled();
    expect(connection.application.addResearchItem).not.toHaveBeenCalled();
    await connection.clientTransport.close();
    await connection.serverTransport.close();
  });

  it('rejects an unknown MCP tool instead of routing it to an application handler', async () => {
    const connection = await connectedServer();

    await expect(
      connection.client.callTool({ name: 'unknown_tool', arguments: {} }),
    ).resolves.toMatchObject({
      isError: true,
    });
    expect(connection.application.listBrands).not.toHaveBeenCalled();
    await connection.clientTransport.close();
    await connection.serverTransport.close();
  });
});
