import 'dotenv/config';
import {
  createKnowledgeRetrievalService,
  resolveTenantContext,
} from '../../packages/core/src/index.js';
import {
  createKnowledgeRepository,
  createPrismaClient,
  createTenantRepository,
  KnowledgeDocumentType,
} from '../../packages/db/src/index.js';
import { MockEmbeddingProvider } from '../../packages/providers/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const knowledge = createKnowledgeRepository(prisma);
const retrieval = createKnowledgeRetrievalService({
  prisma,
  embeddingProvider: new MockEmbeddingProvider(),
});
const email = 'knowledge-isolation@ams-content-factory.local';
const slug = 'knowledge-isolation-contract';

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('knowledge isolation', () => {
  it('returns chunks only from the requested brand', async () => {
    await prisma.organization.deleteMany({ where: { slug } });
    const user = await prisma.user.upsert({
      where: { email },
      create: { name: 'Knowledge Isolation', email },
      update: {},
    });
    const organization = await tenants.createOrganizationWithOwner({
      ownerUserId: user.id,
      name: slug,
      slug,
    });
    const [firstBrand, secondBrand] = await Promise.all([
      tenants.createBrand({ organizationId: organization.id, name: 'First', slug: 'first' }),
      tenants.createBrand({ organizationId: organization.id, name: 'Second', slug: 'second' }),
    ]);
    const [firstDocument, secondDocument] = await Promise.all([
      knowledge.createDocument({
        organizationId: organization.id,
        brandId: firstBrand.id,
        title: 'First',
        type: KnowledgeDocumentType.TEXT,
      }),
      knowledge.createDocument({
        organizationId: organization.id,
        brandId: secondBrand.id,
        title: 'Second',
        type: KnowledgeDocumentType.TEXT,
      }),
    ]);
    expect(firstDocument).not.toBeNull();
    expect(secondDocument).not.toBeNull();
    if (!firstDocument || !secondDocument) {
      throw new Error('Expected knowledge documents for both brands');
    }
    await Promise.all([
      knowledge.addChunk({
        organizationId: organization.id,
        brandId: firstBrand.id,
        documentId: firstDocument.id,
        ordinal: 0,
        content: 'Секрет первого бренда',
      }),
      knowledge.addChunk({
        organizationId: organization.id,
        brandId: secondBrand.id,
        documentId: secondDocument.id,
        ordinal: 0,
        content: 'Секрет второго бренда',
      }),
    ]);
    await Promise.all([
      knowledge.markDocumentReady(organization.id, firstBrand.id, firstDocument.id),
      knowledge.markDocumentReady(organization.id, secondBrand.id, secondDocument.id),
    ]);
    const [firstContext, secondContext] = await Promise.all([
      resolveTenantContext(
        { userId: user.id, organizationId: organization.id, brandId: firstBrand.id },
        tenants,
      ),
      resolveTenantContext(
        { userId: user.id, organizationId: organization.id, brandId: secondBrand.id },
        tenants,
      ),
    ]);
    await Promise.all([
      retrieval.embedDocument({ context: firstContext, documentId: firstDocument.id }),
      retrieval.embedDocument({ context: secondContext, documentId: secondDocument.id }),
    ]);

    const chunks = await knowledge.findChunks({
      organizationId: organization.id,
      brandId: firstBrand.id,
      query: 'Секрет',
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe('Секрет первого бренда');
    await expect(
      retrieval.embedDocument({ context: firstContext, documentId: secondDocument.id }),
    ).resolves.toBe(0);
    await expect(retrieval.search({ context: firstContext, query: 'Секрет' })).resolves.toEqual([
      expect.objectContaining({ documentId: firstDocument.id, content: 'Секрет первого бренда' }),
    ]);

    await expect(
      knowledge.addChunk({
        organizationId: organization.id,
        brandId: secondBrand.id,
        documentId: firstDocument.id,
        ordinal: 1,
        content: 'Чужой фрагмент',
      }),
    ).resolves.toBeNull();

    await expect(
      prisma.knowledgeChunk.findFirst({
        where: { documentId: firstDocument.id, ordinal: 1 },
      }),
    ).resolves.toBeNull();
  });
});
