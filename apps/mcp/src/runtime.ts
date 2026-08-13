import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpAuthContext } from '@ams-content-factory/core';

import { createMcpAuthContextResolver } from './auth-context.js';

export type McpRuntimeResolver = Pick<ReturnType<typeof createMcpAuthContextResolver>, 'resolve'>;

export type StartableMcpServer = {
  connect(transport: unknown): Promise<void>;
};

export class McpRuntimeConfigurationError extends Error {
  constructor(message = 'MCP_API_KEY must contain a scoped AMS Content Factory API key.') {
    super(message);
    this.name = 'McpRuntimeConfigurationError';
  }
}

function runtimeApiKey(apiKey: string | undefined) {
  if (!apiKey) throw new McpRuntimeConfigurationError();
  return apiKey;
}

/**
 * Starts the process-level MCP transport only after resolving a read-scoped API key.
 * The bearer key is intentionally confined to this edge; application handlers receive
 * McpAuthContext without the secret.
 */
export async function startMcpRuntime(input: {
  createServer: (context: McpAuthContext) => StartableMcpServer;
  apiKey?: string;
  resolver?: McpRuntimeResolver;
  transport?: unknown;
}) {
  const apiKey = runtimeApiKey(input.apiKey ?? process.env.MCP_API_KEY);
  const resolver = input.resolver ?? createMcpAuthContextResolver();
  const context = await resolver.resolve({
    authorization: `Bearer ${apiKey}`,
    requiredScope: 'READ',
  });
  const server = input.createServer(context);
  await server.connect(input.transport ?? new StdioServerTransport());
  return { context, server };
}
