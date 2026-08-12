import 'dotenv/config';
import { AccessDeniedError, createBrandService } from '../../packages/core/src/index.js';
import {
  createPrismaClient,
  createTenantRepository,
  MembershipRole,
  MembershipStatus,
} from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const brands = createBrandService(tenants);
const prefix = 'w5-brands-contract';

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('brand application service', () => {
  it('creates a managed brand in the authorized organization and rejects editor and foreign contexts', async () => {
    const [owner, editor, foreignUser] = await Promise.all(
      ['owner', 'editor', 'foreign'].map((kind) =>
        prisma.user.create({ data: { name: kind, email: `${prefix}-${kind}@local` } }),
      ),
    );
    const organization = await tenants.createOrganizationWithOwner({
      ownerUserId: owner.id,
      name: 'Brand contract',
      slug: `${prefix}-organization`,
    });
    const foreignOrganization = await tenants.createOrganizationWithOwner({
      ownerUserId: foreignUser.id,
      name: 'Foreign brand contract',
      slug: `${prefix}-foreign`,
    });
    await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: editor.id,
        role: MembershipRole.EDITOR,
        status: MembershipStatus.ACTIVE,
      },
    });

    const first = await brands.create(
      { userId: owner.id, organizationId: organization.id },
      'Primary Brand',
    );
    const duplicateName = await brands.create(
      { userId: owner.id, organizationId: organization.id },
      'Primary Brand',
    );
    expect(duplicateName.slug).not.toBe(first.slug);
    await expect(
      prisma.brandAccess.findUnique({
        where: { brandId_userId: { brandId: first.id, userId: owner.id } },
      }),
    ).resolves.toEqual(expect.objectContaining({ role: 'MANAGE' }));
    await expect(
      brands.list({ userId: owner.id, organizationId: organization.id }),
    ).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: first.id })]));

    await expect(
      brands.create(
        { userId: editor.id, organizationId: organization.id },
        'Forbidden Editor Brand',
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      brands.list({ userId: owner.id, organizationId: foreignOrganization.id }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
