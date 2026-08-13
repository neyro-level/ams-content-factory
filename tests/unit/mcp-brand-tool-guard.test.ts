import { describe, expect, it, vi } from 'vitest';
import { executeMcpBrandTool } from '../../apps/mcp/src/index.js';
import type { McpAuthContext } from '../../packages/core/src/index.js';

const context: McpAuthContext = Object.freeze({
  organizationId: 'organization-id',
  userId: 'user-id',
  apiKeyId: 'key-id',
  scopes: ['READ'],
  permissions: new Set(['brand:read']),
});

describe('MCP brand tool guard', () => {
  it('checks the brand before invoking the tool handler', async () => {
    const assertBrand = vi.fn().mockRejectedValue(new Error('foreign brand'));
    const handler = vi.fn().mockResolvedValue({ text: 'must not run' });

    await expect(
      executeMcpBrandTool({
        context,
        requiredPermission: 'brand:read',
        brandAuthorizer: { assertBrand },
        toolInput: { brandId: 'foreign-brand' },
        handler,
      }),
    ).rejects.toThrow('foreign brand');
    expect(handler).not.toHaveBeenCalled();
  });

  it('forwards the authenticated context only after a brand passes the guard', async () => {
    const assertBrand = vi.fn().mockResolvedValue(undefined);
    const handler = vi.fn().mockResolvedValue({ text: 'allowed' });

    await expect(
      executeMcpBrandTool({
        context,
        requiredPermission: 'brand:read',
        brandAuthorizer: { assertBrand },
        toolInput: { brandId: 'active-brand' },
        handler,
      }),
    ).resolves.toEqual({ text: 'allowed' });
    expect(assertBrand).toHaveBeenCalledWith(context, 'active-brand');
    expect(handler).toHaveBeenCalledWith(context, { brandId: 'active-brand' });
  });

  it('rejects a write tool before the brand check or handler for a read-only key', async () => {
    const assertBrand = vi.fn();
    const handler = vi.fn();

    await expect(
      executeMcpBrandTool({
        context,
        requiredPermission: 'content:write',
        brandAuthorizer: { assertBrand },
        toolInput: { brandId: 'active-brand' },
        handler,
      }),
    ).rejects.toThrow('Permission required: content:write');
    expect(assertBrand).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});
