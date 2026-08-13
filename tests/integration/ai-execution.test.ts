import 'dotenv/config';
import {
  createAiExecutionRepository,
  createContentRepository,
  createPrismaClient,
  createTenantRepository,
} from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const content = createContentRepository(prisma);
const executions = createAiExecutionRepository(prisma);
const slug = 'ai-execution-contract';

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: slug } } });
  await prisma.$disconnect();
});

describe('AI execution repository', () => {
  it('tracks a tenant-bound execution through success and preserves failure details', async () => {
    await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
    const user = await prisma.user.upsert({
      where: { email: `${slug}@local` },
      create: { name: slug, email: `${slug}@local` },
      update: {},
    });
    const organization = await tenants.createOrganizationWithOwner({
      ownerUserId: user.id,
      name: slug,
      slug,
    });
    const brand = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Brand',
      slug: 'brand',
    });
    const foreignBrand = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Foreign',
      slug: 'foreign',
    });
    const project = await content.createProject({
      organizationId: organization.id,
      brandId: brand.id,
      title: 'AI project',
      contentType: 'SOCIAL_POST',
    });
    const scope = {
      organizationId: organization.id,
      brandId: brand.id,
      contentProjectId: project!.id,
    };

    await expect(
      executions.create({
        ...scope,
        provider: 'openai',
        model: 'gpt-test',
        operation: 'social-post',
        promptKey: 'social-post',
        promptVersion: 1,
        estimatedCost: 0.02,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ status: 'PENDING', estimatedCost: expect.anything() }),
    );
    const execution = await executions.create({
      ...scope,
      provider: 'openai',
      model: 'gpt-test',
      operation: 'social-post',
      promptKey: 'social-post',
      promptVersion: 1,
    });
    await expect(executions.markRunning({ ...scope, id: execution!.id })).resolves.toEqual({
      count: 1,
    });
    await expect(
      executions.markSucceeded({
        ...scope,
        id: execution!.id,
        inputTokens: 20,
        outputTokens: 10,
        actualCost: 0.01,
      }),
    ).resolves.toEqual({ count: 1 });
    await expect(executions.find({ ...scope, id: execution!.id })).resolves.toEqual(
      expect.objectContaining({
        status: 'SUCCEEDED',
        inputTokens: 20,
        outputTokens: 10,
        finishedAt: expect.any(Date),
      }),
    );

    const failed = await executions.create({
      ...scope,
      provider: 'openai',
      model: 'gpt-test',
      operation: 'rewrite',
      promptKey: 'rewrite',
      promptVersion: 1,
    });
    await expect(
      executions.markFailed({
        ...scope,
        id: failed!.id,
        errorCode: 'PROVIDER_TIMEOUT',
        errorMessage: 'Timed out.',
      }),
    ).resolves.toEqual({ count: 1 });
    await expect(executions.find({ ...scope, id: failed!.id })).resolves.toEqual(
      expect.objectContaining({
        status: 'FAILED',
        errorCode: 'PROVIDER_TIMEOUT',
        errorMessage: 'Timed out.',
      }),
    );

    await expect(
      executions.create({
        ...scope,
        brandId: foreignBrand.id,
        provider: 'openai',
        model: 'gpt-test',
        operation: 'social-post',
        promptKey: 'social-post',
        promptVersion: 1,
      }),
    ).resolves.toBeNull();
    await expect(
      executions.markFailed({
        ...scope,
        brandId: foreignBrand.id,
        id: failed!.id,
        errorCode: 'FOREIGN',
        errorMessage: 'Denied.',
      }),
    ).resolves.toEqual({ count: 0 });
    await expect(executions.markRunning({ ...scope, id: failed!.id })).resolves.toEqual({
      count: 0,
    });
  });
});
