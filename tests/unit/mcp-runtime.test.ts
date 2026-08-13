import { describe, expect, it, vi } from 'vitest';

import { McpRuntimeConfigurationError, startMcpRuntime } from '../../apps/mcp/src/runtime.js';

const context = {
  organizationId: 'org-1',
  userId: 'user-1',
  apiKeyId: 'key-1',
  scopes: ['READ'] as const,
  permissions: new Set(),
};

describe('MCP stdio runtime', () => {
  it('authenticates before connecting a real server transport', async () => {
    const resolve = vi.fn().mockResolvedValue(context);
    const connect = vi.fn().mockResolvedValue(undefined);
    const transport = {};
    const createServer = vi.fn().mockReturnValue({ connect });

    const result = await startMcpRuntime({
      apiKey: 'amscf_1234567890123456789012345678901234567890123',
      resolver: { resolve },
      transport,
      createServer,
    });

    expect(resolve).toHaveBeenCalledWith({
      authorization: 'Bearer amscf_1234567890123456789012345678901234567890123',
      requiredScope: 'READ',
    });
    expect(createServer).toHaveBeenCalledWith(context);
    expect(connect).toHaveBeenCalledWith(transport);
    expect(result.context).toBe(context);
  });

  it('fails before constructing a server when no API key is configured', async () => {
    const createServer = vi.fn();

    await expect(startMcpRuntime({ apiKey: '', createServer })).rejects.toBeInstanceOf(
      McpRuntimeConfigurationError,
    );
    expect(createServer).not.toHaveBeenCalled();
  });

  it('does not construct a server when authentication fails', async () => {
    const createServer = vi.fn();
    const resolve = vi.fn().mockRejectedValue(new Error('Authentication failed'));

    await expect(
      startMcpRuntime({
        apiKey: 'amscf_1234567890123456789012345678901234567890123',
        resolver: { resolve },
        createServer,
      }),
    ).rejects.toThrow('Authentication failed');
    expect(createServer).not.toHaveBeenCalled();
  });
});
