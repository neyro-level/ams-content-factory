import { getPrisma } from '../client';
import type { ApiKeyScope, PrismaClient, WebhookDeliveryStatus } from '../generated/prisma/client';

export function createMcpRepository(prisma: PrismaClient = getPrisma()) {
  return {
    async createApiKey(input: {
      organizationId: string;
      name: string;
      tokenHash: string;
      scopes: ApiKeyScope[];
      expiresAt?: Date;
    }) {
      return prisma.apiKey.create({
        data: {
          ...input,
          ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
        },
      });
    },
    findActiveApiKey(tokenHash: string) {
      return prisma.apiKey.findFirst({
        where: {
          tokenHash,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
    },
    markApiKeyUsed(input: { organizationId: string; id: string }) {
      return prisma.apiKey.updateMany({
        where: { id: input.id, organizationId: input.organizationId, revokedAt: null },
        data: { lastUsedAt: new Date() },
      });
    },
    revokeApiKey(input: { organizationId: string; id: string }) {
      return prisma.apiKey.updateMany({
        where: { id: input.id, organizationId: input.organizationId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },
    listApiKeys(organizationId: string) {
      return prisma.apiKey.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          scopes: true,
          expiresAt: true,
          lastUsedAt: true,
          revokedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    },
    createWebhookEndpoint(input: {
      organizationId: string;
      url: string;
      secretCiphertext: string;
      encryptionVersion: string;
      eventTypes: string[];
    }) {
      return prisma.webhookEndpoint.upsert({
        where: { organizationId_url: { organizationId: input.organizationId, url: input.url } },
        create: input,
        update: {
          secretCiphertext: input.secretCiphertext,
          encryptionVersion: input.encryptionVersion,
          eventTypes: input.eventTypes,
          disabledAt: null,
        },
      });
    },
    listActiveEndpoints(input: { organizationId: string; eventType: string }) {
      return prisma.webhookEndpoint.findMany({
        where: {
          organizationId: input.organizationId,
          disabledAt: null,
          eventTypes: { has: input.eventType },
        },
      });
    },
    createDelivery(input: { endpointId: string; eventType: string; payload: object }) {
      return prisma.webhookDelivery.create({ data: input });
    },
    updateDelivery(input: {
      organizationId: string;
      id: string;
      status: WebhookDeliveryStatus;
      error?: string;
    }) {
      return prisma.webhookDelivery.updateMany({
        where: { id: input.id, endpoint: { organizationId: input.organizationId } },
        data: {
          status: input.status,
          attempts: { increment: 1 },
          ...(input.error !== undefined ? { lastError: input.error } : {}),
          ...(input.status === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
        },
      });
    },
  };
}
