import 'dotenv/config';
import { createFactCheckService } from '../../packages/core/src/index.js';
import {
  createContentRepository,
  createPrismaClient,
  createTenantRepository,
} from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const content = createContentRepository(prisma);
const slug = 'fact-check-contract';

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: slug } } });
  await prisma.$disconnect();
});

describe('fact-check gate', () => {
  it('surfaces unsupported claims and leaves a draft in FACT_CHECK for editorial review request', async () => {
    const setup = await createDraft('unsupported', 'We reduced costs by 30%.\nUse our service.');
    const result = await createFactCheckService().run(setup.actor, {
      contentProjectId: setup.project.id,
    });

    expect(result.unsupported).toEqual([
      expect.objectContaining({
        text: 'We reduced costs by 30%.',
        supported: false,
        evidenceCount: 0,
      }),
      expect.objectContaining({ text: 'Use our service.', supported: false, evidenceCount: 0 }),
    ]);
    await expect(
      prisma.contentProject.findUnique({ where: { id: setup.project.id } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'FACT_CHECK' }));
    await expect(
      prisma.claim.count({ where: { contentProjectId: setup.project.id } }),
    ).resolves.toBe(2);
  });

  it('recognizes an existing evidence-backed claim for the same project', async () => {
    const setup = await createDraft('supported', 'Measured result.');
    const claim = await prisma.claim.create({
      data: {
        brandId: setup.actor.brandId,
        contentProjectId: setup.project.id,
        text: 'Measured result.',
        type: 'CONTENT_ASSERTION',
      },
    });
    await prisma.evidence.create({
      data: { claimId: claim.id, sourceUrl: 'https://example.test/proof', excerpt: 'Proof.' },
    });

    const result = await createFactCheckService().run(setup.actor, {
      contentProjectId: setup.project.id,
    });

    expect(result.findings).toEqual([
      expect.objectContaining({ claimId: claim.id, supported: true, evidenceCount: 1 }),
    ]);
    await expect(prisma.claim.findUnique({ where: { id: claim.id } })).resolves.toEqual(
      expect.objectContaining({ status: 'SUPPORTED' }),
    );
  });

  it('denies a foreign-brand content project before creating claims', async () => {
    const own = await createDraft('own', 'Own claim.');
    const foreign = await createDraft('foreign', 'Foreign claim.');

    await expect(
      createFactCheckService().run(own.actor, { contentProjectId: foreign.project.id }),
    ).rejects.toThrow('outside the active organization');
    await expect(
      prisma.claim.count({ where: { contentProjectId: foreign.project.id } }),
    ).resolves.toBe(0);
  });
});

async function createDraft(name: string, body: string) {
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
  const version = await content.appendVersion({
    organizationId: organization.id,
    brandId: brand.id,
    contentProjectId: project.id,
    createdByType: 'USER',
    body,
  });
  if (!version) throw new Error('Test content version could not be created.');
  await content.transition({
    organizationId: organization.id,
    brandId: brand.id,
    id: project.id,
    from: 'IDEA',
    to: 'RESEARCHING',
  });
  await content.transition({
    organizationId: organization.id,
    brandId: brand.id,
    id: project.id,
    from: 'RESEARCHING',
    to: 'DRAFT',
  });
  return {
    actor: { userId: user.id, organizationId: organization.id, brandId: brand.id },
    project,
  };
}
