import 'dotenv/config';
import {
  createContentService,
  createCaptionsService,
  createMediaService,
  createStoryboardService,
  createVideoProductionService,
  resolveTenantContext,
  seedInitialVideoRecipes,
} from '../../packages/core/src/index.js';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';
import { MockStorageProvider } from '../../packages/providers/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const slug = 'media-production-contract';
const email = `${slug}@local`;

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('media production', () => {
  it('stores checksummed assets and prevents cross-brand media access', async () => {
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
    const media = createMediaService({
      prisma,
      storage: new MockStorageProvider(),
      storageDriver: 'mock-private',
    });
    const asset = await media.store(context, {
      type: 'VIDEO',
      mimeType: 'video/mp4',
      filename: 'source.mp4',
      storageKey: `${one.id}/source.mp4`,
      content: new TextEncoder().encode('private-video'),
      sourceType: 'UPLOAD',
    });
    expect(asset.status).toBe('READY');
    expect(asset.checksum).toMatch(/^[a-f0-9]{64}$/);
    await expect(media.find(otherContext, asset.id)).resolves.toBeNull();

    const recipes = await seedInitialVideoRecipes(prisma);
    const content = createContentService({ prisma });
    const project = await content.create(context, { title: 'Media test', contentType: 'REEL' });
    const version = await content.appendVersion(context, project!.id, {
      createdByType: 'USER',
      script: 'Script',
    });
    const storyboard = await createStoryboardService({ prisma }).create({
      organizationId: organization.id,
      brandId: one.id,
      contentProjectId: project!.id,
      contentVersionId: version!.id,
      videoRecipeId: recipes[0]!.id,
      beats: [{ narration: 'Proof', visualJob: 'PROOF', visualInstruction: 'Show evidence' }],
    });
    const production = createVideoProductionService({ prisma });
    await expect(
      production.create(otherContext, {
        contentProjectId: project!.id,
        storyboardId: storyboard!.id,
        videoRecipeId: recipes[0]!.id,
        aspectRatio: '9:16',
      }),
    ).resolves.toBeNull();
    const created = await production.create(context, {
      contentProjectId: project!.id,
      storyboardId: storyboard!.id,
      videoRecipeId: recipes[0]!.id,
      aspectRatio: '9:16',
      targetDuration: 30,
    });
    expect(created).toEqual(expect.objectContaining({ status: 'PLANNED' }));
    const renderJob = await production.queueRender(context, {
      videoProductionId: created!.id,
      provider: 'remotion',
      operation: 'compose',
      idempotencyKey: `media-render-${created!.id}`,
    });
    expect(renderJob).toEqual(expect.objectContaining({ status: 'QUEUED' }));
    const captions = createCaptionsService({ prisma });
    await expect(
      captions.createTranscript(otherContext, {
        videoProductionId: created!.id,
        assetId: asset.id,
        provider: 'mock',
        language: 'ru',
        text: 'Proof',
        words: [{ word: 'Proof', startMs: 0, endMs: 500 }],
        durationMs: 500,
      }),
    ).resolves.toBeNull();
    const transcript = await captions.createTranscript(context, {
      videoProductionId: created!.id,
      assetId: asset.id,
      provider: 'mock',
      language: 'ru',
      text: 'Proof',
      words: [{ word: 'Proof', startMs: 0, endMs: 500 }],
      durationMs: 500,
    });
    const track = await captions.createTrack(context, {
      videoProductionId: created!.id,
      transcriptId: transcript!.id,
      style: { preset: 'default' },
    });
    const report = await captions.createQc(context, {
      videoProductionId: created!.id,
      technical: { passed: true, issues: [] },
      visual: { passed: false, issues: ['caption-safe-zone'] },
      content: { passed: true, issues: [] },
    });
    expect(track).toEqual(expect.objectContaining({ transcriptId: transcript!.id }));
    expect(report).toEqual(expect.objectContaining({ status: 'FAILED' }));
    await expect(
      production.attachAsset(otherContext, {
        mediaAssetId: asset.id,
        videoProductionId: created!.id,
        role: 'SOURCE',
      }),
    ).resolves.toBeNull();
    await expect(
      production.attachAsset(context, {
        mediaAssetId: asset.id,
        videoProductionId: created!.id,
        role: 'SOURCE',
      }),
    ).resolves.toEqual(expect.objectContaining({ role: 'SOURCE' }));
    await expect(production.find(otherContext, created!.id)).resolves.toBeNull();
  });
});
