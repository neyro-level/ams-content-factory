import 'dotenv/config';
import {
  AccessDeniedError,
  requirePermission,
  resolveTenantContext,
} from '../../packages/core/src/index.js';
import {
  createPrismaClient,
  createTenantRepository,
  BrandStatus,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
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
    const [owner, editor, admin] = await Promise.all(
      ['owner', 'editor', 'admin'].map((name) =>
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

    await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: admin.id,
        role: MembershipRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      },
    });
    await prisma.organization.update({
      where: { id: organization.id },
      data: { status: OrganizationStatus.SUSPENDED },
    });
    await expect(
      resolveTenantContext({ userId: owner.id, organizationId: organization.id }, repository),
    ).rejects.toThrow(AccessDeniedError);
    await expect(
      resolveTenantContext({ userId: admin.id, organizationId: organization.id }, repository),
    ).rejects.toThrow(AccessDeniedError);

    await prisma.organization.update({
      where: { id: organization.id },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await prisma.membership.updateMany({
      where: { organizationId: organization.id, userId: editor.id },
      data: { status: MembershipStatus.SUSPENDED },
    });
    await expect(
      resolveTenantContext({ userId: editor.id, organizationId: organization.id }, repository),
    ).rejects.toThrow(AccessDeniedError);

    await prisma.membership.updateMany({
      where: { organizationId: organization.id, userId: editor.id },
      data: { status: MembershipStatus.ACTIVE },
    });
    await prisma.brand.update({
      where: { id: brand.id },
      data: { status: BrandStatus.ARCHIVED },
    });
    await expect(
      resolveTenantContext(
        { userId: editor.id, organizationId: organization.id, brandId: brand.id },
        repository,
      ),
    ).rejects.toThrow(AccessDeniedError);

    await prisma.brand.update({
      where: { id: brand.id },
      data: { status: BrandStatus.ACTIVE, deletedAt: new Date() },
    });
    await expect(
      resolveTenantContext(
        { userId: editor.id, organizationId: organization.id, brandId: brand.id },
        repository,
      ),
    ).rejects.toThrow(AccessDeniedError);
  });
});
