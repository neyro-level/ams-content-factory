import 'dotenv/config';
import {
  createContentRepository,
  createAnalyticsRepository,
  createKnowledgeRepository,
  createMediaRepository,
  createPrismaClient,
  createPublishingRepository,
  createResearchRepository,
  createTenantRepository,
} from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const content = createContentRepository(prisma);
const analytics = createAnalyticsRepository(prisma);
const knowledge = createKnowledgeRepository(prisma);
const research = createResearchRepository(prisma);
const media = createMediaRepository(prisma);
const publishing = createPublishingRepository(prisma);
const slug = 'cursor-pagination-contract';
const email = `${slug}@local`;

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { organization: { slug: { startsWith: slug } } } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: slug } } });
  await prisma.$disconnect();
});

describe('tenant-scoped cursor pagination', () => {
  it('bounds history pages, advances by cursor and never expands an active brand scope', async () => {
    await prisma.auditLog.deleteMany({ where: { organization: { slug } } });
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
    const first = await tenants.createBrand({
      organizationId: organization.id,
      name: 'First',
      slug: 'first',
    });
    const second = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Second',
      slug: 'second',
    });
    const scope = { organizationId: organization.id, brandId: first.id };

    await Promise.all(
      ['one', 'two', 'three'].map((title) =>
        content.createProject({ ...scope, title, contentType: 'SOCIAL_POST' }),
      ),
    );
    const foreignProject = await content.createProject({
      organizationId: organization.id,
      brandId: second.id,
      title: 'foreign',
      contentType: 'SOCIAL_POST',
    });
    const [firstProject] = await content.listProjects({ ...scope, take: 1 });
    const secondProjectPage = await content.listProjects({
      ...scope,
      take: 1,
      cursor: firstProject!.id,
    });
    expect(firstProject).toBeTruthy();
    expect(secondProjectPage).toHaveLength(1);
    expect(secondProjectPage[0]!.id).not.toBe(firstProject!.id);
    expect(
      (await content.listProjects({ ...scope, cursor: foreignProject!.id })).every(
        (project) => project.brandId === first.id,
      ),
    ).toBe(true);

    await prisma.contentVersion.createMany({
      data: [1, 2, 3].map((version) => ({
        contentProjectId: firstProject!.id,
        version,
        createdByType: 'USER',
        body: `Version ${version}`,
      })),
    });
    await prisma.approval.createMany({
      data: [1, 2, 3].map((index) => ({
        contentProjectId: firstProject!.id,
        status: `APPROVAL_${index}`,
      })),
    });
    await prisma.editorialComment.createMany({
      data: [1, 2, 3].map((index) => ({
        contentProjectId: firstProject!.id,
        body: `Comment ${index}`,
      })),
    });
    const projectDetail = await content.findProject({ ...scope, id: firstProject!.id });
    expect(projectDetail).toEqual(
      expect.objectContaining({
        _count: { versions: 3, approvals: 3, comments: 3 },
        versions: [expect.objectContaining({ version: 3 })],
      }),
    );
    expect(projectDetail!.comments).toHaveLength(3);
    const [firstVersion] = await content.listProjectVersions({
      ...scope,
      contentProjectId: firstProject!.id,
      take: 1,
    });
    expect(
      await content.listProjectVersions({
        ...scope,
        contentProjectId: firstProject!.id,
        cursor: firstVersion!.id,
        take: 1,
      }),
    ).toHaveLength(1);
    expect(
      await content.listProjectApprovals({
        ...scope,
        contentProjectId: foreignProject!.id,
      }),
    ).toEqual([]);
    expect(
      await content.listProjectComments({
        ...scope,
        contentProjectId: foreignProject!.id,
      }),
    ).toEqual([]);

    await prisma.contentProject.update({
      where: { id: firstProject!.id },
      data: { status: 'APPROVED' },
    });
    const variant = await prisma.platformVariant.create({
      data: { contentProjectId: firstProject!.id, platform: 'VK', caption: 'Bounded caption' },
    });
    const account = await prisma.socialAccount.create({
      data: {
        brandId: first.id,
        platform: 'VK',
        externalAccountId: 'cursor-pagination-account',
        name: 'Cursor pagination account',
        metadata: { internal: 'must not be loaded into provider transition' },
      },
    });
    await prisma.socialCredential.create({
      data: {
        socialAccountId: account.id,
        accessTokenCiphertext: 'ciphertext',
        encryptionVersion: 'test',
      },
    });
    const publication = await prisma.publication.create({
      data: {
        ...scope,
        contentProjectId: firstProject!.id,
        platformVariantId: variant.id,
        socialAccountId: account.id,
        status: 'PUBLISHED',
        externalPostId: 'cursor-pagination-post',
      },
    });
    await prisma.publicationAttempt.createMany({
      data: [1, 2, 3].map((attempt) => ({
        publicationId: publication.id,
        attempt,
        idempotencyKey: `cursor-attempt-${attempt}`,
        providerOperation: 'vk:publish',
        requestFingerprint: `fingerprint-${attempt}`,
      })),
    });
    const publicationSummary = await publishing.findPublication({ ...scope, id: publication.id });
    expect(publicationSummary).not.toHaveProperty('socialAccount');
    const providerPublication = await publishing.findPublicationForProvider({
      ...scope,
      id: publication.id,
      idempotencyKey: 'cursor-attempt-1',
    });
    expect(providerPublication!.attempts).toHaveLength(1);
    expect(providerPublication!.socialAccount).not.toHaveProperty('metadata');

    await prisma.metricSnapshot.createMany({
      data: [1, 2, 3].map((day) => ({
        brandId: first.id,
        publicationId: publication.id,
        capturedAt: new Date(`2026-08-0${day}T00:00:00.000Z`),
        rawMetrics: {},
      })),
    });
    const [firstSnapshot] = await analytics.listSnapshots({ ...scope, take: 1 });
    expect(
      await analytics.listSnapshots({ ...scope, take: 1, cursor: firstSnapshot!.id }),
    ).toHaveLength(1);

    await Promise.all(
      ['one', 'two', 'three'].map((title) =>
        knowledge.createDocument({ ...scope, title, type: 'TEXT', checksum: `document-${title}` }),
      ),
    );
    const [firstDocument] = await knowledge.listDocuments({ ...scope, take: 1 });
    expect(
      await knowledge.listDocuments({ ...scope, take: 1, cursor: firstDocument!.id }),
    ).toHaveLength(1);

    await Promise.all(
      ['one', 'two', 'three'].map((title) =>
        research.createItem({ ...scope, title, contentHash: `research-${title}` }),
      ),
    );
    const [firstResearch] = await research.findItems({ ...scope, take: 1 });
    expect(await research.findItems({ ...scope, take: 1, cursor: firstResearch!.id })).toHaveLength(
      1,
    );

    await Promise.all(
      ['one', 'two', 'three'].map((title) =>
        media.createAsset({
          ...scope,
          type: 'IMAGE',
          mimeType: 'image/png',
          filename: `${title}.png`,
          storageKey: `cursor/${title}.png`,
          storageDriver: 'test',
          sizeBytes: 1n,
          checksum: `asset-${title}`,
          sourceType: 'UPLOAD',
        }),
      ),
    );
    const [firstAsset] = await media.listAssets({ ...scope, take: 1 });
    expect(await media.listAssets({ ...scope, take: 1, cursor: firstAsset!.id })).toHaveLength(1);

    await Promise.all(
      ['one', 'two', 'three'].map((title) =>
        publishing.createSocialAccount({
          ...scope,
          platform: 'VK',
          externalAccountId: `-${title.length}${title.charCodeAt(0)}`,
          name: title,
        }),
      ),
    );
    const [firstAccount] = await publishing.listSocialAccounts({ ...scope, take: 1 });
    const nextAccountPage = await publishing.listSocialAccounts({
      ...scope,
      take: 1,
      cursor: firstAccount!.id,
    });
    expect(nextAccountPage).toHaveLength(1);
    expect(nextAccountPage[0]!.id).not.toBe(firstAccount!.id);
  });
});
