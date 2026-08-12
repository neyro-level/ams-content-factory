import 'dotenv/config';
import {
  createContentService,
  VideoProviderOutcomeUnknownError,
  createStoryboardService,
  createVideoProductionService,
  createVideoProviderService,
  resolveTenantContext,
  seedInitialVideoRecipes,
} from '../../packages/core/src/index.js';
import {
  createPrismaClient,
  createMediaRepository,
  createProviderUsageRepository,
  createTenantRepository,
} from '../../packages/db/src/index.js';
import { MockAvatarVideoProvider, MockMotionProvider } from '../../packages/providers/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const rates = createProviderUsageRepository(prisma);
const slug = 'video-providers-contract';
const email = `${slug}@local`;

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.providerRate.deleteMany({ where: { provider: 'mock-motion', model: 'test-model' } });
  await prisma.$disconnect();
});

describe('video providers', () => {
  it('tracks configured costs, mock polling and tenant isolation', async () => {
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
    const content = createContentService({ prisma });
    const project = await content.create(context, { title: 'Provider test', contentType: 'REEL' });
    const version = await content.appendVersion(context, project!.id, {
      createdByType: 'USER',
      script: 'Provider script',
    });
    const storyboard = await createStoryboardService({ prisma }).create(context, {
      contentProjectId: project!.id,
      contentVersionId: version!.id,
      videoRecipeId: recipes[0]!.id,
      beats: [{ narration: 'Narration', visualJob: 'PROOF', visualInstruction: 'Show proof' }],
    });
    const production = createVideoProductionService({ prisma });
    const created = await production.create(context, {
      contentProjectId: project!.id,
      storyboardId: storyboard!.id,
      videoRecipeId: recipes[0]!.id,
      aspectRatio: '9:16',
    });
    await production.transition(context, { id: created!.id, from: 'PLANNED', to: 'SCRIPT_READY' });
    await production.transition(context, {
      id: created!.id,
      from: 'SCRIPT_READY',
      to: 'STORYBOARD_READY',
    });
    await production.transition(context, {
      id: created!.id,
      from: 'STORYBOARD_READY',
      to: 'GENERATING',
    });
    await rates.createRate({
      provider: 'mock-motion',
      operation: 'generate',
      model: 'test-model',
      unit: 'second',
      unitCost: 0.25,
      currency: 'USD',
    });
    const service = createVideoProviderService({
      prisma,
      avatarProvider: new MockAvatarVideoProvider(),
      motionProvider: new MockMotionProvider(),
    });
    const input = {
      kind: 'motion' as const,
      provider: 'mock-motion',
      operation: 'generate',
      model: 'test-model',
      unit: 'second',
      quantity: 30,
      contentProjectId: project!.id,
      videoProductionId: created!.id,
      script: 'Provider script',
      aspectRatio: '9:16',
      outputKey: 'output/mock.mp4',
      idempotencyKey: `video-provider-${created!.id}`,
    };
    await expect(service.submit(otherContext, input)).rejects.toThrow(
      'outside the active content project',
    );
    const submitted = await service.submit(context, input);
    expect(submitted.providerJob.status).toBe('SUBMITTED');
    await expect(service.submit(context, input)).resolves.toEqual(
      expect.objectContaining({
        renderId: submitted.renderId,
        providerUsageId: submitted.providerUsageId,
      }),
    );
    expect(await prisma.providerUsage.count({ where: { contentProjectId: project!.id } })).toBe(1);
    const usage = await prisma.providerUsage.findUnique({
      where: { id: submitted.providerUsageId },
    });
    expect(Number(usage!.estimatedCost)).toBe(7.5);
    await expect(
      service.poll(otherContext, {
        kind: 'motion',
        videoProductionId: created!.id,
        renderJobId: submitted.renderId,
      }),
    ).rejects.toThrow('outside the active tenant');
    await expect(
      service.poll(context, {
        kind: 'motion',
        videoProductionId: created!.id,
        renderJobId: submitted.renderId,
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PROCESSING' }));
    await expect(
      service.poll(context, {
        kind: 'motion',
        videoProductionId: created!.id,
        renderJobId: submitted.renderId,
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'COMPLETED', actualCost: 0 }));
    const completedUsage = await prisma.providerUsage.findUnique({
      where: { id: submitted.providerUsageId },
    });
    expect(Number(completedUsage!.actualCost)).toBe(0);

    // The present RenderJob schema assigns attempt=1 by default; keep this
    // recovery contract focused on persistence-after-provider-success rather
    // than the separately planned render-attempt allocation work.
    await prisma.renderJob.deleteMany({ where: { videoProductionId: created!.id } });

    const baseMedia = createMediaRepository(prisma);
    let failFinalPersistence = true;
    const mediaRepository = {
      ...baseMedia,
      updateRenderJob: async (update: Parameters<typeof baseMedia.updateRenderJob>[0]) => {
        if (failFinalPersistence && update.to === 'SUBMITTED') {
          failFinalPersistence = false;
          throw new Error('Simulated database failure after video provider success.');
        }
        return baseMedia.updateRenderJob(update);
      },
    };
    const reconciliationService = createVideoProviderService({
      mediaRepository,
      avatarProvider: new MockAvatarVideoProvider(),
      motionProvider: new MockMotionProvider(),
    });
    const uncertainInput = {
      ...input,
      idempotencyKey: `video-provider-uncertain-${created!.id}`,
      outputKey: 'output/uncertain.mp4',
    };
    await expect(reconciliationService.submit(context, uncertainInput)).rejects.toBeInstanceOf(
      VideoProviderOutcomeUnknownError,
    );
    const uncertain = await baseMedia.findRenderJobByIdempotency({
      organizationId: organization.id,
      brandId: one.id,
      videoProductionId: created!.id,
      idempotencyKey: uncertainInput.idempotencyKey,
    });
    expect(uncertain).toEqual(
      expect.objectContaining({ status: 'OUTCOME_UNKNOWN', providerJobId: expect.any(String) }),
    );
    await expect(
      reconciliationService.poll(context, {
        kind: 'motion',
        videoProductionId: created!.id,
        renderJobId: uncertain!.id,
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PROCESSING' }));
    await expect(
      baseMedia.findRenderJobByIdempotency({
        organizationId: organization.id,
        brandId: one.id,
        videoProductionId: created!.id,
        idempotencyKey: uncertainInput.idempotencyKey,
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PROCESSING' }));
  });
});
