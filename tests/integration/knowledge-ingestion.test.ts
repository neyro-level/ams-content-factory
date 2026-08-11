import 'dotenv/config';
import {
  createKnowledgeIngestionService,
  createKnowledgeRetrievalService,
  resolveTenantContext,
} from '../../packages/core/src/index.js';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';
import { MockEmbeddingProvider } from '../../packages/providers/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const email = 'knowledge-ingestion@ams-content-factory.local';
const slug = 'knowledge-ingestion-contract';

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('knowledge ingestion', () => {
  it('ingests text idempotently and rejects unsafe file and URL inputs', async () => {
    await prisma.organization.deleteMany({ where: { slug } });
    const user = await prisma.user.upsert({
      where: { email },
      create: { name: 'Knowledge Ingestion', email },
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
    const context = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: brand.id },
      tenants,
    );
    const service = createKnowledgeIngestionService({ prisma });
    const retrieval = createKnowledgeRetrievalService({
      prisma,
      embeddingProvider: new MockEmbeddingProvider(),
    });
    const source = {
      kind: 'TEXT' as const,
      context,
      title: 'Бриф бренда',
      text: 'Проверяемый контент для базы знаний.',
    };

    const first = await service.ingest(source);
    const repeated = await service.ingest(source);
    const [document, chunks] = await Promise.all([
      prisma.knowledgeDocument.findUniqueOrThrow({ where: { id: first.id } }),
      prisma.knowledgeChunk.findMany({ where: { documentId: first.id } }),
    ]);

    expect(repeated.id).toBe(first.id);
    expect(document.status).toBe('READY');
    expect(document.checksum).toHaveLength(64);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe(source.text);
    await expect(retrieval.embedDocument({ context, documentId: first.id })).resolves.toBe(1);
    await expect(retrieval.search({ context, query: 'Проверяемый контент' })).resolves.toEqual([
      expect.objectContaining({
        chunkId: chunks[0]?.id,
        documentId: first.id,
        content: source.text,
      }),
    ]);

    await expect(
      service.ingest({
        kind: 'FILE',
        context,
        title: 'Исполняемый файл',
        fileName: 'unsafe.exe',
        bytes: new TextEncoder().encode('not allowed'),
      }),
    ).rejects.toThrow('Only UTF-8 text files');
    await expect(
      service.ingest({
        kind: 'URL',
        context,
        title: 'Локальный адрес',
        sourceUrl: 'http://127.0.0.1/private',
      }),
    ).rejects.toThrow('must not target a private network');
  });
});
