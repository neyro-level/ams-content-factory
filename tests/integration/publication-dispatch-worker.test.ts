import 'dotenv/config';
import {
  createPublicationDispatchService,
  createPublishingService,
  createTokenEncryptor,
} from '../../packages/core/src/index.js';
import {
  createPrismaClient,
  createTenantRepository,
  createWorkflowRunRepository,
} from '../../packages/db/src/index.js';
import { MockPublishingProvider } from '../../packages/providers/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';
import { processWorkflowRun } from '../../apps/worker/src/workflow-run-handler.js';
import { CountingPublishingProvider } from '../helpers/failure-harness.js';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const workflows = createWorkflowRunRepository(prisma);
const slug = 'publication-dispatch-worker-contract';
const email = `${slug}@local`;
const encryptor = createTokenEncryptor(Buffer.alloc(32, 41).toString('base64'));
const now = new Date('2026-08-13T00:00:00.000Z');

async function createQueuedPublication(input: {
  organizationId: string;
  brandId: string;
  title: string;
  scheduledAt?: Date;
}) {
  const project = await prisma.contentProject.create({
    data: {
      organizationId: input.organizationId,
      brandId: input.brandId,
      title: input.title,
      contentType: 'SOCIAL_POST',
      status: 'APPROVED',
    },
  });
  const variant = await prisma.platformVariant.create({
    data: { contentProjectId: project.id, platform: 'VK', caption: input.title },
  });
  const account = await prisma.socialAccount.create({
    data: {
      brandId: input.brandId,
      platform: 'VK',
      externalAccountId: `account-${input.title}`,
      name: input.title,
    },
  });
  await prisma.socialCredential.create({
    data: {
      socialAccountId: account.id,
      accessTokenCiphertext: encryptor.encrypt(`token-${input.title}`),
      encryptionVersion: encryptor.encryptionVersion,
    },
  });
  return prisma.publication.create({
    data: {
      organizationId: input.organizationId,
      brandId: input.brandId,
      contentProjectId: project.id,
      platformVariantId: variant.id,
      socialAccountId: account.id,
      status: 'QUEUED',
      scheduledAt: input.scheduledAt ?? new Date('2026-08-12T23:59:59.000Z'),
    },
  });
}

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { organization: { slug: { startsWith: slug } } } });
  await prisma.workflowRun.deleteMany({ where: { organization: { slug: { startsWith: slug } } } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: slug } } });
  await prisma.$disconnect();
});

describe('durable publication dispatch worker', () => {
  it('claims only due scoped work before one provider call and skips cancelled or foreign records', async () => {
    await prisma.auditLog.deleteMany({ where: { organization: { slug } } });
    await prisma.workflowRun.deleteMany({ where: { organization: { slug } } });
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
    const due = await createQueuedPublication({
      organizationId: organization.id,
      brandId: first.id,
      title: 'due',
    });
    const cancelled = await createQueuedPublication({
      organizationId: organization.id,
      brandId: first.id,
      title: 'cancelled',
    });
    await prisma.publication.update({ where: { id: cancelled.id }, data: { status: 'CANCELLED' } });
    const provider = new CountingPublishingProvider(new MockPublishingProvider('VK'));
    const publishing = createPublishingService({
      prisma,
      encryptor,
      providers: { VK: provider, INSTAGRAM: new MockPublishingProvider('INSTAGRAM') },
    });
    const dispatch = createPublicationDispatchService({
      publishingService: publishing,
      now: () => now,
    });
    const handlers = {
      'publication.dispatch': (run: Parameters<typeof dispatch.dispatch>[0]) =>
        dispatch.dispatch(run),
    };
    const dueRun = await workflows.createOrGet({
      organizationId: organization.id,
      brandId: first.id,
      type: 'publication.dispatch',
      idempotencyKey: `publication-dispatch:${due.id}`,
      payload: { publicationId: due.id },
    });
    await expect(
      processWorkflowRun(workflows, { organizationId: organization.id, id: dueRun.id }, handlers),
    ).resolves.toMatchObject({
      outcome: 'DISPATCHED',
      status: 'PUBLISHED',
    });
    expect(provider.publishCalls).toBe(1);
    await expect(prisma.publication.findUniqueOrThrow({ where: { id: due.id } })).resolves.toEqual(
      expect.objectContaining({ status: 'PUBLISHED' }),
    );
    await expect(
      prisma.publicationAttempt.count({ where: { publicationId: due.id } }),
    ).resolves.toBe(1);

    const cancelledRun = await workflows.createOrGet({
      organizationId: organization.id,
      brandId: first.id,
      type: 'publication.dispatch',
      idempotencyKey: `publication-dispatch:${cancelled.id}`,
      payload: { publicationId: cancelled.id },
    });
    await expect(
      processWorkflowRun(
        workflows,
        { organizationId: organization.id, id: cancelledRun.id },
        handlers,
      ),
    ).resolves.toMatchObject({ outcome: 'SKIPPED', reason: 'PUBLICATION_NOT_QUEUED' });

    const foreignRun = await workflows.createOrGet({
      organizationId: organization.id,
      brandId: second.id,
      type: 'publication.dispatch',
      idempotencyKey: `publication-dispatch:foreign-${due.id}`,
      payload: { publicationId: due.id },
    });
    await expect(
      processWorkflowRun(
        workflows,
        { organizationId: organization.id, id: foreignRun.id },
        handlers,
      ),
    ).resolves.toMatchObject({ outcome: 'SKIPPED', reason: 'PUBLICATION_OUTSIDE_WORKFLOW_SCOPE' });
    expect(provider.publishCalls).toBe(1);
  });
});
