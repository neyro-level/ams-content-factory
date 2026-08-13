import 'dotenv/config';
import {
  createCaptionSerializationService,
  createContentService,
  createMediaService,
  createStoryboardService,
  createTranscriptionService,
  createVideoOutputService,
  createVideoProductionService,
  resolveTenantContext,
  seedInitialVideoRecipes,
} from '../../packages/core/src/index.js';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';
import {
  MockStorageProvider,
  MockTranscriptionProvider,
} from '../../packages/providers/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const slug = 'transcription-output-contract';
const email = `${slug}@local`;
const mp4Bytes = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('video output transcription', () => {
  it('requires a durable ready output asset before provider invocation and persists transcript for that asset', async () => {
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name: slug },
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
    const context = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: brand.id },
      tenants,
    );
    const content = createContentService({ prisma });
    const project = await content.create(context, {
      title: 'Output transcript',
      contentType: 'REEL',
    });
    const version = await content.appendVersion(context, project!.id, {
      createdByType: 'USER',
      script: 'Script',
    });
    const [recipe] = await seedInitialVideoRecipes(prisma);
    const storyboard = await createStoryboardService({ prisma }).create(context, {
      contentProjectId: project!.id,
      contentVersionId: version!.id,
      videoRecipeId: recipe!.id,
      beats: [{ narration: 'Proof', visualJob: 'PROOF', visualInstruction: 'Show proof' }],
    });
    const production = createVideoProductionService({ prisma });
    const created = await production.create(context, {
      contentProjectId: project!.id,
      storyboardId: storyboard!.id,
      videoRecipeId: recipe!.id,
      aspectRatio: '9:16',
    });
    const provider = new MockTranscriptionProvider();
    const transcription = createTranscriptionService({ provider, prisma });
    await expect(
      transcription.transcribe(context, { videoProductionId: created!.id, language: 'ru' }),
    ).rejects.toThrow('durable READY output asset');

    for (const [from, to] of [
      ['PLANNED', 'SCRIPT_READY'],
      ['SCRIPT_READY', 'STORYBOARD_READY'],
      ['STORYBOARD_READY', 'GENERATING'],
      ['GENERATING', 'COMPOSING'],
    ] as const) {
      await production.transition(context, { id: created!.id, from, to });
    }
    const storage = new MockStorageProvider();
    const media = createMediaService({ prisma, storage, storageDriver: 'test-private' });
    const asset = await media.store(context, {
      type: 'VIDEO',
      filename: 'rendered.mp4',
      content: mp4Bytes,
      sourceType: 'PROVIDER',
    });
    await expect(
      createVideoOutputService({ prisma }).attachOutput(context, {
        videoProductionId: created!.id,
        mediaAssetId: asset.id,
      }),
    ).resolves.toEqual(expect.objectContaining({ outputAssetId: asset.id }));
    const transcript = await transcription.transcribe(context, {
      videoProductionId: created!.id,
      language: 'ru',
    });
    expect(transcript).toEqual(expect.objectContaining({ assetId: asset.id, language: 'ru' }));
    const captions = createCaptionSerializationService({
      prisma,
      storage,
      storageDriver: 'test-private',
    });
    const track = await captions.serialize(context, {
      videoProductionId: created!.id,
      transcriptId: transcript.id,
      style: { preset: 'default' },
    });
    expect(track.srtAssetId).toEqual(expect.any(String));
    expect(track.assAssetId).toEqual(expect.any(String));
    const [srt, ass] = await Promise.all([
      prisma.mediaAsset.findUniqueOrThrow({ where: { id: track.srtAssetId! } }),
      prisma.mediaAsset.findUniqueOrThrow({ where: { id: track.assAssetId! } }),
    ]);
    expect(srt).toEqual(expect.objectContaining({ status: 'READY', sourceType: 'DERIVED' }));
    expect(ass).toEqual(expect.objectContaining({ status: 'READY', sourceType: 'DERIVED' }));
    const storedSrt = await storage.get(srt.storageKey);
    expect(new TextDecoder().decode(storedSrt!)).toContain('Mock');
  });
});
