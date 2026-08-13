import 'dotenv/config';
import { createContentContextAssembler } from '../../packages/core/src/index.js';
import {
  createContentRepository,
  createPrismaClient,
  createTenantRepository,
} from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const content = createContentRepository(prisma);
const slug = 'content-context-contract';

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: slug } } });
  await prisma.$disconnect();
});

describe('content context assembler', () => {
  it('assembles only verified active-brand context and delegates retrieval through the boundary', async () => {
    await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
    const user = await prisma.user.upsert({
      where: { email: `${slug}@local` },
      create: { name: slug, email: `${slug}@local` },
      update: {},
    });
    const organization = await tenants.createOrganizationWithOwner({
      ownerUserId: user.id,
      name: slug,
      slug,
    });
    const brand = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Allowed',
      slug: 'allowed',
    });
    const foreignBrand = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Foreign',
      slug: 'foreign',
    });
    await tenants.grantBrandAccess({ brandId: brand.id, userId: user.id, role: 'MANAGE' });
    await prisma.brandProfile.create({
      data: { brandId: brand.id, positioning: { statement: 'Allowed positioning' } },
    });
    await prisma.brandVoice.create({
      data: { brandId: brand.id, toneSummary: 'Clear and specific.' },
    });
    await prisma.contentPillar.create({
      data: { brandId: brand.id, name: 'Allowed pillar', priority: 10 },
    });
    await prisma.contentPillar.create({
      data: { brandId: brand.id, name: 'Archived pillar', priority: 20, status: 'ARCHIVED' },
    });
    const project = await content.createProject({
      organizationId: organization.id,
      brandId: brand.id,
      title: 'Allowed project',
      contentType: 'SOCIAL_POST',
      goal: 'Explain value',
    });
    const claim = await prisma.claim.create({
      data: { brandId: brand.id, text: 'Allowed claim', type: 'FACT' },
    });
    await prisma.evidence.create({
      data: {
        claimId: claim.id,
        sourceUrl: 'https://example.com/allowed',
        excerpt: 'Allowed evidence.',
      },
    });
    const foreignClaim = await prisma.claim.create({
      data: { brandId: foreignBrand.id, text: 'Foreign claim', type: 'FACT' },
    });
    await prisma.evidence.create({
      data: {
        claimId: foreignClaim.id,
        sourceUrl: 'https://example.com/foreign',
        excerpt: 'Foreign evidence.',
      },
    });
    const receivedQueries: string[] = [];
    const assembler = createContentContextAssembler({
      knowledgeSearch: {
        async search({ query, context }) {
          receivedQueries.push(query);
          expect(context.brandId).toBe(brand.id);
          return [
            { chunkId: 'chunk', documentId: 'document', content: 'Allowed knowledge.', score: 0.9 },
          ];
        },
      },
    });
    const actor = { userId: user.id, organizationId: organization.id, brandId: brand.id };

    await expect(
      assembler.assemble(actor, { contentProjectId: project!.id, knowledgeQuery: 'value' }),
    ).resolves.toEqual(
      expect.objectContaining({
        project: expect.objectContaining({ id: project!.id, brandId: brand.id }),
        brand: expect.objectContaining({
          profile: expect.objectContaining({ brandId: brand.id }),
          voices: [expect.objectContaining({ brandId: brand.id })],
          pillars: [expect.objectContaining({ name: 'Allowed pillar' })],
        }),
        evidence: [expect.objectContaining({ excerpt: 'Allowed evidence.' })],
        knowledgeHits: [expect.objectContaining({ content: 'Allowed knowledge.' })],
      }),
    );
    expect(receivedQueries).toEqual(['value']);
    await expect(
      assembler.assemble({ ...actor, brandId: foreignBrand.id }, { contentProjectId: project!.id }),
    ).rejects.toThrow('outside the active organization');
  });
});
