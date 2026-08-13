import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  createMcpRepository,
  createTenantRepository,
  type ApiKeyScope,
  type PrismaClient,
  type TenantRepository,
} from '@ams-content-factory/db';
import { requirePermission, resolveTenantContext, type Permission } from './tenant-context';

export type McpScope = ApiKeyScope;
export type McpAuthContext = Readonly<{
  organizationId: string;
  userId: string;
  apiKeyId: string;
  scopes: McpScope[];
  permissions: Set<Permission>;
}>;

export class McpBrandScopeError extends Error {
  constructor() {
    super('The brand is outside the authenticated MCP organization.');
    this.name = 'McpBrandScopeError';
  }
}
const scopePermission: Record<McpScope, Permission[]> = {
  READ: ['brand:read'],
  WRITE: ['content:write'],
  APPROVE: ['content:review'],
  ADMIN: ['brand:manage'],
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export function createMcpAuthService(options: { prisma?: PrismaClient } = {}) {
  const repository = createMcpRepository(options.prisma);
  const tenants = createTenantRepository(options.prisma);
  return {
    async createKey(input: {
      organizationId: string;
      actorUserId: string;
      name: string;
      scopes: McpScope[];
      expiresAt?: Date;
    }) {
      if (!input.scopes.length) throw new Error('An API key requires at least one scope.');
      const token = `amscf_${randomBytes(32).toString('base64url')}`;
      const actor = await resolveTenantContext({
        organizationId: input.organizationId,
        userId: input.actorUserId,
      });
      requirePermission(actor, 'brand:manage');
      const key = await repository.createApiKey({ ...input, tokenHash: hash(token) });
      await tenants.appendAuditLog({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: 'api_key.create',
        entityType: 'ApiKey',
        entityId: key.id,
        metadata: { name: key.name, scopes: key.scopes },
      });
      return { key, token };
    },
    async authenticate(token: string, required: McpScope): Promise<McpAuthContext | null> {
      const key = await repository.findActiveApiKey(hash(token));
      if (!key || !(key.scopes.includes(required) || key.scopes.includes('ADMIN'))) return null;
      if (!key.actorUserId) return null;
      let actor;
      try {
        actor = await resolveTenantContext({
          organizationId: key.organizationId,
          userId: key.actorUserId,
        });
      } catch {
        return null;
      }
      const granted = new Set(key.scopes.flatMap((scope) => scopePermission[scope]));
      return Object.freeze({
        organizationId: key.organizationId,
        userId: key.actorUserId,
        apiKeyId: key.id,
        scopes: [...key.scopes],
        permissions: new Set(
          [...actor.permissions].filter((permission) => granted.has(permission)),
        ),
      });
    },
    markUsed(context: McpAuthContext) {
      return repository.markApiKeyUsed({
        organizationId: context.organizationId,
        id: context.apiKeyId,
      });
    },
    authorize(context: { permissions: Set<Permission> }, permission: Permission) {
      requirePermission(context, permission);
    },
    async revoke(input: { organizationId: string; id: string; actorUserId?: string }) {
      const result = await repository.revokeApiKey(input);
      if (result.count === 1) {
        await tenants.appendAuditLog({
          organizationId: input.organizationId,
          ...(input.actorUserId === undefined ? {} : { actorUserId: input.actorUserId }),
          action: 'api_key.revoke',
          entityType: 'ApiKey',
          entityId: input.id,
        });
      }
      return result;
    },
    list(organizationId: string, input: { take?: number; cursor?: string } = {}) {
      return repository.listApiKeys({ organizationId, ...input });
    },
  };
}

export function createMcpBrandScopeService(
  tenantRepository: TenantRepository = createTenantRepository(),
) {
  return {
    async assertBrand(context: McpAuthContext, brandId: string) {
      if (!(await tenantRepository.findBrandInOrganization(context.organizationId, brandId))) {
        throw new McpBrandScopeError();
      }
    },
  };
}

export function verifyHmacSignature(input: { secret: string; payload: string; signature: string }) {
  const expected = createHmac('sha256', input.secret).update(input.payload).digest('hex');
  const actual = Buffer.from(input.signature, 'hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}
