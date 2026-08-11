import 'dotenv/config';
import { createContentService, resolveTenantContext } from '../../packages/core/src/index.js';
import {
  createContentRepository,
  createPrismaClient,
  createTenantRepository,
} from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const slug = 'content-workflow-contract';
const email = `${slug}@local`;

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('content workflow', () => {
  it('enforces transitions, versions and brand isolation', async () => {
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
    const firstContext = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: first.id },
      tenants,
    );
    const secondContext = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: second.id },
      tenants,
    );
    const service = createContentService({ prisma });
    const project = await service.create(firstContext, {
      title: 'Контент',
      contentType: 'SOCIAL_POST',
    });
    expect(project?.status).toBe('IDEA');
    await expect(service.transition(firstContext, project!.id, 'APPROVED')).rejects.toThrow(
      'Invalid content transition',
    );
    await service.transition(firstContext, project!.id, 'RESEARCHING');
    await service.transition(firstContext, project!.id, 'DRAFT');
    const one = await service.appendVersion(firstContext, project!.id, {
      createdByType: 'USER',
      body: 'Первая версия',
    });
    const two = await service.appendVersion(firstContext, project!.id, {
      createdByType: 'AI',
      body: 'Вторая версия',
    });
    expect([one?.version, two?.version]).toEqual([1, 2]);
    const repository = createContentRepository(prisma);
    await expect(
      repository.addApproval({
        organizationId: organization.id,
        brandId: first.id,
        contentProjectId: project!.id,
        status: 'APPROVED',
        reviewerUserId: user.id,
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'APPROVED' }));
    await expect(
      repository.addApproval({
        organizationId: organization.id,
        brandId: second.id,
        contentProjectId: project!.id,
        status: 'APPROVED',
      }),
    ).resolves.toBeNull();
    await expect(service.transition(secondContext, project!.id, 'RESEARCHING')).rejects.toThrow(
      'outside the active organization',
    );
  });
});
