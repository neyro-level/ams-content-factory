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
    listDueQueuedPublications(input: { now: Date; take?: number; cursor?: string }) {
      return prisma.publication.findMany({
        where: {
          status: 'QUEUED',
          scheduledAt: { lte: input.now },
        },
        select: { id: true, organizationId: true, brandId: true },
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        take: Math.min(Math.max(input.take ?? 100, 1), 250),
      });
    },
    listCalendarPublications(input: {
      organizationId: string;
      brandId: string;
      from: Date;
      until: Date;
      take?: number;
      cursor?: string;
    }) {
      return prisma.publication.findMany({
        where: {
          organizationId: input.organizationId,
          brandId: input.brandId,
          status: 'QUEUED',
          scheduledAt: { gte: input.from, lt: input.until },
        },
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          contentProject: { select: { title: true } },
          platformVariant: { select: { platform: true } },
          socialAccount: { select: { name: true, platform: true } },
        },
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        take: Math.min(Math.max(input.take ?? 100, 1), 250),
      });
    },
    listUnscheduledDraftPublications(input: {
      organizationId: string;
      brandId: string;
      take?: number;
      cursor?: string;
    }) {
      return prisma.publication.findMany({
        where: {
          organizationId: input.organizationId,
          brandId: input.brandId,
          status: 'DRAFT',
          scheduledAt: null,
        },
        select: {
          id: true,
          contentProject: { select: { title: true } },
          platformVariant: { select: { platform: true } },
          socialAccount: { select: { name: true, platform: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        take: Math.min(Math.max(input.take ?? 50, 1), 100),
      });
    },
    listPublicationIssues(input: {
      organizationId: string;
      brandId: string;
      take?: number;
      cursor?: string;
    }) {
      return prisma.publication.findMany({
        where: {
          organizationId: input.organizationId,
          brandId: input.brandId,
          status: { in: ['FAILED', 'OUTCOME_UNKNOWN'] },
        },
        select: {
          id: true,
          status: true,
          contentProject: { select: { title: true } },
          platformVariant: { select: { platform: true } },
          socialAccount: { select: { id: true, name: true, status: true } },
          attempts: {
            select: { errorCode: true },
            orderBy: { attempt: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        take: Math.min(Math.max(input.take ?? 50, 1), 100),
      });
    },
    listPublicationIssueAccounts(input: {
      organizationId: string;
      brandId: string;
      take?: number;
      cursor?: string;
    }) {
      return prisma.socialAccount.findMany({
        where: {
          brandId: input.brandId,
          status: { in: ['EXPIRED', 'ERROR'] },
          brand: { organizationId: input.organizationId, deletedAt: null },
        },
        select: { id: true, name: true, platform: true, status: true },
        orderBy: [{ status: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        take: Math.min(Math.max(input.take ?? 50, 1), 100),
      });
    },
    listSocialAccounts(input: {
      organizationId: string;
      brandId: string;
      take?: number;
      cursor?: string;
    }) {
      return prisma.socialAccount.findMany({
        where: {
          brandId: input.brandId,
          brand: { organizationId: input.organizationId, deletedAt: null },
        },
        select: {
          id: true,
          platform: true,
          externalAccountId: true,
          name: true,
          username: true,
          status: true,
          scopes: true,
          updatedAt: true,
        },
        orderBy: [{ platform: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        take: Math.min(Math.max(input.take ?? 50, 1), 100),
      });
    },
    findSocialAccountCredential(input: { organizationId: string; brandId: string; id: string }) {
      return prisma.socialAccount.findFirst({
        where: {
          id: input.id,
          brandId: input.brandId,
          brand: { organizationId: input.organizationId, deletedAt: null },
        },
        include: { credential: true },
      });
    },
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
    async replaceCredentialAndSetStatus(input: {
      organizationId: string;
      brandId: string;
      socialAccountId: string;
      accessTokenCiphertext: string;
      refreshTokenCiphertext?: string;
      expiresAt: Date;
      encryptionVersion: string;
    }) {
      return prisma.$transaction(async (tx) => {
        const account = await tx.socialAccount.findFirst({
          where: {
            id: input.socialAccountId,
            brandId: input.brandId,
            brand: { organizationId: input.organizationId, deletedAt: null },
          },
          select: { id: true },
        });
        if (!account) return null;
        await tx.socialCredential.upsert({
          where: { socialAccountId: account.id },
          create: {
            socialAccountId: account.id,
            accessTokenCiphertext: input.accessTokenCiphertext,
            ...(input.refreshTokenCiphertext !== undefined
              ? { refreshTokenCiphertext: input.refreshTokenCiphertext }
              : {}),
            expiresAt: input.expiresAt,
            encryptionVersion: input.encryptionVersion,
          },
          update: {
            accessTokenCiphertext: input.accessTokenCiphertext,
            ...(input.refreshTokenCiphertext !== undefined
              ? { refreshTokenCiphertext: input.refreshTokenCiphertext }
              : {}),
            expiresAt: input.expiresAt,
            encryptionVersion: input.encryptionVersion,
          },
        });
        return tx.socialAccount.update({
          where: { id: account.id },
          data: { status: 'CONNECTED' },
          include: { credential: true },
        });
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
          brand: { organizationId: input.organizationId, deletedAt: null },
        },
        data: { status: input.status },
      });
    },
    async disconnectSocialAccount(input: { organizationId: string; brandId: string; id: string }) {
      return prisma.$transaction(async (tx) => {
        const account = await tx.socialAccount.findFirst({
          where: {
            id: input.id,
            brandId: input.brandId,
            brand: { organizationId: input.organizationId, deletedAt: null },
          },
          select: { id: true, platform: true },
        });
        if (!account) return null;
        await tx.socialCredential.deleteMany({ where: { socialAccountId: account.id } });
        return tx.socialAccount.update({
          where: { id: account.id },
          data: { status: 'DISCONNECTED' },
        });
      });
    },
    async createPublication(input: {
      organizationId: string;
      brandId: string;
      contentProjectId: string;
      platformVariantId: string;
      socialAccountId: string;
    }) {
      const [project, variant, account] = await Promise.all([
        prisma.contentProject.findFirst({
          where: {
            id: input.contentProjectId,
            organizationId: input.organizationId,
            brandId: input.brandId,
            status: 'APPROVED',
          },
          select: { id: true },
        }),
        prisma.platformVariant.findFirst({
          where: {
            id: input.platformVariantId,
            contentProject: { organizationId: input.organizationId, brandId: input.brandId },
          },
          select: { contentProjectId: true, platform: true },
        }),
        prisma.socialAccount.findFirst({
          where: {
            id: input.socialAccountId,
            brandId: input.brandId,
            status: 'CONNECTED',
            brand: { organizationId: input.organizationId, deletedAt: null },
          },
          select: { id: true, platform: true },
        }),
      ]);
      if (
        !project ||
        !variant ||
        variant.contentProjectId !== input.contentProjectId ||
        !account ||
        variant.platform !== account.platform
      )
        return null;
      return prisma.publication.create({
        data: {
          organizationId: input.organizationId,
          brandId: input.brandId,
          contentProjectId: input.contentProjectId,
          platformVariantId: input.platformVariantId,
          socialAccountId: input.socialAccountId,
        },
      });
    },
    schedulePublication(input: {
      organizationId: string;
      brandId: string;
      id: string;
      scheduledAt: Date;
    }) {
      return prisma.publication.updateMany({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          brandId: input.brandId,
          status: 'DRAFT',
        },
        data: { status: 'QUEUED', scheduledAt: input.scheduledAt },
      });
    },
    reschedulePublication(input: {
      organizationId: string;
      brandId: string;
      id: string;
      scheduledAt: Date;
    }) {
      return prisma.publication.updateMany({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          brandId: input.brandId,
          status: 'QUEUED',
          lastAttemptId: null,
        },
        data: { scheduledAt: input.scheduledAt },
      });
    },
    cancelPublication(input: { organizationId: string; brandId: string; id: string }) {
      return prisma.publication.updateMany({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          brandId: input.brandId,
          status: 'QUEUED',
          lastAttemptId: null,
        },
        data: { status: 'CANCELLED' },
      });
    },
    claimDuePublicationForDispatch(input: {
      organizationId: string;
      brandId: string;
      id: string;
      now: Date;
    }) {
      return prisma.publication.updateMany({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          brandId: input.brandId,
          status: 'QUEUED',
          scheduledAt: { lte: input.now },
          lastAttemptId: null,
        },
        data: { status: 'PUBLISHING' },
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
    async createOrGetAttempt(input: {
      organizationId: string;
      brandId: string;
      publicationId: string;
      idempotencyKey: string;
      providerOperation: string;
      requestFingerprint: string;
    }) {
      return prisma.$transaction(async (tx) => {
        const publication = await tx.publication.findFirst({
          where: {
            id: input.publicationId,
            organizationId: input.organizationId,
            brandId: input.brandId,
          },
          select: { id: true },
        });
        if (!publication) return null;

        // Serialize attempt numbering and same-key acquisition per publication.
        // The row lock is intentionally held only while persisting the intent,
        // never during the external provider call.
        await tx.$queryRaw`SELECT 1 FROM "publication" WHERE "id" = ${input.publicationId}::uuid FOR UPDATE`;
        const existing = await tx.publicationAttempt.findUnique({
          where: {
            publicationId_idempotencyKey: {
              publicationId: input.publicationId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existing) return { attempt: existing, created: false };

        const latest = await tx.publicationAttempt.findFirst({
          where: { publicationId: input.publicationId },
          orderBy: { attempt: 'desc' },
          select: { attempt: true },
        });
        const attempt = await tx.publicationAttempt.create({
          data: {
            publicationId: input.publicationId,
            attempt: (latest?.attempt ?? 0) + 1,
            idempotencyKey: input.idempotencyKey,
            providerOperation: input.providerOperation,
            requestFingerprint: input.requestFingerprint,
          },
        });
        return { attempt, created: true };
      });
    },
    updateAttempt(input: {
      organizationId: string;
      brandId: string;
      publicationId: string;
      id: string;
      status: PublicationAttemptStatus;
      providerOperation?: string;
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
          ...(input.providerOperation !== undefined
            ? { providerOperation: input.providerOperation }
            : {}),
          ...(input.providerJobId !== undefined ? { providerJobId: input.providerJobId } : {}),
          ...(input.response !== undefined ? { response: input.response } : {}),
          ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
          ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
          finishedAt: new Date(),
        },
      });
    },
  };
}
