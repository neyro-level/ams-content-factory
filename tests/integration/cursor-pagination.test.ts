import 'dotenv/config';
import {
  createContentRepository,
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
