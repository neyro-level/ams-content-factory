import 'dotenv/config';
import { createEditorialApprovalService } from '../../packages/core/src/index.js';
import {
  createContentRepository,
  createPrismaClient,
  createTenantRepository,
} from '../../packages/db/src/index.js';
import { MembershipRole, MembershipStatus } from '../../packages/db/src/generated/prisma/client.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const content = createContentRepository(prisma);
const slug = 'editorial-approval-contract';

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { organization: { is: { slug: { startsWith: slug } } } },
  });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: slug } } });
  await prisma.$disconnect();
});

describe('manual editorial approval', () => {
  it('lets a writer request review and add a scoped comment without deciding approval', async () => {
    const setup = await createFactCheckedProject('request-review');
    const service = createEditorialApprovalService();
    const comment = await service.comment(setup.actor, {
      contentProjectId: setup.project.id,
      body: 'Ready for review.',
    });
    await service.requestReview(setup.actor, { contentProjectId: setup.project.id });
    expect(comment).toEqual(
      expect.objectContaining({ body: 'Ready for review.', authorUserId: setup.actor.userId }),
    );
    await expect(
      prisma.contentProject.findUnique({ where: { id: setup.project.id } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'REVIEW' }));
  });

  it('allows only a reviewer to transition REVIEW to APPROVED and records the reviewer', async () => {
    const setup = await createReviewProject('approved');
    const reviewer = await prisma.user.create({
      data: { name: 'Reviewer', email: `${slug}-reviewer@local` },
    });
    await prisma.membership.create({
      data: {
        organizationId: setup.actor.organizationId,
        userId: reviewer.id,
        role: MembershipRole.REVIEWER,
        status: MembershipStatus.ACTIVE,
      },
    });
    const approval = await createEditorialApprovalService().approve(
      {
        userId: reviewer.id,
        organizationId: setup.actor.organizationId,
        brandId: setup.actor.brandId,
      },
      { contentProjectId: setup.project.id, note: 'Approved by reviewer.' },
    );
    expect(approval).toEqual(
      expect.objectContaining({ status: 'APPROVED', reviewerUserId: reviewer.id }),
    );
    expect(
      await prisma.auditLog.findFirst({
        where: {
          organizationId: setup.actor.organizationId,
          action: 'content.approve',
          entityId: setup.project.id,
        },
      }),
    ).toMatchObject({ actorUserId: reviewer.id, brandId: setup.actor.brandId });
    await expect(
      prisma.contentProject.findUnique({ where: { id: setup.project.id } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'APPROVED' }));
  });

  it('rejects a content writer and a repeated approval', async () => {
    const setup = await createReviewProject('denied');
    const writer = await prisma.user.create({
      data: { name: 'Writer', email: `${slug}-writer@local` },
    });
    await prisma.membership.create({
      data: {
        organizationId: setup.actor.organizationId,
        userId: writer.id,
        role: MembershipRole.EDITOR,
        status: MembershipStatus.ACTIVE,
      },
    });
    const service = createEditorialApprovalService();
    await expect(
      service.approve(
        {
          userId: writer.id,
          organizationId: setup.actor.organizationId,
          brandId: setup.actor.brandId,
        },
        { contentProjectId: setup.project.id },
      ),
    ).rejects.toThrow('content:review');
    await service.approve(setup.actor, { contentProjectId: setup.project.id });
    await expect(
      service.approve(setup.actor, { contentProjectId: setup.project.id }),
    ).rejects.toThrow('not in REVIEW');
  });

  it('allows a reviewer to return or reject a review with an immutable decision record', async () => {
    const returned = await createReviewProject('return');
    const service = createEditorialApprovalService();
    const returnDecision = await service.returnToDraft(returned.actor, {
      contentProjectId: returned.project.id,
      note: 'Add proof.',
    });
    expect(returnDecision).toEqual(
      expect.objectContaining({ status: 'CHANGES_REQUESTED', note: 'Add proof.' }),
    );
    await expect(
      prisma.contentProject.findUnique({ where: { id: returned.project.id } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'DRAFT' }));

    const rejected = await createReviewProject('reject');
    const rejectDecision = await service.reject(rejected.actor, {
      contentProjectId: rejected.project.id,
      note: 'Not aligned.',
    });
    expect(rejectDecision).toEqual(
      expect.objectContaining({ status: 'REJECTED', note: 'Not aligned.' }),
    );
    expect(
      await prisma.auditLog.findFirst({
        where: {
          organizationId: rejected.actor.organizationId,
          action: 'content.reject',
          entityId: rejected.project.id,
        },
      }),
    ).toMatchObject({ actorUserId: rejected.actor.userId, brandId: rejected.actor.brandId });
    await expect(
      prisma.contentProject.findUnique({ where: { id: rejected.project.id } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'REJECTED' }));
  });
});

async function createReviewProject(name: string) {
  const user = await prisma.user.upsert({
    where: { email: `${slug}-${name}@local` },
    create: { name, email: `${slug}-${name}@local` },
    update: {},
  });
  const organization = await tenants.createOrganizationWithOwner({
    ownerUserId: user.id,
    name: `${slug}-${name}`,
    slug: `${slug}-${name}`,
  });
  const brand = await tenants.createBrand({
    organizationId: organization.id,
    name,
    slug: name,
    ownerUserId: user.id,
  });
  const project = await content.createProject({
    organizationId: organization.id,
    brandId: brand.id,
    title: name,
    contentType: 'SOCIAL_POST',
  });
  if (!project) throw new Error('Test project failed.');
  for (const [from, to] of [
    ['IDEA', 'RESEARCHING'],
    ['RESEARCHING', 'DRAFT'],
    ['DRAFT', 'FACT_CHECK'],
    ['FACT_CHECK', 'REVIEW'],
  ] as const)
    await content.transition({
      organizationId: organization.id,
      brandId: brand.id,
      id: project.id,
      from,
      to,
    });
  return {
    actor: { userId: user.id, organizationId: organization.id, brandId: brand.id },
    project,
  };
}

async function createFactCheckedProject(name: string) {
  const setup = await createReviewProject(name);
  await content.transition({
    organizationId: setup.actor.organizationId,
    brandId: setup.actor.brandId,
    id: setup.project.id,
    from: 'REVIEW',
    to: 'DRAFT',
  });
  await content.transition({
    organizationId: setup.actor.organizationId,
    brandId: setup.actor.brandId,
    id: setup.project.id,
    from: 'DRAFT',
    to: 'FACT_CHECK',
  });
  return setup;
}
