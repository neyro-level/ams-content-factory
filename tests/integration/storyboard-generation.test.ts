import 'dotenv/config';
import {
  createContentService,
  createStoryboardGenerationService,
  resolveTenantContext,
  seedInitialVideoRecipes,
  StoryboardGenerationBlockedExternalError,
} from '../../packages/core/src/index.js';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';
import {
  MockTextGenerationProvider,
  TextGenerationProviderUnavailableError,
} from '../../packages/providers/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const slug = 'storyboard-generation-contract';
const email = `${slug}@local`;

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('storyboard generation', () => {
  it('generates validated beats only from an approved script in the active brand', async () => {
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
    const one = await tenants.createBrand({
      organizationId: organization.id,
      name: 'One',
      slug: 'one',
    });
    const two = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Two',
      slug: 'two',
    });
    const context = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: one.id },
      tenants,
    );
    const content = createContentService({ prisma });
    const project = await content.create(context, { title: 'Approved reel', contentType: 'REEL' });
    const version = await content.appendVersion(context, project!.id, {
      createdByType: 'USER',
      script: 'An approved script with a concrete claim.',
    });
    await prisma.contentProject.update({
      where: { id: project!.id },
      data: { status: 'APPROVED' },
    });
    const [recipe] = await seedInitialVideoRecipes(prisma);
    const provider = new MockTextGenerationProvider({
      text: JSON.stringify({
        beats: [
          {
            narration: 'Opening claim',
            visualJob: 'PROOF',
            visualInstruction: 'Show source evidence.',
            durationHint: 10,
          },
          {
            narration: 'Next action',
            visualJob: 'ACTION',
            visualInstruction: 'Show the final action.',
            durationHint: 15,
          },
        ],
      }),
      model: 'storyboard-test',
    });
    const service = createStoryboardGenerationService({ provider, tenantRepository: tenants });
    const storyboard = await service.generate(
      { userId: user.id, organizationId: organization.id, brandId: one.id },
      { contentProjectId: project!.id, contentVersionId: version!.id, videoRecipeId: recipe!.id },
    );
    expect(storyboard.beats).toEqual([
      expect.objectContaining({ ordinal: 0, narration: 'Opening claim', durationHint: 10 }),
      expect.objectContaining({ ordinal: 1, visualJob: 'ACTION', durationHint: 15 }),
    ]);
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.prompt).toContain('An approved script with a concrete claim.');

    await expect(
      service.generate(
        { userId: user.id, organizationId: organization.id, brandId: two.id },
        { contentProjectId: project!.id, contentVersionId: version!.id, videoRecipeId: recipe!.id },
      ),
    ).rejects.toThrow('Approved script or active video recipe is unavailable.');
    expect(provider.requests).toHaveLength(1);
  });

  it('fails closed before persistence for unapproved, unavailable or invalid generated storyboards', async () => {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const brand = await prisma.brand.findFirstOrThrow({
      where: { organizationId: organization.id, slug: 'one' },
    });
    const context = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: brand.id },
      tenants,
    );
    const content = createContentService({ prisma });
    const unapproved = await content.create(context, {
      title: 'Unapproved reel',
      contentType: 'REEL',
    });
    const unapprovedVersion = await content.appendVersion(context, unapproved!.id, {
      createdByType: 'USER',
      script: 'A draft script.',
    });
    const recipe = await prisma.videoRecipe.findFirstOrThrow({
      where: { key: 'expert-avatar-reel' },
    });
    const provider = new MockTextGenerationProvider({
      text: '{"beats":[]}',
      model: 'storyboard-test',
    });
    const service = createStoryboardGenerationService({ provider, tenantRepository: tenants });
    await expect(
      service.generate(
        { userId: user.id, organizationId: organization.id, brandId: brand.id },
        {
          contentProjectId: unapproved!.id,
          contentVersionId: unapprovedVersion!.id,
          videoRecipeId: recipe.id,
        },
      ),
    ).rejects.toThrow('Approved script or active video recipe is unavailable.');
    expect(provider.requests).toHaveLength(0);

    await prisma.contentProject.update({
      where: { id: unapproved!.id },
      data: { status: 'APPROVED' },
    });
    await expect(
      service.generate(
        { userId: user.id, organizationId: organization.id, brandId: brand.id },
        {
          contentProjectId: unapproved!.id,
          contentVersionId: unapprovedVersion!.id,
          videoRecipeId: recipe.id,
        },
      ),
    ).rejects.toThrow();
    await expect(
      prisma.storyboard.count({ where: { contentProjectId: unapproved!.id } }),
    ).resolves.toBe(0);

    const unavailable = createStoryboardGenerationService({
      provider: {
        async generate() {
          throw new TextGenerationProviderUnavailableError('provider unavailable');
        },
      },
      tenantRepository: tenants,
    });
    await expect(
      unavailable.generate(
        { userId: user.id, organizationId: organization.id, brandId: brand.id },
        {
          contentProjectId: unapproved!.id,
          contentVersionId: unapprovedVersion!.id,
          videoRecipeId: recipe.id,
        },
      ),
    ).rejects.toBeInstanceOf(StoryboardGenerationBlockedExternalError);
  });
});
