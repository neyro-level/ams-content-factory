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
    const consume = vi.fn().mockResolvedValue(undefined);

    const result = await startMcpRuntime({
      apiKey: 'amscf_1234567890123456789012345678901234567890123',
      resolver: { resolve },
      rateLimiter: { consume },
      transport,
      createServer,
    });

    expect(resolve).toHaveBeenCalledWith({
      authorization: 'Bearer amscf_1234567890123456789012345678901234567890123',
      requiredScope: 'READ',
    });
    expect(consume).toHaveBeenCalledTimes(1);
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
    const consume = vi.fn().mockResolvedValue(undefined);

    await expect(
      startMcpRuntime({
        apiKey: 'amscf_1234567890123456789012345678901234567890123',
        resolver: { resolve },
        rateLimiter: { consume },
        createServer,
      }),
    ).rejects.toThrow('Authentication failed');
    expect(createServer).not.toHaveBeenCalled();
  });
});
