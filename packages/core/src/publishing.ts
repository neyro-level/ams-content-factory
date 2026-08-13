import { createHash } from 'node:crypto';
import {
  createPublishingRepository,
  createTenantRepository,
  type PrismaClient,
  type PublicationStatus,
  type SocialPlatform,
} from '@ams-content-factory/db';
import type { PublishingProvider } from '@ams-content-factory/providers';
import { AccessDeniedError, requirePermission, type Permission } from './tenant-context';
import { createTokenEncryptor, TokenEncryptionError } from './token-encryption';

type Context = {
  userId: string;
  organizationId: string;
  brandId?: string;
  permissions: Set<Permission>;
};
type Encryptor = ReturnType<typeof createTokenEncryptor>;
type PublishingRepository = ReturnType<typeof createPublishingRepository>;
type TenantRepository = ReturnType<typeof createTenantRepository>;

/**
 * Transitions that may be requested by normal application operations.
 *
 * PREPARING, UPLOADING, PROCESSING and READY_TO_FINALIZE are legacy states:
 * this service does not enter them until their corresponding durable steps
 * exist. They can only be recovered to QUEUED after an interrupted legacy run.
 * OUTCOME_UNKNOWN is deliberately excluded from ordinary transitions: only
 * provider reconciliation may decide whether it is published or retryable.
 */
export const publicationTransitions: Record<PublicationStatus, readonly PublicationStatus[]> = {
  DRAFT: ['QUEUED', 'CANCELLED'],
  QUEUED: ['PUBLISHING', 'CANCELLED'],
  PREPARING: ['QUEUED', 'FAILED', 'CANCELLED'],
  UPLOADING: ['QUEUED', 'FAILED', 'CANCELLED'],
  PROCESSING: ['QUEUED', 'FAILED', 'CANCELLED'],
  READY_TO_FINALIZE: ['QUEUED', 'FAILED', 'CANCELLED'],
  PUBLISHING: ['PUBLISHED', 'FAILED', 'OUTCOME_UNKNOWN'],
  PUBLISHED: [],
  FAILED: ['QUEUED', 'CANCELLED'],
  OUTCOME_UNKNOWN: [],
  CANCELLED: [],
};

const reconciliationTransitions: Partial<Record<PublicationStatus, readonly PublicationStatus[]>> =
  {
    OUTCOME_UNKNOWN: ['PUBLISHED', 'QUEUED'],
    PUBLISHING: ['PUBLISHED', 'QUEUED'],
  };

const legacyRecoveryStates: readonly PublicationStatus[] = [
  'PREPARING',
  'UPLOADING',
  'PROCESSING',
  'READY_TO_FINALIZE',
];

export class PublicationTransitionError extends Error {
  constructor(from: PublicationStatus, to: PublicationStatus) {
    super(`Invalid publication transition: ${from} -> ${to}`);
    this.name = 'PublicationTransitionError';
  }
}

export class PublicationTransitionConflictError extends Error {
  constructor() {
    super('Publication transition was rejected because its state changed concurrently.');
    this.name = 'PublicationTransitionConflictError';
  }
}

export class PublicationDispatchInProgressError extends Error {
  constructor() {
    super('Publication dispatch is already in progress for this idempotency key.');
    this.name = 'PublicationDispatchInProgressError';
  }
}

export class PublicationOutcomeUnknownError extends Error {
  constructor() {
    super('Publication outcome is unknown and requires provider investigation before retry.');
    this.name = 'PublicationOutcomeUnknownError';
  }
}

function scope(context: Context) {
  requirePermission(context, 'content:write');
  if (!context.brandId) throw new AccessDeniedError('Publishing requires a brand context.');
  return { organizationId: context.organizationId, brandId: context.brandId };
}

function fingerprint(input: { text: string; mediaKeys: string[]; accountId: string }) {
  return createHash('sha256')
    .update(
      JSON.stringify({ text: input.text, mediaKeys: input.mediaKeys, accountId: input.accountId }),
    )
    .digest('hex');
}

