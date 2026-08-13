import { createHmac } from 'node:crypto';
import { createMcpRepository, type PrismaClient } from '@ams-content-factory/db';
import { assertSafeExternalUrl } from '@ams-content-factory/providers';
import { createTokenEncryptor } from './token-encryption';
import { requirePermission, type Permission } from './tenant-context';

type Context = { organizationId: string; permissions: Set<Permission> };
type Encryptor = ReturnType<typeof createTokenEncryptor>;

export interface OutboundWebhookTransport {
  deliver(input: {
    url: string;
    body: string;
    signature: string;
  }): Promise<{ ok: boolean; error?: string }>;
}

export class OutboundWebhookUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundWebhookUrlError';
  }
}

export async function validateOutboundWebhookUrl(
  value: string,
  assertSafeUrl: (url: string) => Promise<string> = assertSafeExternalUrl,
) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OutboundWebhookUrlError('Webhook endpoint URL must be an absolute HTTPS URL.');
  }
  if (url.protocol !== 'https:') {
    throw new OutboundWebhookUrlError('Webhook endpoints must use HTTPS.');
  }
  try {
    return await assertSafeUrl(url.toString());
  } catch {
    throw new OutboundWebhookUrlError('Webhook endpoint URL is not a safe public target.');
  }
}

export function createWebhookService(options: {
  prisma?: PrismaClient;
  encryptor: Encryptor;
  transport: OutboundWebhookTransport;
  assertSafeUrl?: (url: string) => Promise<string>;
}) {
  const repository = createMcpRepository(options.prisma);
  const requireAdmin = (context: Context) => {
    requirePermission(context, 'brand:manage');
    return { organizationId: context.organizationId };
  };
  return {
    async configure(
      context: Context,
      input: { url: string; secret: string; eventTypes: string[] },
    ) {
      const scope = requireAdmin(context);
      const url = await validateOutboundWebhookUrl(input.url, options.assertSafeUrl);
      if (!input.secret || !input.eventTypes.length)
        throw new Error('Webhook secret and event types are required.');
      return repository.createWebhookEndpoint({
        ...scope,
        url,
        secretCiphertext: options.encryptor.encrypt(input.secret),
        encryptionVersion: options.encryptor.encryptionVersion,
        eventTypes: [...new Set(input.eventTypes)],
      });
    },
    async emit(context: Context, input: { eventType: string; payload: object }) {
      const scope = requireAdmin(context);
      const endpoints = await repository.listActiveEndpoints({
        ...scope,
        eventType: input.eventType,
      });
      return Promise.all(
        endpoints.map(async (endpoint) => {
          const delivery = await repository.createDelivery({
            endpointId: endpoint.id,
            eventType: input.eventType,
            payload: input.payload,
          });
          const body = JSON.stringify({
            eventType: input.eventType,
            payload: input.payload,
            deliveryId: delivery.id,
          });
          const secret = options.encryptor.decrypt(endpoint.secretCiphertext);
          const result = await options.transport.deliver({
            url: endpoint.url,
            body,
            signature: createHmac('sha256', secret).update(body).digest('hex'),
          });
          await repository.updateDelivery({
            organizationId: scope.organizationId,
            id: delivery.id,
            status: result.ok ? 'DELIVERED' : 'FAILED',
            ...(result.error !== undefined ? { error: result.error } : {}),
          });
          return delivery.id;
        }),
      );
    },
  };
}
