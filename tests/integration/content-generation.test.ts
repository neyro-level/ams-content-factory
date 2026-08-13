import 'dotenv/config';
import { createContentGenerationService } from '../../packages/core/src/index.js';
import {
  createContentRepository,
  createPrismaClient,
  createTenantRepository,
} from '../../packages/db/src/index.js';
import {
  MockTextGenerationProvider,
  OpenAiTextGenerationProvider,
} from '../../packages/providers/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const content = createContentRepository(prisma);
const slug = 'content-generation-contract';

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: slug } } });
  await prisma.$disconnect();
});

describe('content generation', () => {
  it('persists AI execution and an immutable draft only after provider success', async () => {
    const setup = await createProject('success');
    const service = createContentGenerationService({
      provider: new MockTextGenerationProvider({
        text: 'AI draft.',
        model: 'mock-model',
        usage: { inputTokens: 12, outputTokens: 4 },
      }),
    });

    const result = await service.generateDraft(setup.actor, {
      contentProjectId: setup.project.id,
      promptKey: 'social-post',
    });

    expect(result.version).toEqual(
      expect.objectContaining({
        body: 'AI draft.',
        createdByType: 'AI',
        aiExecutionId: result.executionId,
      }),
    );
    await expect(
      prisma.contentProject.findUnique({ where: { id: setup.project.id } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'DRAFT' }));
    await expect(
      prisma.aiExecution.findUnique({ where: { id: result.executionId } }),
    ).resolves.toEqual(
      expect.objectContaining({ status: 'SUCCEEDED', inputTokens: 12, outputTokens: 4 }),
    );
  });

  it('records BLOCKED_EXTERNAL without creating a draft when the live credential is absent', async () => {
    const setup = await createProject('blocked');
    const service = createContentGenerationService({
      provider: new OpenAiTextGenerationProvider(undefined),
    });

    await expect(
      service.generateDraft(setup.actor, {
        contentProjectId: setup.project.id,
        promptKey: 'social-post',
      }),
    ).rejects.toThrow('BLOCKED_EXTERNAL');
    await expect(
      prisma.contentVersion.count({ where: { contentProjectId: setup.project.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.aiExecution.findFirst({ where: { contentProjectId: setup.project.id } }),
    ).resolves.toEqual(
      expect.objectContaining({ status: 'FAILED', errorCode: 'BLOCKED_EXTERNAL' }),
    );
  });

  it('rewrites a DRAFT as a new immutable AI version', async () => {
    const setup = await createProject('rewrite');
    const source = await makeDraft(setup);
    const service = createContentGenerationService({
      provider: new MockTextGenerationProvider({
        text: 'Rewritten draft.',
        model: 'mock-model',
        usage: { inputTokens: 9, outputTokens: 6 },
      }),
    });

    const result = await service.rewriteDraft(setup.actor, {
      contentProjectId: setup.project.id,
      sourceVersionId: source.id,
      instruction: 'Make it shorter.',
    });

    expect(result.version).toEqual(
      expect.objectContaining({ version: 2, body: 'Rewritten draft.', createdByType: 'AI' }),
    );
    await expect(prisma.contentVersion.findUnique({ where: { id: source.id } })).resolves.toEqual(
      expect.objectContaining({ version: 1, body: 'Original draft.', createdByType: 'USER' }),
    );
    await expect(
      prisma.aiExecution.findUnique({ where: { id: result.executionId } }),
    ).resolves.toEqual(
      expect.objectContaining({
        operation: 'rewrite',
        status: 'SUCCEEDED',
        inputTokens: 9,
        outputTokens: 6,
      }),
    );
  });

  it('rejects a rewrite source that belongs to another content project', async () => {
    const first = await createProject('rewrite-source-a');
    const second = await createProject('rewrite-source-b');
    await makeDraft(first);
    const foreignSource = await makeDraft(second);
    const service = createContentGenerationService({ provider: new MockTextGenerationProvider() });

    await expect(
      service.rewriteDraft(first.actor, {
        contentProjectId: first.project.id,
        sourceVersionId: foreignSource.id,
        instruction: 'Rewrite it.',
      }),
    ).rejects.toThrow('outside the active organization');
    await expect(
      prisma.aiExecution.count({ where: { contentProjectId: first.project.id } }),
    ).resolves.toBe(0);
  });
});

async function createProject(name: string) {
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
    name: name,
    slug: name,
    ownerUserId: user.id,
  });
  const project = await content.createProject({
    organizationId: organization.id,
    brandId: brand.id,
    title: name,
    contentType: 'SOCIAL_POST',
  });
  return {
    actor: { userId: user.id, organizationId: organization.id, brandId: brand.id },
    project: project!,
  };
}

async function makeDraft(setup: Awaited<ReturnType<typeof createProject>>) {
  const version = await content.appendVersion({
    organizationId: setup.actor.organizationId,
    brandId: setup.actor.brandId,
    contentProjectId: setup.project.id,
    createdByType: 'USER',
    body: 'Original draft.',
  });
  if (!version) throw new Error('Test content version could not be created.');
  const researching = await content.transition({
    organizationId: setup.actor.organizationId,
    brandId: setup.actor.brandId,
    id: setup.project.id,
    from: 'IDEA',
    to: 'RESEARCHING',
  });
  if (researching.count !== 1) throw new Error('Test content project could not start.');
  const drafted = await content.transition({
    organizationId: setup.actor.organizationId,
    brandId: setup.actor.brandId,
    id: setup.project.id,
    from: 'RESEARCHING',
    to: 'DRAFT',
  });
  if (drafted.count !== 1) throw new Error('Test content project could not enter DRAFT.');
  return version;
}
