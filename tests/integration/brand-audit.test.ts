import 'dotenv/config';
import { createBrandService } from '../../packages/core/src/index.js';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const slug = 'brand-audit-contract';
const email = `${slug}@local`;

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { organization: { is: { slug } } } });
  await prisma.organization.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('brand audit events', () => {
  it('persists brand.create with scoped actor and safe metadata', async () => {
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
    const service = createBrandService(tenants);
    const brand = await service.create(
      { userId: user.id, organizationId: organization.id },
      'Audit brand',
    );

    expect(
      await prisma.auditLog.findFirst({
        where: { organizationId: organization.id, action: 'brand.create', entityId: brand.id },
      }),
    ).toMatchObject({
      brandId: brand.id,
      actorUserId: user.id,
      entityType: 'Brand',
      metadata: { slug: 'audit-brand' },
    });
  });
});
