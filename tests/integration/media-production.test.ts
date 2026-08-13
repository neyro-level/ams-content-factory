import 'dotenv/config';
import {
  createContentService,
  createCaptionsService,
  createMediaService,
  createMediaWorkspaceService,
  MediaStorageBlockedExternalError,
  createStoryboardService,
  createVideoProductionService,
  resolveTenantContext,
  seedInitialVideoRecipes,
} from '../../packages/core/src/index.js';
import {
  createPrismaClient,
  createMediaRepository,
  createTenantRepository,
  MembershipRole,
  MembershipStatus,
} from '../../packages/db/src/index.js';
import { MockStorageProvider } from '../../packages/providers/src/index.js';
import { FailingStorageProvider } from '../helpers/failure-harness.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const slug = 'media-production-contract';
const email = `${slug}@local`;
const mp4Bytes = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const distinctMp4Bytes = new Uint8Array([...mp4Bytes, 1]);

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email: { startsWith: slug } } });
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
      filename: 'source.mp4',
      content: mp4Bytes,
      sourceType: 'UPLOAD',
    });
    expect(asset.status).toBe('READY');
    expect(asset.mimeType).toBe('video/mp4');
    expect(asset.storageKey).toMatch(new RegExp(`^media/${organization.id}/${one.id}/`));
    expect(asset.checksum).toMatch(/^[a-f0-9]{64}$/);
    await expect(media.find(otherContext, asset.id)).resolves.toBeNull();

    const recipes = await seedInitialVideoRecipes(prisma);
    const content = createContentService({ prisma });
    const project = await content.create(context, { title: 'Media test', contentType: 'REEL' });
    const version = await content.appendVersion(context, project!.id, {
      createdByType: 'USER',
      script: 'Script',
    });
    const storyboard = await createStoryboardService({ prisma }).create(context, {
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

  it('fails closed for fake media and keeps retries idempotent', async () => {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const brand = await prisma.brand.findFirstOrThrow({
      where: { organizationId: organization.id, slug: 'one' },
    });
    const context = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: brand.id },
      tenants,
    );
    const storage = new MockStorageProvider();
    const media = createMediaService({ prisma, storage, storageDriver: 'mock-private' });
    await expect(
      media.store(context, {
        type: 'VIDEO',
        filename: 'fake.mp4',
        content: new TextEncoder().encode('not an mp4'),
        sourceType: 'UPLOAD',
      }),
    ).rejects.toThrow('not a supported');
    const failed = await prisma.mediaAsset.findFirstOrThrow({
      where: { organizationId: organization.id, brandId: brand.id, filename: 'fake.mp4' },
    });
    expect(failed.status).toBe('FAILED');
    await expect(storage.get(failed.storageKey)).resolves.toBeNull();

    const first = await media.store(context, {
      type: 'VIDEO',
      filename: 'retry.mp4',
      content: mp4Bytes,
      sourceType: 'UPLOAD',
    });
    const duplicate = await media.store(context, {
      type: 'VIDEO',
      filename: 'retry.mp4',
      content: mp4Bytes,
      sourceType: 'UPLOAD',
    });
    expect(duplicate.id).toBe(first.id);
    await expect(
      prisma.mediaAsset.count({
        where: { organizationId: organization.id, brandId: brand.id, checksum: first.checksum },
      }),
    ).resolves.toBe(1);
  });

  it('does not write without permission and persists FAILED after a storage failure', async () => {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug } });
    const brand = await prisma.brand.findFirstOrThrow({
      where: { organizationId: organization.id, slug: 'one' },
    });
    const viewer = await prisma.user.upsert({
      where: { email: `${slug}-viewer@local` },
      create: { email: `${slug}-viewer@local`, name: 'Media viewer' },
      update: {},
    });
    await prisma.membership.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: viewer.id } },
      create: {
        organizationId: organization.id,
        userId: viewer.id,
        role: MembershipRole.VIEWER,
        status: MembershipStatus.ACTIVE,
      },
      update: { role: MembershipRole.VIEWER, status: MembershipStatus.ACTIVE },
    });
    const viewerContext = await resolveTenantContext(
      { userId: viewer.id, organizationId: organization.id, brandId: brand.id },
      tenants,
    );
    const untouchedStorage = new MockStorageProvider();
    const deniedMedia = createMediaService({
      prisma,
      storage: untouchedStorage,
      storageDriver: 'mock-private',
    });
    await expect(
      deniedMedia.store(viewerContext, {
        type: 'VIDEO',
        filename: 'denied.mp4',
        content: mp4Bytes,
        sourceType: 'UPLOAD',
      }),
    ).rejects.toThrow('Permission required: content:write');
    await expect(
      prisma.mediaAsset.count({
        where: { organizationId: organization.id, brandId: brand.id, filename: 'denied.mp4' },
      }),
    ).resolves.toBe(0);

    const owner = await prisma.user.findUniqueOrThrow({ where: { email } });
    const ownerContext = await resolveTenantContext(
      { userId: owner.id, organizationId: organization.id, brandId: brand.id },
      tenants,
    );
    const failedMedia = createMediaService({
      prisma,
      storage: new FailingStorageProvider(),
      storageDriver: 'mock-private',
    });
    await expect(
      failedMedia.store(ownerContext, {
        type: 'VIDEO',
        filename: 'storage-failure.mp4',
        content: distinctMp4Bytes,
        sourceType: 'UPLOAD',
      }),
    ).rejects.toThrow('Simulated storage failure');
    await expect(
      prisma.mediaAsset.findFirst({
        where: {
          organizationId: organization.id,
          brandId: brand.id,
          filename: 'storage-failure.mp4',
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'FAILED' }));

    const dbFailureStorage = new MockStorageProvider();
    const repository = createMediaRepository(prisma);
    const persistenceFailureMedia = createMediaService({
      prisma,
      storage: dbFailureStorage,
      storageDriver: 'mock-private',
      repository: {
        ...repository,
        async updateAssetStatus(input) {
          if (input.to === 'READY') throw new Error('Simulated persistence failure.');
          return repository.updateAssetStatus(input);
        },
      },
    });
    await expect(
      persistenceFailureMedia.store(ownerContext, {
        type: 'VIDEO',
        filename: 'persistence-failure.mp4',
        content: new Uint8Array([...mp4Bytes, 2]),
        sourceType: 'UPLOAD',
      }),
    ).rejects.toThrow('Simulated persistence failure');
    const persistenceFailed = await prisma.mediaAsset.findFirstOrThrow({
      where: {
        organizationId: organization.id,
        brandId: brand.id,
        filename: 'persistence-failure.mp4',
      },
    });
    expect(persistenceFailed.status).toBe('FAILED');
    await expect(dbFailureStorage.get(persistenceFailed.storageKey)).resolves.toBeNull();
  });

  it('lists only the active brand media and blocks UI uploads without production S3', async () => {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug } });
    const owner = await prisma.user.findUniqueOrThrow({ where: { email } });
    const one = await prisma.brand.findFirstOrThrow({
      where: { organizationId: organization.id, slug: 'one' },
    });
    const two = await prisma.brand.findFirstOrThrow({
      where: { organizationId: organization.id, slug: 'two' },
    });
    const oneContext = await resolveTenantContext(
      { userId: owner.id, organizationId: organization.id, brandId: one.id },
      tenants,
    );
    const twoContext = await resolveTenantContext(
      { userId: owner.id, organizationId: organization.id, brandId: two.id },
      tenants,
    );
    const storage = new MockStorageProvider();
    const service = createMediaService({ prisma, storage, storageDriver: 'test-private' });
    const visible = await service.store(oneContext, {
      type: 'IMAGE',
      filename: 'workspace.png',
      content: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      sourceType: 'RESEARCH',
    });
    await service.store(twoContext, {
      type: 'VIDEO',
      filename: 'other.mp4',
      content: new Uint8Array([...mp4Bytes, 44]),
      sourceType: 'AI_GENERATED',
    });
    const workspace = createMediaWorkspaceService({
      tenantRepository: tenants,
      mediaRepository: createMediaRepository(prisma),
      mediaService: service,
    });
    const listed = await workspace.list({
      userId: owner.id,
      organizationId: organization.id,
      brandId: one.id,
    });
    expect(listed.map((asset) => asset.id)).toContain(visible.id);
    expect(listed.every((asset) => asset.brandId === one.id)).toBe(true);

    const blockedWorkspace = createMediaWorkspaceService({
      tenantRepository: tenants,
      mediaRepository: createMediaRepository(prisma),
    });
    await expect(
      blockedWorkspace.upload(
        { userId: owner.id, organizationId: organization.id, brandId: one.id },
        {
          type: 'VIDEO',
          filename: 'production-upload.mp4',
          content: new Uint8Array([...mp4Bytes, 45]),
          sourceType: 'UPLOAD',
        },
      ),
    ).rejects.toBeInstanceOf(MediaStorageBlockedExternalError);
    await expect(
      prisma.mediaAsset.count({
        where: {
          organizationId: organization.id,
          brandId: one.id,
          filename: 'production-upload.mp4',
        },
      }),
    ).resolves.toBe(0);
  });
});
