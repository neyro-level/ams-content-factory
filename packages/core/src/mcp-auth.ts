import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createMcpRepository, type ApiKeyScope, type PrismaClient } from '@ams-content-factory/db';
import { requirePermission, type Permission } from './tenant-context';

export type McpScope = ApiKeyScope;
const scopePermission: Record<McpScope, Permission[]> = {
  READ: ['brand:read'],
  WRITE: ['content:write'],
  APPROVE: ['content:review'],
  ADMIN: ['brand:manage'],
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export function createMcpAuthService(options: { prisma?: PrismaClient } = {}) {
  const repository = createMcpRepository(options.prisma);
  return {
    async createKey(input: {
      organizationId: string;
      name: string;
      scopes: McpScope[];
      expiresAt?: Date;
    }) {
      if (!input.scopes.length) throw new Error('An API key requires at least one scope.');
      const token = `amscf_${randomBytes(32).toString('base64url')}`;
      const key = await repository.createApiKey({ ...input, tokenHash: hash(token) });
      return { key, token };
    },
    async authenticate(token: string, required: McpScope) {
      const key = await repository.findActiveApiKey(hash(token));
      if (!key || !(key.scopes.includes(required) || key.scopes.includes('ADMIN'))) return null;
      await repository.markApiKeyUsed(key.id);
      return {
        organizationId: key.organizationId,
        apiKeyId: key.id,
        scopes: key.scopes,
        permissions: new Set(key.scopes.flatMap((scope) => scopePermission[scope])),
      };
    },
    authorize(context: { permissions: Set<Permission> }, permission: Permission) {
      requirePermission(context, permission);
    },
    revoke(input: { organizationId: string; id: string }) {
      return repository.revokeApiKey(input);
    },
    list(organizationId: string) {
      return repository.listApiKeys(organizationId);
    },
  };
}

export function verifyHmacSignature(input: { secret: string; payload: string; signature: string }) {
  const expected = createHmac('sha256', input.secret).update(input.payload).digest('hex');
  const actual = Buffer.from(input.signature, 'hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}
