import 'dotenv/config';
import {
  AccessDeniedError,
  createKnowledgeWorkspaceService,
} from '../../packages/core/src/index.js';
import {
  createKnowledgeRepository,
  createPrismaClient,
  createTenantRepository,
  KnowledgeDocumentType,
} from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const knowledge = createKnowledgeRepository(prisma);
const workspace = createKnowledgeWorkspaceService({
  knowledgeRepository: knowledge,
  tenantRepository: tenants,
});
const prefix = 'w6-knowledge-workspace';

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('knowledge workspace application service', () => {
  it('lists only the active brand documents and rejects a foreign organization context', async () => {
    const [user, foreignUser] = await Promise.all([
      prisma.user.create({ data: { name: 'Knowledge workspace', email: `${prefix}@local` } }),
      prisma.user.create({ data: { name: 'Foreign workspace', email: `${prefix}-foreign@local` } }),
    ]);
    const organization = await tenants.createOrganizationWithOwner({
      ownerUserId: user.id,
      name: 'Knowledge workspace',
      slug: prefix,
    });
    const [firstBrand, secondBrand, foreignOrganization] = await Promise.all([
      tenants.createBrand({ organizationId: organization.id, name: 'First', slug: 'first' }),
      tenants.createBrand({ organizationId: organization.id, name: 'Second', slug: 'second' }),
      tenants.createOrganizationWithOwner({
        ownerUserId: foreignUser.id,
        name: 'Foreign workspace',
        slug: `${prefix}-foreign`,
      }),
    ]);
    const foreignBrand = await tenants.createBrand({
      organizationId: foreignOrganization.id,
      name: 'Foreign',
      slug: 'foreign',
    });
    await tenants.grantBrandAccess({ brandId: firstBrand.id, userId: user.id, role: 'MANAGE' });
    await workspace.ingestText(
      { userId: user.id, organizationId: organization.id, brandId: firstBrand.id },
      {
        title: 'First document',
        text: 'Knowledge workspace source text.',
      },
    );
    await knowledge.createDocument({
      organizationId: organization.id,
      brandId: secondBrand.id,
      title: 'Second document',
      type: KnowledgeDocumentType.TEXT,
    });

    await expect(
      workspace.list({ userId: user.id, organizationId: organization.id, brandId: firstBrand.id }),
    ).resolves.toEqual([expect.objectContaining({ title: 'First document' })]);
    await expect(
      workspace.list({
        userId: user.id,
        organizationId: foreignOrganization.id,
        brandId: foreignBrand.id,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
