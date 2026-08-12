import 'dotenv/config';
import { createContentService, resolveTenantContext } from '../../packages/core/src/index.js';
import {
  createContentRepository,
  createPrismaClient,
  createTenantRepository,
  MembershipRole,
  MembershipStatus,
} from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const slug = 'content-workflow-contract';
const email = `${slug}@local`;
const viewerEmail = `${slug}-viewer@local`;

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: slug } } });
  await prisma.$disconnect();
});

describe('content workflow', () => {
  it('enforces transitions, versions and brand isolation', async () => {
    await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
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
    const foreignOrganization = await tenants.createOrganizationWithOwner({
      ownerUserId: user.id,
      name: `${slug} foreign`,
      slug: `${slug}-foreign`,
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
    const foreignBrand = await tenants.createBrand({
      organizationId: foreignOrganization.id,
      name: 'Foreign',
      slug: 'foreign',
    });
    const firstContext = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: first.id },
      tenants,
    );
    const secondContext = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: second.id },
      tenants,
    );
    const foreignContext = await resolveTenantContext(
      { userId: user.id, organizationId: foreignOrganization.id, brandId: foreignBrand.id },
      tenants,
    );
    const firstPillar = await prisma.contentPillar.create({
      data: { brandId: first.id, name: 'First pillar' },
    });
    const secondPillar = await prisma.contentPillar.create({
      data: { brandId: second.id, name: 'Second pillar' },
    });
    const firstOpportunity = await prisma.contentOpportunity.create({
      data: {
        brandId: first.id,
        pillarId: firstPillar.id,
        title: 'First opportunity',
        angle: 'First angle',
      },
    });
    const secondOpportunity = await prisma.contentOpportunity.create({
      data: {
        brandId: second.id,
        pillarId: secondPillar.id,
        title: 'Second opportunity',
        angle: 'Second angle',
      },
    });
    const service = createContentService({ prisma });
    await expect(
      service.create(firstContext, {
        title: 'Foreign pillar denied',
        contentType: 'SOCIAL_POST',
        pillarId: secondPillar.id,
      }),
    ).resolves.toBeNull();
    await expect(
      service.create(firstContext, {
        title: 'Foreign opportunity denied',
        contentType: 'SOCIAL_POST',
        opportunityId: secondOpportunity.id,
      }),
    ).resolves.toBeNull();
    await expect(
      service.create(firstContext, {
        title: 'Mismatched scoped graph denied',
        contentType: 'SOCIAL_POST',
        pillarId: firstPillar.id,
        opportunityId: secondOpportunity.id,
      }),
    ).resolves.toBeNull();
    await expect(
      service.create(firstContext, {
        title: 'Scoped graph accepted',
        contentType: 'SOCIAL_POST',
        pillarId: firstPillar.id,
        opportunityId: firstOpportunity.id,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ pillarId: firstPillar.id, opportunityId: firstOpportunity.id }),
    );
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
    await expect(service.transition(foreignContext, project!.id, 'RESEARCHING')).rejects.toThrow(
      'outside the active organization',
    );

    const viewer = await prisma.user.create({
      data: { name: 'Viewer', email: viewerEmail },
    });
    await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: viewer.id,
        role: MembershipRole.VIEWER,
        status: MembershipStatus.ACTIVE,
      },
    });
    const viewerContext = await resolveTenantContext(
      { userId: viewer.id, organizationId: organization.id, brandId: first.id },
      tenants,
    );
    await expect(
      service.create(viewerContext, { title: 'Denied', contentType: 'SOCIAL_POST' }),
    ).rejects.toThrow('Permission required: content:write');
    await prisma.membership.updateMany({
      where: { organizationId: organization.id, userId: viewer.id },
      data: { status: MembershipStatus.SUSPENDED },
    });
    await expect(
      resolveTenantContext(
        { userId: viewer.id, organizationId: organization.id, brandId: first.id },
        tenants,
      ),
    ).rejects.toThrow('Active organization membership is required');
  });
});
