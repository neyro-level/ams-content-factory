import 'dotenv/config';
import {
  AccessDeniedError,
  requirePermission,
  resolveTenantContext,
} from '../../packages/core/src/index.js';
import {
  createPrismaClient,
  createTenantRepository,
  MembershipRole,
  MembershipStatus,
} from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const repository = createTenantRepository(prisma);
const suffix = 'wave1-tenant-contract';

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: suffix } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: suffix } } });
  await prisma.$disconnect();
});

describe('tenant context', () => {
  it('scopes brands to the active organization and rejects cross-tenant access', async () => {
    const [owner, editor] = await Promise.all(
      ['owner', 'editor'].map((name) =>
        prisma.user.create({ data: { name, email: `${suffix}-${name}@local` } }),
      ),
    );
    const organization = await repository.createOrganizationWithOwner({
      ownerUserId: owner.id,
      name: 'Wave 1 Tenant',
      slug: `${suffix}-organization`,
    });
    const otherOrganization = await repository.createOrganizationWithOwner({
      ownerUserId: owner.id,
      name: 'Other Tenant',
      slug: `${suffix}-other`,
    });
    const brand = await repository.createBrand({
      organizationId: organization.id,
      name: 'Scoped Brand',
      slug: 'scoped-brand',
    });
    const foreignBrand = await repository.createBrand({
      organizationId: otherOrganization.id,
      name: 'Foreign Brand',
      slug: 'foreign-brand',
    });
    await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: editor.id,
        role: MembershipRole.EDITOR,
        status: MembershipStatus.ACTIVE,
      },
    });

    const context = await resolveTenantContext(
      { userId: editor.id, organizationId: organization.id, brandId: brand.id },
      repository,
    );

    expect(context.permissions.has('content:write')).toBe(true);
    expect(() => requirePermission(context, 'brand:manage')).toThrow(AccessDeniedError);
    await expect(
      resolveTenantContext(
        { userId: editor.id, organizationId: organization.id, brandId: foreignBrand.id },
        repository,
      ),
    ).rejects.toThrow(AccessDeniedError);
  });
});
