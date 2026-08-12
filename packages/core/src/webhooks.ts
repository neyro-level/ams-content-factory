import { createHmac } from 'node:crypto';
import { createMcpRepository, type PrismaClient } from '@ams-content-factory/db';
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

export function createWebhookService(options: {
  prisma?: PrismaClient;
  encryptor: Encryptor;
  transport: OutboundWebhookTransport;
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
      const url = new URL(input.url);
      if (url.protocol !== 'https:') throw new Error('Webhook endpoints must use HTTPS.');
      if (!input.secret || !input.eventTypes.length)
        throw new Error('Webhook secret and event types are required.');
      return repository.createWebhookEndpoint({
        ...scope,
        url: url.toString(),
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
