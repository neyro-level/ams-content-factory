import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createInboundWebhookRepository, type PrismaClient } from '@ams-content-factory/db';
import { createTokenEncryptor } from './token-encryption';
import { enqueueWorkflowRun } from './workflows';

type Encryptor = ReturnType<typeof createTokenEncryptor>;

export class InboundWebhookError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 404,
  ) {
    super(message);
    this.name = 'InboundWebhookError';
  }
}

type SignatureInput = {
  method: string;
  topic: string;
  keyId: string;
  brandId: string;
  idempotencyKey: string;
  bodyHash: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function createInboundWebhookSignaturePayload(input: SignatureInput) {
  return [
    input.method.toUpperCase(),
    input.topic,
    input.keyId,
    input.brandId,
    input.idempotencyKey,
    input.bodyHash,
  ].join('\n');
}

export function signInboundWebhookRequest(input: SignatureInput & { secret: string }) {
  return createHmac('sha256', input.secret)
    .update(createInboundWebhookSignaturePayload(input))
    .digest('hex');
}

function hasValidSignature(input: SignatureInput & { secret: string; signature: string }) {
  const expected = Buffer.from(signInboundWebhookRequest(input), 'hex');
  const received = Buffer.from(input.signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function createInboundWebhookService(options: {
  prisma?: PrismaClient;
  encryptor: Encryptor;
  enqueue?: typeof enqueueWorkflowRun;
}) {
  const repository = createInboundWebhookRepository(options.prisma);
  const enqueue = options.enqueue ?? enqueueWorkflowRun;

  return {
    async createCredential(input: { organizationId: string; keyId: string; secret: string }) {
      if (!input.keyId || !input.secret) {
        throw new Error('Inbound webhook keyId and secret are required.');
      }
      return repository.createCredential({
        organizationId: input.organizationId,
        keyId: input.keyId,
        secretCiphertext: options.encryptor.encrypt(input.secret),
        encryptionVersion: options.encryptor.encryptionVersion,
      });
    },

    async receive(input: {
      method: string;
      topic: string;
      keyId?: string | null;
      brandId?: string | null;
      signature?: string | null;
      idempotencyKey?: string | null;
      body: string;
      payload: object;
    }) {
      if (!input.keyId || !input.brandId || !input.signature || !input.idempotencyKey) {
        throw new InboundWebhookError('Webhook authentication headers are required.', 400);
      }
      if (!isUuid(input.brandId)) {
        throw new InboundWebhookError('Brand id must be a UUID.', 400);
      }

      const credential = await repository.findActiveCredential(input.keyId);
      if (!credential) throw new InboundWebhookError('Invalid webhook credential.', 401);

      let secret: string;
      try {
        secret = options.encryptor.decrypt(credential.secretCiphertext);
      } catch {
        throw new InboundWebhookError('Invalid webhook credential.', 401);
      }
      const bodyHash = createHash('sha256').update(input.body).digest('hex');
      if (
        !hasValidSignature({
          secret,
          signature: input.signature,
          method: input.method,
          topic: input.topic,
          keyId: input.keyId,
          brandId: input.brandId,
          idempotencyKey: input.idempotencyKey,
          bodyHash,
        })
      ) {
        throw new InboundWebhookError('Invalid webhook signature.', 401);
      }

      const brand = await repository.findActiveBrand({
        organizationId: credential.organizationId,
        brandId: input.brandId,
      });
      if (!brand) throw new InboundWebhookError('Brand was not found.', 404);

      return enqueue({
        organizationId: credential.organizationId,
        brandId: brand.id,
        type: `n8n.${input.topic}`,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
      });
    },
  };
}
