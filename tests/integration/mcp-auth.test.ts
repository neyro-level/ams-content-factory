import 'dotenv/config';
import { createMcpAuthService, verifyHmacSignature } from '../../packages/core/src/index.js';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';
import { createHmac } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const slug = 'mcp-auth-contract';
const email = `${slug}@local`;

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('MCP authentication', () => {
  it('stores only token hashes, enforces scope and validates HMAC', async () => {
    await prisma.organization.deleteMany({ where: { slug } });
    const user = await prisma.user.upsert({
      where: { email },
      create: { name: slug, email },
      update: {},
    });
    const organization = await tenants.createOrganizationWithOwner({
      ownerUserId: user.id,
      name: slug,
      slug,
    });
    const service = createMcpAuthService({ prisma });
    const created = await service.createKey({
      organizationId: organization.id,
      name: 'read-only',
      scopes: ['READ'],
    });
    const stored = await prisma.apiKey.findUniqueOrThrow({ where: { id: created.key.id } });
    expect(stored.tokenHash).not.toContain(created.token);
    expect(await service.authenticate(created.token, 'READ')).toEqual(
      expect.objectContaining({ organizationId: organization.id }),
    );
    await expect(service.authenticate(created.token, 'WRITE')).resolves.toBeNull();
    await service.revoke({ organizationId: organization.id, id: created.key.id });
    await expect(service.authenticate(created.token, 'READ')).resolves.toBeNull();
    const payload = '{"kind":"research"}';
    const secret = 'test-webhook-secret';
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifyHmacSignature({ secret, payload, signature })).toBe(true);
    expect(verifyHmacSignature({ secret, payload, signature: '00' })).toBe(false);
  });
});
