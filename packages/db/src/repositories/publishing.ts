import { getPrisma } from '../client';
import type {
  PrismaClient,
  PublicationAttemptStatus,
  PublicationStatus,
  SocialAccountStatus,
  SocialPlatform,
} from '../generated/prisma/client';

export function createPublishingRepository(prisma: PrismaClient = getPrisma()) {
  const scopedPublication = (input: { organizationId: string; brandId: string; id: string }) =>
    prisma.publication.findFirst({
      where: { id: input.id, organizationId: input.organizationId, brandId: input.brandId },
      include: {
        socialAccount: { include: { credential: true } },
        platformVariant: true,
        attempts: true,
      },
    });
  return {
    async createSocialAccount(input: {
      organizationId: string;
      brandId: string;
      platform: SocialPlatform;
      externalAccountId: string;
      name: string;
      username?: string;
      scopes?: string[];
      metadata?: object;
    }) {
      const brand = await prisma.brand.findFirst({
        where: { id: input.brandId, organizationId: input.organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!brand) return null;
      return prisma.socialAccount.upsert({
        where: {
          brandId_platform_externalAccountId: {
            brandId: input.brandId,
            platform: input.platform,
            externalAccountId: input.externalAccountId,
          },
        },
        create: {
          brandId: input.brandId,
          platform: input.platform,
          externalAccountId: input.externalAccountId,
          name: input.name,
          ...(input.username !== undefined ? { username: input.username } : {}),
          ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        },
        update: {
          name: input.name,
          ...(input.username !== undefined ? { username: input.username } : {}),
          ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
          status: 'CONNECTED',
        },
      });
    },
    async upsertCredential(input: {
      organizationId: string;
      brandId: string;
      socialAccountId: string;
      accessTokenCiphertext: string;
      refreshTokenCiphertext?: string;
      expiresAt?: Date;
      encryptionVersion: string;
    }) {
      const account = await prisma.socialAccount.findFirst({
        where: {
          id: input.socialAccountId,
          brandId: input.brandId,
          brand: { organizationId: input.organizationId },
        },
        select: { id: true },
      });
      if (!account) return null;
      return prisma.socialCredential.upsert({
        where: { socialAccountId: input.socialAccountId },
        create: {
          socialAccountId: input.socialAccountId,
          accessTokenCiphertext: input.accessTokenCiphertext,
          ...(input.refreshTokenCiphertext !== undefined
            ? { refreshTokenCiphertext: input.refreshTokenCiphertext }
            : {}),
          ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
          encryptionVersion: input.encryptionVersion,
        },
        update: {
          accessTokenCiphertext: input.accessTokenCiphertext,
          ...(input.refreshTokenCiphertext !== undefined
            ? { refreshTokenCiphertext: input.refreshTokenCiphertext }
            : {}),
          ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
          encryptionVersion: input.encryptionVersion,
        },
      });
    },
    async createPublication(input: {
      organizationId: string;
      brandId: string;
      contentProjectId: string;
      platformVariantId: string;
      socialAccountId: string;
      scheduledAt?: Date;
    }) {
      const [project, variant, account] = await Promise.all([
        prisma.contentProject.findFirst({
          where: {
            id: input.contentProjectId,
            organizationId: input.organizationId,
            brandId: input.brandId,
          },
          select: { id: true },
        }),
        prisma.platformVariant.findFirst({
          where: {
            id: input.platformVariantId,
            contentProject: { organizationId: input.organizationId, brandId: input.brandId },
          },
          select: { contentProjectId: true },
        }),
        prisma.socialAccount.findFirst({
          where: {
            id: input.socialAccountId,
            brandId: input.brandId,
            brand: { organizationId: input.organizationId },
          },
          select: { id: true },
        }),
      ]);
      if (!project || !variant || variant.contentProjectId !== input.contentProjectId || !account)
        return null;
      return prisma.publication.create({
        data: {
          organizationId: input.organizationId,
          brandId: input.brandId,
          contentProjectId: input.contentProjectId,
          platformVariantId: input.platformVariantId,
          socialAccountId: input.socialAccountId,
          ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
        },
      });
    },
    findPublication: scopedPublication,
    updatePublication(input: {
      organizationId: string;
      brandId: string;
      id: string;
      from: PublicationStatus;
      to: PublicationStatus;
      externalPostId?: string;
      permalink?: string;
      lastAttemptId?: string;
      publishedAt?: Date;
    }) {
      return prisma.publication.updateMany({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          brandId: input.brandId,
          status: input.from,
        },
        data: {
          status: input.to,
          ...(input.externalPostId !== undefined ? { externalPostId: input.externalPostId } : {}),
          ...(input.permalink !== undefined ? { permalink: input.permalink } : {}),
          ...(input.lastAttemptId !== undefined ? { lastAttemptId: input.lastAttemptId } : {}),
          ...(input.publishedAt !== undefined ? { publishedAt: input.publishedAt } : {}),
        },
      });
    },
    async createAttempt(input: {
      organizationId: string;
      brandId: string;
      publicationId: string;
      idempotencyKey: string;
      providerOperation: string;
      requestFingerprint: string;
    }) {
      const publication = await scopedPublication({ ...input, id: input.publicationId });
      if (!publication) return null;
      const existing = publication.attempts.find(
        (attempt) => attempt.idempotencyKey === input.idempotencyKey,
      );
      if (existing) return existing;
      return prisma.publicationAttempt.create({
        data: {
          publicationId: input.publicationId,
          attempt: Math.max(0, ...publication.attempts.map((attempt) => attempt.attempt)) + 1,
          idempotencyKey: input.idempotencyKey,
          providerOperation: input.providerOperation,
          requestFingerprint: input.requestFingerprint,
        },
      });
    },
    updateAttempt(input: {
      organizationId: string;
      brandId: string;
      publicationId: string;
      id: string;
      status: PublicationAttemptStatus;
      providerJobId?: string;
      response?: object;
      errorCode?: string;
      errorMessage?: string;
    }) {
      return prisma.publicationAttempt.updateMany({
        where: {
          id: input.id,
          publicationId: input.publicationId,
          publication: { organizationId: input.organizationId, brandId: input.brandId },
        },
        data: {
          status: input.status,
          ...(input.providerJobId !== undefined ? { providerJobId: input.providerJobId } : {}),
          ...(input.response !== undefined ? { response: input.response } : {}),
          ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
          ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
          finishedAt: new Date(),
        },
      });
    },
    updateSocialAccountStatus(input: {
      organizationId: string;
      brandId: string;
      id: string;
      status: SocialAccountStatus;
    }) {
      return prisma.socialAccount.updateMany({
        where: {
          id: input.id,
          brandId: input.brandId,
          brand: { organizationId: input.organizationId },
        },
        data: { status: input.status },
      });
    },
  };
}
