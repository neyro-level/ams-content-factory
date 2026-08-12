import 'dotenv/config';
import {
  createInboundWebhookService,
  InboundWebhookError,
  createTokenEncryptor,
  signInboundWebhookRequest,
} from '../../packages/core/src/index.js';
import {
  createPrismaClient,
  createTenantRepository,
  createWorkflowRunRepository,
} from '../../packages/db/src/index.js';
import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const workflows = createWorkflowRunRepository(prisma);
const slug = 'inbound-webhook-auth-contract';
const email = `${slug}@local`;
const secret = 'inbound-webhook-test-secret';
const encryptor = createTokenEncryptor(Buffer.alloc(32, 11).toString('base64'));

async function cleanup() {
  await prisma.auditLog.deleteMany({ where: { organization: { slug: { startsWith: slug } } } });
  await prisma.workflowRun.deleteMany({ where: { organization: { slug: { startsWith: slug } } } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
}

afterAll(async () => {
  await cleanup();
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('inbound n8n webhook authentication', () => {
  it('binds the organization to keyId and signs tenant-critical request fields', async () => {
    await cleanup();
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
    const brand = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Primary',
      slug: 'primary',
    });
    const foreignBrand = await tenants.createBrand({
      organizationId: foreignOrganization.id,
      name: 'Foreign',
      slug: 'foreign',
    });
    const service = createInboundWebhookService({
      prisma,
      encryptor,
      enqueue: (input) => workflows.createOrGet(input),
    });
    const credential = await service.createCredential({
      organizationId: organization.id,
      keyId: 'n8n-contract-key',
      secret,
    });
    const stored = await prisma.inboundWebhookCredential.findUniqueOrThrow({
      where: { id: credential.id },
    });
    expect(stored.secretCiphertext).not.toContain(secret);

    const payload = JSON.stringify({ source: 'n8n-contract' });
    const idempotencyKey = 'n8n-contract-idempotency-key';
    const signatureFor = (brandId: string, signedSecret = secret) =>
      signInboundWebhookRequest({
        secret: signedSecret,
        method: 'POST',
        topic: 'research',
        keyId: credential.keyId,
        brandId,
        idempotencyKey,
        bodyHash: createHash('sha256').update(payload).digest('hex'),
      });
    const receive = (overrides: Partial<Parameters<typeof service.receive>[0]> = {}) =>
      service.receive({
        method: 'POST',
        topic: 'research',
        keyId: credential.keyId,
        brandId: brand.id,
        signature: signatureFor(brand.id),
        idempotencyKey,
        body: payload,
        payload: { source: 'n8n-contract' },
        ...overrides,
      });

    await expect(receive({ keyId: 'unknown-key' })).rejects.toMatchObject<InboundWebhookError>({
      status: 401,
    });
    await expect(
      receive({ signature: signatureFor(brand.id, 'wrong-secret') }),
    ).rejects.toMatchObject<InboundWebhookError>({ status: 401 });
    await expect(receive({ brandId: 'not-a-uuid' })).rejects.toMatchObject<InboundWebhookError>({
      status: 400,
    });
    await expect(
      receive({ brandId: foreignBrand.id, signature: signatureFor(foreignBrand.id) }),
    ).rejects.toMatchObject<InboundWebhookError>({ status: 404 });
    await expect(
      receive({ brandId: foreignBrand.id, signature: signatureFor(brand.id) }),
    ).rejects.toMatchObject<InboundWebhookError>({ status: 401 });

    const [first, duplicate] = await Promise.all([receive(), receive()]);
    expect(first.id).toBe(duplicate.id);
    await expect(
      prisma.workflowRun.count({
        where: { organizationId: organization.id, idempotencyKey },
      }),
    ).resolves.toBe(1);
    expect(first.organizationId).toBe(organization.id);
    expect(first.brandId).toBe(brand.id);
  });
});
