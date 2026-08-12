import 'dotenv/config';
import {
  createContentService,
  createStoryboardService,
  seedInitialVideoRecipes,
  resolveTenantContext,
} from '../../packages/core/src/index.js';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const slug = 'video-planning-contract';
const email = `${slug}@local`;
afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('video planning', () => {
  it('seeds recipes idempotently and rejects cross-brand storyboards', async () => {
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
    const otherContext = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: two.id },
      tenants,
    );
    const recipes = await seedInitialVideoRecipes(prisma);
    await seedInitialVideoRecipes(prisma);
    expect(await prisma.videoRecipe.count()).toBe(6);
    const content = createContentService({ prisma });
    const project = await content.create(context, { title: 'Видео', contentType: 'REEL' });
    const version = await content.appendVersion(context, project!.id, {
      createdByType: 'USER',
      script: 'Сценарий',
    });
    const storyboard = createStoryboardService({ prisma });
    await expect(
      storyboard.create(otherContext, {
        contentProjectId: project!.id,
        contentVersionId: version!.id,
        videoRecipeId: recipes[0]!.id,
        beats: [
          { narration: 'Факт', visualJob: 'PROOF', visualInstruction: 'Показать доказательство' },
        ],
      }),
    ).resolves.toBeNull();
    await expect(
      storyboard.create(context, {
        contentProjectId: project!.id,
        contentVersionId: version!.id,
        videoRecipeId: recipes[0]!.id,
        beats: [
          { narration: 'Факт', visualJob: 'PROOF', visualInstruction: 'Показать доказательство' },
        ],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        beats: [expect.objectContaining({ ordinal: 0, visualJob: 'PROOF' })],
      }),
    );
  });
});
