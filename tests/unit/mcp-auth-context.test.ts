import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  McpAuthenticationError,
  createMcpAuthContextResolver,
} from '../../apps/mcp/src/auth-context.js';

const token = `amscf_${randomBytes(32).toString('base64url')}`;

describe('MCP authentication context resolver', () => {
  it('requires an exact bearer token and exposes only authenticated context', async () => {
    const authenticate = vi.fn().mockResolvedValue({
      organizationId: 'organization-id',
      userId: 'user-id',
      apiKeyId: 'key-id',
      scopes: ['READ'],
      permissions: new Set(['brand:read']),
    });
    const markUsed = vi.fn().mockResolvedValue({ count: 1 });
    const resolver = createMcpAuthContextResolver({ authenticate, markUsed });

    await expect(resolver.resolve({ requiredScope: 'READ' })).rejects.toBeInstanceOf(
      McpAuthenticationError,
    );
    await expect(
      resolver.resolve({ authorization: `Bearer ${token}`, requiredScope: 'READ' }),
    ).resolves.toEqual(
      expect.objectContaining({ organizationId: 'organization-id', apiKeyId: 'key-id' }),
    );
    expect(authenticate).toHaveBeenCalledWith(token, 'READ');
    expect(markUsed).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'organization-id', apiKeyId: 'key-id' }),
    );
  });

  it('fails closed when the authenticated key has no required scope', async () => {
    const markUsed = vi.fn();
    const resolver = createMcpAuthContextResolver({
      authenticate: vi.fn().mockResolvedValue(null),
      markUsed,
    });

    await expect(
      resolver.resolve({ authorization: `Bearer ${token}`, requiredScope: 'WRITE' }),
    ).rejects.toBeInstanceOf(McpAuthenticationError);
    expect(markUsed).not.toHaveBeenCalled();
  });
});
