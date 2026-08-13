import 'dotenv/config';
import { createContentWorkspaceService } from '../../packages/core/src/index.js';
import {
  createContentRepository,
  createPrismaClient,
  createTenantRepository,
} from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const content = createContentRepository(prisma);
const slug = 'content-workspace-contract';

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: slug } } });
  await prisma.$disconnect();
});

describe('content workspace read model', () => {
  it('lists only the active brand projects and returns scoped claims with evidence', async () => {
    const setup = await createProject('visible');
    const claim = await prisma.claim.create({
      data: {
        brandId: setup.actor.brandId,
        contentProjectId: setup.project.id,
        text: 'A checked claim.',
        type: 'CONTENT_ASSERTION',
      },
    });
    await prisma.evidence.create({
      data: { claimId: claim.id, sourceUrl: 'https://example.test/evidence', excerpt: 'Evidence.' },
    });
    const workspace = createContentWorkspaceService();

    await expect(workspace.list(setup.actor)).resolves.toEqual([
      expect.objectContaining({ id: setup.project.id, title: 'visible' }),
    ]);
    await expect(workspace.get(setup.actor, setup.project.id)).resolves.toEqual(
      expect.objectContaining({
        project: expect.objectContaining({ id: setup.project.id }),
        claims: [expect.objectContaining({ id: claim.id, evidence: [expect.any(Object)] })],
      }),
    );
  });

  it('denies a content project from another organization', async () => {
    const own = await createProject('own');
    const foreign = await createProject('foreign');
    await expect(
      createContentWorkspaceService().get(own.actor, foreign.project.id),
    ).rejects.toThrow('outside the active organization');
  });
});

async function createProject(name: string) {
  const user = await prisma.user.upsert({
    where: { email: `${slug}-${name}@local` },
    create: { name, email: `${slug}-${name}@local` },
    update: {},
  });
  const organization = await tenants.createOrganizationWithOwner({
    ownerUserId: user.id,
    name: `${slug}-${name}`,
    slug: `${slug}-${name}`,
  });
  const brand = await tenants.createBrand({
    organizationId: organization.id,
    name,
    slug: name,
    ownerUserId: user.id,
  });
  const project = await content.createProject({
    organizationId: organization.id,
    brandId: brand.id,
    title: name,
    contentType: 'SOCIAL_POST',
  });
  if (!project) throw new Error('Test project could not be created.');
  return {
    actor: { userId: user.id, organizationId: organization.id, brandId: brand.id },
    project,
  };
}
