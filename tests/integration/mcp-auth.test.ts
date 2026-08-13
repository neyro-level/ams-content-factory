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
  await prisma.auditLog.deleteMany({ where: { organization: { is: { slug } } } });
  await prisma.organization.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('MCP authentication', () => {
  it('stores only token hashes and marks usage only after a successful scoped authentication', async () => {
    await prisma.auditLog.deleteMany({ where: { organization: { is: { slug } } } });
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
      actorUserId: user.id,
      name: 'read-only',
      scopes: ['READ'],
    });
    const stored = await prisma.apiKey.findUniqueOrThrow({ where: { id: created.key.id } });
    expect(stored.tokenHash).not.toContain(created.token);
    expect(
      await prisma.auditLog.findFirst({
        where: {
          organizationId: organization.id,
          action: 'api_key.create',
          entityId: created.key.id,
        },
      }),
    ).toMatchObject({
      actorUserId: user.id,
      entityType: 'ApiKey',
      metadata: { name: 'read-only', scopes: ['READ'] },
    });
    expect(stored.lastUsedAt).toBeNull();
    const context = await service.authenticate(created.token, 'READ');
    expect(context).toEqual(
      expect.objectContaining({ organizationId: organization.id, userId: user.id }),
    );
    expect(
      (await prisma.apiKey.findUniqueOrThrow({ where: { id: created.key.id } })).lastUsedAt,
    ).toBeNull();
    await expect(service.authenticate(created.token, 'WRITE')).resolves.toBeNull();
    expect(
      (await prisma.apiKey.findUniqueOrThrow({ where: { id: created.key.id } })).lastUsedAt,
    ).toBeNull();
    await service.markUsed(context!);
    expect(
      (await prisma.apiKey.findUniqueOrThrow({ where: { id: created.key.id } })).lastUsedAt,
    ).toBeInstanceOf(Date);
    await service.revoke({
      organizationId: organization.id,
      id: created.key.id,
      actorUserId: user.id,
    });
    expect(
      await prisma.auditLog.findFirst({
        where: {
          organizationId: organization.id,
          action: 'api_key.revoke',
          entityId: created.key.id,
        },
      }),
    ).toMatchObject({ actorUserId: user.id, entityType: 'ApiKey' });
    await expect(service.authenticate(created.token, 'READ')).resolves.toBeNull();
    const payload = '{"kind":"research"}';
    const secret = 'test-webhook-secret';
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifyHmacSignature({ secret, payload, signature })).toBe(true);
    expect(verifyHmacSignature({ secret, payload, signature: '00' })).toBe(false);
  });

  it('fails closed for legacy unbound keys and when the bound actor organization is suspended', async () => {
    await prisma.auditLog.deleteMany({ where: { organization: { is: { slug } } } });
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
    const bound = await service.createKey({
      organizationId: organization.id,
      actorUserId: user.id,
      name: 'bound',
      scopes: ['READ'],
    });
    await prisma.apiKey.create({
      data: {
        organizationId: organization.id,
        name: 'legacy-unbound',
        tokenHash: 'legacy-unbound-token-hash',
        scopes: ['READ'],
      },
    });

    await expect(service.authenticate('legacy-unbound-token', 'READ')).resolves.toBeNull();
    await prisma.organization.update({
      where: { id: organization.id },
      data: { status: 'SUSPENDED' },
    });
    await expect(service.authenticate(bound.token, 'READ')).resolves.toBeNull();
  });

  it('fails closed for an expired key without updating its usage timestamp', async () => {
    await prisma.auditLog.deleteMany({ where: { organization: { is: { slug } } } });
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
    const expired = await service.createKey({
      organizationId: organization.id,
      actorUserId: user.id,
      name: 'expired',
      scopes: ['READ'],
      expiresAt: new Date(Date.now() - 1_000),
    });

    await expect(service.authenticate(expired.token, 'READ')).resolves.toBeNull();
    expect(
      (await prisma.apiKey.findUniqueOrThrow({ where: { id: expired.key.id } })).lastUsedAt,
    ).toBeNull();
  });
});
