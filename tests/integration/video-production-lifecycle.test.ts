import 'dotenv/config';
import {
  createContentService,
  createCaptionsService,
  createStoryboardService,
  createVideoQcGateService,
  createVideoProductionWorkflowService,
  resolveTenantContext,
  seedInitialVideoRecipes,
} from '../../packages/core/src/index.js';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const slug = 'video-production-lifecycle-contract';
const email = `${slug}@local`;

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('video production lifecycle', () => {
  it('creates only from approved inputs and persists guarded lifecycle timestamps', async () => {
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
    const brand = await tenants.createBrand({
      organizationId: organization.id,
      name: 'One',
      slug: 'one',
    });
    const other = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Two',
      slug: 'two',
    });
    const context = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: brand.id },
      tenants,
    );
    const content = createContentService({ prisma });
    const project = await content.create(context, {
      title: 'Approved production',
      contentType: 'REEL',
    });
    const version = await content.appendVersion(context, project!.id, {
      createdByType: 'USER',
      script: 'Approved script.',
    });
    const [recipe] = await seedInitialVideoRecipes(prisma);
    const storyboard = await createStoryboardService({ prisma }).create(context, {
      contentProjectId: project!.id,
      contentVersionId: version!.id,
      videoRecipeId: recipe!.id,
      beats: [
        {
          narration: 'Proof',
          visualJob: 'PROOF',
          visualInstruction: 'Show proof',
          durationHint: 20,
        },
      ],
    });
    const workflow = createVideoProductionWorkflowService({ prisma });
    await expect(
      workflow.create(context, {
        contentProjectId: project!.id,
        storyboardId: storyboard!.id,
        videoRecipeId: recipe!.id,
        aspectRatio: '9:16',
      }),
    ).resolves.toBeNull();

    await prisma.contentProject.update({
      where: { id: project!.id },
      data: { status: 'APPROVED' },
    });
    await prisma.storyboard.update({ where: { id: storyboard!.id }, data: { status: 'APPROVED' } });
    const production = await workflow.create(context, {
      contentProjectId: project!.id,
      storyboardId: storyboard!.id,
      videoRecipeId: recipe!.id,
      aspectRatio: '9:16',
      targetDuration: 20,
    });
    expect(production).toEqual(expect.objectContaining({ status: 'PLANNED' }));
    await expect(
      workflow.advance(context, { id: production!.id, to: 'COMPOSING' }),
    ).rejects.toThrow('Invalid video production transition');
    for (const to of [
      'SCRIPT_READY',
      'STORYBOARD_READY',
      'WAITING_APPROVAL',
      'GENERATING',
      'COMPOSING',
      'QC',
    ] as const) {
      await workflow.advance(context, { id: production!.id, to });
    }
    await expect(
      createVideoQcGateService({ prisma }).complete(context, production!.id),
    ).rejects.toThrow('latest successful QC report');
    const captions = createCaptionsService({ prisma });
    const failedQc = await captions.createQc(context, {
      videoProductionId: production!.id,
      technical: { passed: true, issues: [] },
      visual: { passed: false, issues: ['safe-zone'] },
      content: { passed: true, issues: [] },
    });
    expect(failedQc?.status).toBe('FAILED');
    await expect(
      createVideoQcGateService({ prisma }).complete(context, production!.id),
    ).rejects.toThrow('latest successful QC report');
    await prisma.qcReport.update({
      where: { id: failedQc!.id },
      data: { createdAt: new Date(Date.now() - 1_000) },
    });
    await captions.createQc(context, {
      videoProductionId: production!.id,
      technical: { passed: true, issues: [] },
      visual: { passed: true, issues: [] },
      content: { passed: true, issues: [] },
    });
    await createVideoQcGateService({ prisma }).complete(context, production!.id);
    const ready = await workflow.find(context, production!.id);
    expect(ready).toEqual(
      expect.objectContaining({
        status: 'READY',
        startedAt: expect.any(Date),
        completedAt: expect.any(Date),
      }),
    );
    await expect(
      workflow.find(
        await resolveTenantContext(
          { userId: user.id, organizationId: organization.id, brandId: other.id },
          tenants,
        ),
        production!.id,
      ),
    ).resolves.toBeNull();

    const retry = await workflow.create(context, {
      contentProjectId: project!.id,
      storyboardId: storyboard!.id,
      videoRecipeId: recipe!.id,
      aspectRatio: '9:16',
    });
    for (const to of [
      'SCRIPT_READY',
      'STORYBOARD_READY',
      'WAITING_APPROVAL',
      'GENERATING',
      'FAILED',
    ] as const) {
      await workflow.advance(context, { id: retry!.id, to });
    }
    const recovered = await workflow.advance(context, { id: retry!.id, to: 'GENERATING' });
    expect(recovered).toEqual(
      expect.objectContaining({
        status: 'GENERATING',
        startedAt: expect.any(Date),
        completedAt: null,
      }),
    );
  });
});
