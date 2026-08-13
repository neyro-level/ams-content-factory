import 'dotenv/config';
import {
  AccessDeniedError,
  createKnowledgeRetrievalService,
  createKnowledgeWorkspaceService,
} from '../../packages/core/src/index.js';
import {
  createKnowledgeRepository,
  createPrismaClient,
  createTenantRepository,
  KnowledgeDocumentStatus,
  KnowledgeDocumentType,
} from '../../packages/db/src/index.js';
import { MockEmbeddingProvider } from '../../packages/providers/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const knowledge = createKnowledgeRepository(prisma);
const workspace = createKnowledgeWorkspaceService({
  knowledgeRepository: knowledge,
  tenantRepository: tenants,
});
const searchWorkspace = createKnowledgeWorkspaceService({
  knowledgeRepository: knowledge,
  tenantRepository: tenants,
  retrievalService: createKnowledgeRetrievalService({
    prisma,
    embeddingProvider: new MockEmbeddingProvider(),
  }),
});
const prefix = 'w6-knowledge-workspace';

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('knowledge workspace application service', () => {
  it('lists only the active brand documents and rejects a foreign organization context', async () => {
    const [user, foreignUser] = await Promise.all([
      prisma.user.create({ data: { name: 'Knowledge workspace', email: `${prefix}@local` } }),
      prisma.user.create({ data: { name: 'Foreign workspace', email: `${prefix}-foreign@local` } }),
    ]);
    const organization = await tenants.createOrganizationWithOwner({
      ownerUserId: user.id,
      name: 'Knowledge workspace',
      slug: prefix,
    });
    const [firstBrand, secondBrand, foreignOrganization] = await Promise.all([
      tenants.createBrand({ organizationId: organization.id, name: 'First', slug: 'first' }),
      tenants.createBrand({ organizationId: organization.id, name: 'Second', slug: 'second' }),
      tenants.createOrganizationWithOwner({
        ownerUserId: foreignUser.id,
        name: 'Foreign workspace',
        slug: `${prefix}-foreign`,
      }),
    ]);
    const foreignBrand = await tenants.createBrand({
      organizationId: foreignOrganization.id,
      name: 'Foreign',
      slug: 'foreign',
    });
    await tenants.grantBrandAccess({ brandId: firstBrand.id, userId: user.id, role: 'MANAGE' });
    await workspace.ingestText(
      { userId: user.id, organizationId: organization.id, brandId: firstBrand.id },
      {
        title: 'First document',
        text: 'Knowledge workspace source text.',
      },
    );
    await knowledge.createDocument({
      organizationId: organization.id,
      brandId: secondBrand.id,
      title: 'Second document',
      type: KnowledgeDocumentType.TEXT,
    });

    await expect(
      workspace.list({ userId: user.id, organizationId: organization.id, brandId: firstBrand.id }),
    ).resolves.toEqual([expect.objectContaining({ title: 'First document' })]);
    await expect(
      workspace.list({
        userId: user.id,
        organizationId: foreignOrganization.id,
        brandId: foreignBrand.id,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it('retries only a failed document inside the active brand without recreating its source', async () => {
    const user = await prisma.user.create({
      data: { name: 'Knowledge retry', email: `${prefix}-retry@local` },
    });
    const organization = await tenants.createOrganizationWithOwner({
      ownerUserId: user.id,
      name: 'Knowledge retry',
      slug: `${prefix}-retry`,
    });
    const [activeBrand, foreignBrand] = await Promise.all([
      tenants.createBrand({ organizationId: organization.id, name: 'Active', slug: 'active' }),
      tenants.createBrand({ organizationId: organization.id, name: 'Foreign', slug: 'foreign' }),
    ]);
    await tenants.grantBrandAccess({ brandId: activeBrand.id, userId: user.id, role: 'MANAGE' });
    const sourceText = 'Persisted text is retried without a new source fetch.';
    const failed = await knowledge.createDocument({
      organizationId: organization.id,
      brandId: activeBrand.id,
      title: 'Failed source',
      type: KnowledgeDocumentType.TEXT,
      sourceText,
    });
    await knowledge.transitionDocumentStatus({
      organizationId: organization.id,
      brandId: activeBrand.id,
      documentId: failed!.id,
      from: KnowledgeDocumentStatus.PENDING,
      to: KnowledgeDocumentStatus.FAILED,
    });

    const actor = {
      userId: user.id,
      organizationId: organization.id,
      brandId: activeBrand.id,
    };
    await expect(workspace.retry(actor, failed!.id)).resolves.toEqual(
      expect.objectContaining({ id: failed!.id, status: KnowledgeDocumentStatus.READY }),
    );
    await expect(
      prisma.knowledgeChunk.findMany({ where: { documentId: failed!.id } }),
    ).resolves.toEqual([expect.objectContaining({ ordinal: 0, content: sourceText })]);

    const pending = await knowledge.createDocument({
      organizationId: organization.id,
      brandId: activeBrand.id,
      title: 'Pending source',
      type: KnowledgeDocumentType.TEXT,
      sourceText,
    });
    await expect(workspace.retry(actor, pending!.id)).rejects.toThrow('not available for retry');
    await expect(
      prisma.knowledgeDocument.findUniqueOrThrow({ where: { id: pending!.id } }),
    ).resolves.toEqual(expect.objectContaining({ status: KnowledgeDocumentStatus.PENDING }));

    const foreignFailed = await knowledge.createDocument({
      organizationId: organization.id,
      brandId: foreignBrand.id,
      title: 'Foreign failed source',
      type: KnowledgeDocumentType.TEXT,
      sourceText,
    });
    await knowledge.transitionDocumentStatus({
      organizationId: organization.id,
      brandId: foreignBrand.id,
      documentId: foreignFailed!.id,
      from: KnowledgeDocumentStatus.PENDING,
      to: KnowledgeDocumentStatus.FAILED,
    });
    await expect(workspace.retry(actor, foreignFailed!.id)).rejects.toThrow(
      'not available for retry',
    );
    await expect(
      prisma.knowledgeDocument.findUniqueOrThrow({ where: { id: foreignFailed!.id } }),
    ).resolves.toEqual(expect.objectContaining({ status: KnowledgeDocumentStatus.FAILED }));
  });

  it('indexes and searches only the active brand through an explicit retrieval provider', async () => {
    const user = await prisma.user.create({
      data: { name: 'Knowledge search', email: `${prefix}-search@local` },
    });
    const organization = await tenants.createOrganizationWithOwner({
      ownerUserId: user.id,
      name: 'Knowledge search',
      slug: `${prefix}-search`,
    });
    const [activeBrand, foreignBrand] = await Promise.all([
      tenants.createBrand({ organizationId: organization.id, name: 'Search', slug: 'search' }),
      tenants.createBrand({ organizationId: organization.id, name: 'Foreign', slug: 'foreign' }),
    ]);
    await tenants.grantBrandAccess({ brandId: activeBrand.id, userId: user.id, role: 'MANAGE' });
    const actor = {
      userId: user.id,
      organizationId: organization.id,
      brandId: activeBrand.id,
    };
    const activeDocument = await workspace.ingestText(actor, {
      title: 'Searchable source',
      text: 'Hybrid retrieval returns only active-brand knowledge about editorial quality.',
    });
    const foreignDocument = await knowledge.createDocument({
      organizationId: organization.id,
      brandId: foreignBrand.id,
      title: 'Foreign searchable source',
      type: KnowledgeDocumentType.TEXT,
      sourceText: 'Foreign-brand knowledge must not be embedded through this context.',
    });
    await knowledge.addChunk({
      organizationId: organization.id,
      brandId: foreignBrand.id,
      documentId: foreignDocument!.id,
      ordinal: 0,
      content: foreignDocument!.sourceText!,
    });
    await knowledge.markDocumentReady(organization.id, foreignBrand.id, foreignDocument!.id);

    await expect(searchWorkspace.indexDocument(actor, activeDocument.id)).resolves.toBe(1);
    await expect(searchWorkspace.indexDocument(actor, foreignDocument!.id)).resolves.toBe(0);
    await expect(searchWorkspace.search(actor, { query: 'editorial quality' })).resolves.toEqual([
      expect.objectContaining({ documentId: activeDocument.id }),
    ]);
  });
});