export function createPublishingService(options: {
  prisma?: PrismaClient;
  repository?: PublishingRepository;
  tenantRepository?: TenantRepository;
  encryptor: Encryptor;
  providers: Record<SocialPlatform, PublishingProvider>;
}) {
  const repository = options.repository ?? createPublishingRepository(options.prisma);
  const tenants = options.tenantRepository ?? createTenantRepository(options.prisma);
  const load = async (context: Context, id: string) => {
    const publication = await repository.findPublication({ ...scope(context), id });
    if (!publication) throw new AccessDeniedError('Publication is outside the active tenant.');
    return publication;
  };
  const transition = async (
    context: Context,
    id: string,
    from: PublicationStatus,
    to: PublicationStatus,
    fields: {
      externalPostId?: string;
      permalink?: string;
      lastAttemptId?: string;
      publishedAt?: Date;
    } = {},
    options: { reconciliation?: boolean } = {},
  ) => {
    const allowed = options.reconciliation
      ? (reconciliationTransitions[from] ?? [])
      : publicationTransitions[from];
    if (!allowed.includes(to)) {
      throw new PublicationTransitionError(from, to);
    }
    const result = await repository.updatePublication({
      ...scope(context),
      id,
      from,
      to,
      ...fields,
    });
    if (result.count !== 1) throw new PublicationTransitionConflictError();
  };
  const markOutcomeUnknown = async (context: Context, publicationId: string, attemptId: string) => {
    const publication = await load(context, publicationId);
    if (publication.status === 'PUBLISHED' || publication.status === 'OUTCOME_UNKNOWN') {
      return publication;
    }
    if (publication.status !== 'PUBLISHING') {
      throw new PublicationTransitionError(publication.status, 'OUTCOME_UNKNOWN');
    }
    await repository.updateAttempt({
      ...scope(context),
      publicationId,
      id: attemptId,
      status: 'OUTCOME_UNKNOWN',
    });
    await transition(context, publicationId, 'PUBLISHING', 'OUTCOME_UNKNOWN', {
      lastAttemptId: attemptId,
    });
    return load(context, publicationId);
  };

  const service = {
    async connectAccount(
      context: Context,
      input: {
        platform: SocialPlatform;
        externalAccountId: string;
        name: string;
        username?: string;
        scopes?: string[];
        accessToken: string;
        refreshToken?: string;
        expiresAt?: Date;
      },
    ) {
      const activeScope = scope(context);
      const account = await repository.createSocialAccount({ ...activeScope, ...input });
      if (!account) throw new AccessDeniedError('Social account is outside the active tenant.');
      const credential = await repository.upsertCredential({
        ...activeScope,
        socialAccountId: account.id,
        accessTokenCiphertext: options.encryptor.encrypt(input.accessToken),
        ...(input.refreshToken !== undefined
          ? { refreshTokenCiphertext: options.encryptor.encrypt(input.refreshToken) }
          : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
        encryptionVersion: options.encryptor.encryptionVersion,
      });
      if (!credential)
        throw new AccessDeniedError('Social credentials are outside the active tenant.');
      await tenants.appendAuditLog({
        organizationId: activeScope.organizationId,
        brandId: activeScope.brandId,
        actorUserId: context.userId,
        action: 'social.connect',
        entityType: 'SocialAccount',
        entityId: account.id,
        metadata: { platform: account.platform },
      });
      return account;
    },
    async disconnectAccount(context: Context, socialAccountId: string) {
      const activeScope = scope(context);
      const account = await repository.disconnectSocialAccount({
        ...activeScope,
        id: socialAccountId,
      });
      if (!account) throw new AccessDeniedError('Social account is outside the active tenant.');
      await tenants.appendAuditLog({
        organizationId: activeScope.organizationId,
        brandId: activeScope.brandId,
        actorUserId: context.userId,
        action: 'social.disconnect',
        entityType: 'SocialAccount',
        entityId: account.id,
        metadata: { platform: account.platform },
      });
      return account;
    },
    async create(
      context: Context,
      input: {
        contentProjectId: string;
        platformVariantId: string;
        socialAccountId: string;
      },
    ) {
      const publication = await repository.createPublication({ ...scope(context), ...input });
      if (!publication)
        throw new AccessDeniedError('Publication references are outside the active tenant.');
      return publication;
    },
    async schedule(context: Context, id: string, scheduledAt: Date) {
      const publication = await load(context, id);
      if (publication.status !== 'DRAFT') {
        throw new PublicationTransitionError(publication.status, 'QUEUED');
      }
      if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
        throw new Error('Publication schedule time must be in the future.');
      }
      const result = await repository.schedulePublication({ ...scope(context), id, scheduledAt });
      if (result.count !== 1) throw new PublicationTransitionConflictError();
      return load(context, id);
    },
    async recover(context: Context, id: string) {
      const publication = await load(context, id);
      if (!legacyRecoveryStates.includes(publication.status)) {
        throw new PublicationTransitionError(publication.status, 'QUEUED');
      }
      await transition(context, id, publication.status, 'QUEUED');
      return load(context, id);
    },
    async publish(
      context: Context,
      input: { id: string; idempotencyKey: string; text?: string; mediaKeys?: string[] },
    ) {
      let publication = await load(context, input.id);
      const priorAttempt = publication.attempts.find(
        (attempt) => attempt.idempotencyKey === input.idempotencyKey,
      );
      if (publication.status === 'PUBLISHED' && priorAttempt?.status === 'SUCCEEDED') {
        return publication;
      }
      if (publication.status === 'OUTCOME_UNKNOWN') throw new PublicationOutcomeUnknownError();
      if (publication.status === 'DRAFT') {
        await transition(context, publication.id, 'DRAFT', 'QUEUED');
        publication = await load(context, publication.id);
      }
      if (publication.status === 'QUEUED') {
        try {
          await transition(context, publication.id, 'QUEUED', 'PUBLISHING');
        } catch (error) {
          if (!(error instanceof PublicationTransitionConflictError)) throw error;
        }
        publication = await load(context, publication.id);
      }
      if (publication.status !== 'PUBLISHING') {
        throw new Error(`Publication cannot be dispatched from ${publication.status}.`);
      }
      const existing = publication.attempts.find(
        (attempt) => attempt.idempotencyKey === input.idempotencyKey,
      );
      if (existing?.status === 'OUTCOME_UNKNOWN') throw new PublicationOutcomeUnknownError();
      if (existing?.status === 'SUCCEEDED') return publication;
      const text =
        input.text ??
        publication.platformVariant.caption ??
        publication.platformVariant.description ??
        '';
      const mediaKeys = input.mediaKeys ?? [];
      const provider = options.providers[publication.socialAccount.platform];
      if (!provider || provider.platform !== publication.socialAccount.platform) {
        throw new Error(
          `No publishing provider is configured for ${publication.socialAccount.platform}.`,
        );
      }
      const credential = publication.socialAccount.credential;
      if (!credential)
        throw new Error('Social account credentials are required before publishing.');
      const attemptResult = existing
        ? { attempt: existing, created: false }
        : await repository.createOrGetAttempt({
            ...scope(context),
            publicationId: publication.id,
            idempotencyKey: input.idempotencyKey,
            providerOperation: `${provider.platform.toLowerCase()}:publish`,
            requestFingerprint: fingerprint({
              text,
              mediaKeys,
              accountId: publication.socialAccountId,
            }),
          });
      if (!attemptResult)
        throw new AccessDeniedError('Publication attempt is outside the active tenant.');
      const { attempt } = attemptResult;
      if (!attemptResult.created && attempt.status === 'STARTED') {
        throw new PublicationDispatchInProgressError();
      }
      if (!attemptResult.created && attempt.status === 'OUTCOME_UNKNOWN') {
        throw new PublicationOutcomeUnknownError();
      }
      if (!attemptResult.created && attempt.status === 'SUCCEEDED') {
        return load(context, publication.id);
      }
      let providerMutationCompleted = false;
      try {
        const result = await provider.publish({
          idempotencyKey: input.idempotencyKey,
          externalAccountId: publication.socialAccount.externalAccountId,
          credentials: {
            accessToken: options.encryptor.decrypt(credential.accessTokenCiphertext),
            ...(credential.refreshTokenCiphertext !== null
              ? { refreshToken: options.encryptor.decrypt(credential.refreshTokenCiphertext) }
              : {}),
            ...(credential.expiresAt !== null ? { expiresAt: credential.expiresAt } : {}),
          },
          text,
          mediaKeys,
        });
        providerMutationCompleted = true;
        if (result.status === 'OUTCOME_UNKNOWN') {
          await repository.updateAttempt({
            ...scope(context),
            publicationId: publication.id,
            id: attempt.id,
            status: 'OUTCOME_UNKNOWN',
            providerOperation: result.providerOperation,
            ...(result.providerJobId !== undefined ? { providerJobId: result.providerJobId } : {}),
            ...(result.response !== undefined ? { response: result.response } : {}),
          });
          await transition(context, publication.id, 'PUBLISHING', 'OUTCOME_UNKNOWN', {
            lastAttemptId: attempt.id,
          });
          throw new PublicationOutcomeUnknownError();
        }
        await repository.updateAttempt({
          ...scope(context),
          publicationId: publication.id,
          id: attempt.id,
          status: 'SUCCEEDED',
          providerOperation: result.providerOperation,
          ...(result.providerJobId !== undefined ? { providerJobId: result.providerJobId } : {}),
          ...(result.response !== undefined ? { response: result.response } : {}),
        });
        await transition(context, publication.id, 'PUBLISHING', 'PUBLISHED', {
          lastAttemptId: attempt.id,
          ...(result.externalPostId !== undefined ? { externalPostId: result.externalPostId } : {}),
          ...(result.permalink !== undefined ? { permalink: result.permalink } : {}),
          publishedAt: new Date(),
        });
        await tenants.appendAuditLog({
          organizationId: context.organizationId,
          brandId: scope(context).brandId,
          ...(context.userId.startsWith('system:') ? {} : { actorUserId: context.userId }),
          action: 'publication.dispatch',
          entityType: 'Publication',
          entityId: publication.id,
          metadata: { provider: provider.platform, attemptId: attempt.id },
        });
        return load(context, publication.id);
      } catch (error) {
        if (error instanceof PublicationOutcomeUnknownError) throw error;
        if (providerMutationCompleted) {
          try {
            await markOutcomeUnknown(context, publication.id, attempt.id);
          } catch {
            // A persistence outage may prevent recording the uncertainty. Never
            // convert a completed external mutation into FAILED or retry it.
          }
          throw new PublicationOutcomeUnknownError();
        }
        const message = error instanceof Error ? error.message : 'Provider publishing failed.';
        await repository.updateAttempt({
          ...scope(context),
          publicationId: publication.id,
          id: attempt.id,
          status: 'FAILED',
          errorCode:
            error instanceof TokenEncryptionError
              ? 'TOKEN_DECRYPT_FAILED'
              : 'PROVIDER_PUBLISH_FAILED',
          errorMessage: message,
        });
        await transition(context, publication.id, 'PUBLISHING', 'FAILED', {
          lastAttemptId: attempt.id,
        });
        throw error;
      }
    },
    /**
     * Only a trusted worker may call this after it atomically claims a durable
     * publication workflow. Tenant/user context never comes from a queue payload.
     */
    async publishFromWorker(input: {
      organizationId: string;
      brandId: string;
      id: string;
      idempotencyKey: string;
    }) {
      return service.publish(
        {
          userId: 'system:publication-dispatch',
          organizationId: input.organizationId,
          brandId: input.brandId,
          permissions: new Set<Permission>(['content:write']),
        },
        { id: input.id, idempotencyKey: input.idempotencyKey },
      );
    },
    async investigate(context: Context, id: string) {
      const publication = await load(context, id);
      if (publication.status !== 'OUTCOME_UNKNOWN' && publication.status !== 'PUBLISHING') {
        throw new Error('Only uncertain publications can be investigated.');
      }
      const attempt =
        publication.attempts.find((item) => item.id === publication.lastAttemptId) ??
        publication.attempts.find(
          (item) => item.status === 'STARTED' || item.status === 'OUTCOME_UNKNOWN',
        );
      if (!attempt) throw new Error('Unknown publication has no recorded attempt.');
      const provider = options.providers[publication.socialAccount.platform];
      if (!provider)
        throw new Error(
          `No publishing provider is configured for ${publication.socialAccount.platform}.`,
        );
      const credential = publication.socialAccount.credential;
      if (!credential)
        throw new Error('Social account credentials are required before investigation.');
      const status = await provider.getStatus({
        providerOperation: attempt.providerOperation,
        ...(attempt.providerJobId !== null ? { providerJobId: attempt.providerJobId } : {}),
        credentials: {
          accessToken: options.encryptor.decrypt(credential.accessTokenCiphertext),
          ...(credential.refreshTokenCiphertext !== null
            ? { refreshToken: options.encryptor.decrypt(credential.refreshTokenCiphertext) }
            : {}),
          ...(credential.expiresAt !== null ? { expiresAt: credential.expiresAt } : {}),
        },
      });
      if (status.status === 'PUBLISHED') {
        await repository.updateAttempt({
          ...scope(context),
          publicationId: publication.id,
          id: attempt.id,
          status: 'SUCCEEDED',
          ...(status.response !== undefined ? { response: status.response } : {}),
        });
        await transition(
          context,
          publication.id,
          publication.status,
          'PUBLISHED',
          {
            ...(status.externalPostId !== undefined
              ? { externalPostId: status.externalPostId }
              : {}),
            ...(status.permalink !== undefined ? { permalink: status.permalink } : {}),
            publishedAt: new Date(),
          },
          { reconciliation: true },
        );
      } else if (status.status === 'NOT_FOUND') {
        await repository.updateAttempt({
          ...scope(context),
          publicationId: publication.id,
          id: attempt.id,
          status: 'FAILED',
          errorCode: 'PROVIDER_RESULT_NOT_FOUND',
          errorMessage: 'Provider reconciliation confirmed no external post.',
        });
        await transition(
          context,
          publication.id,
          publication.status,
          'QUEUED',
          {},
          {
            reconciliation: true,
          },
        );
      }
      await tenants.appendAuditLog({
        organizationId: context.organizationId,
        brandId: scope(context).brandId,
        ...(context.userId.startsWith('system:') ? {} : { actorUserId: context.userId }),
        action: 'publication.reconcile',
        entityType: 'Publication',
        entityId: publication.id,
        metadata: { provider: provider.platform, attemptId: attempt.id, outcome: status.status },
      });
      return load(context, publication.id);
    },
  };
  return service;
}
