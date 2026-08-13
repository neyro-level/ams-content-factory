import 'dotenv/config';
import {
  McpBrandScopeError,
  createMcpBrandScopeService,
  type McpAuthContext,
} from '../../packages/core/src/index.js';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const slug = 'mcp-brand-scope-contract';
const email = `${slug}@local`;

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('MCP brand scope', () => {
  it('accepts only an active brand in the API key organization', async () => {
    await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
    const user = await prisma.user.upsert({
      where: { email },
      create: { name: slug, email },
      update: {},
    });
    const firstOrganization = await tenants.createOrganizationWithOwner({
      ownerUserId: user.id,
      name: 'MCP first',
      slug: `${slug}-first`,
    });
    const secondOrganization = await tenants.createOrganizationWithOwner({
      ownerUserId: user.id,
      name: 'MCP second',
      slug: `${slug}-second`,
    });
    const activeBrand = await tenants.createBrand({
      organizationId: firstOrganization.id,
      userId: user.id,
      ownerUserId: user.id,
      name: 'MCP active',
      slug: 'mcp-active',
    });
    const foreignBrand = await tenants.createBrand({
      organizationId: secondOrganization.id,
      ownerUserId: user.id,
      name: 'MCP foreign',
      slug: 'mcp-foreign',
    });
    const context: McpAuthContext = Object.freeze({
      organizationId: firstOrganization.id,
      apiKeyId: 'mcp-key',
      scopes: ['READ'],
      permissions: new Set(['brand:read']),
    });
    const scope = createMcpBrandScopeService(tenants);

    await expect(scope.assertBrand(context, activeBrand.id)).resolves.toBeUndefined();
    await expect(scope.assertBrand(context, foreignBrand.id)).rejects.toBeInstanceOf(
      McpBrandScopeError,
    );
    await prisma.brand.update({ where: { id: activeBrand.id }, data: { deletedAt: new Date() } });
    await expect(scope.assertBrand(context, activeBrand.id)).rejects.toBeInstanceOf(
      McpBrandScopeError,
    );
  });
});
