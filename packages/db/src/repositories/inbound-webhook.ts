import { BrandStatus, OrganizationStatus, type PrismaClient } from '../generated/prisma/client';
import { getPrisma } from '../client';

export function createInboundWebhookRepository(prisma: PrismaClient = getPrisma()) {
  return {
    createCredential(input: {
      organizationId: string;
      keyId: string;
      secretCiphertext: string;
      encryptionVersion: string;
    }) {
      return prisma.inboundWebhookCredential.create({ data: input });
    },
    findActiveCredential(keyId: string) {
      return prisma.inboundWebhookCredential.findFirst({
        where: {
          keyId,
          disabledAt: null,
          organization: { status: OrganizationStatus.ACTIVE },
        },
      });
    },
    findActiveBrand(input: { organizationId: string; brandId: string }) {
      return prisma.brand.findFirst({
        where: {
          id: input.brandId,
          organizationId: input.organizationId,
          status: BrandStatus.ACTIVE,
          deletedAt: null,
        },
      });
    },
  };
}
