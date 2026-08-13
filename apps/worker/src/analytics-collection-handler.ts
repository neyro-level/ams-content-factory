import {
  analyticsCollectWorkflowType,
  createAnalyticsService,
  createTokenEncryptor,
} from '@ams-content-factory/core';
import {
  InstagramAnalyticsProvider,
  InstagramAnalyticsRuntimeClient,
  UnavailableAnalyticsProvider,
  VkAnalyticsProvider,
  VkAnalyticsRuntimeClient,
  type AnalyticsProvider,
} from '@ams-content-factory/providers';
import type { createWorkflowRunRepository } from '@ams-content-factory/db';

type WorkflowRun = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createWorkflowRunRepository>['find']>>
>;
type AnalyticsService = ReturnType<typeof createAnalyticsService>;

class InvalidAnalyticsCollectWorkflowPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAnalyticsCollectWorkflowPayloadError';
  }
}

function configuredProvider(
  platform: 'VK' | 'INSTAGRAM',
  create: () => AnalyticsProvider,
): AnalyticsProvider {
  try {
    return create();
  } catch (error) {
    return new UnavailableAnalyticsProvider(
      platform,
      error instanceof Error ? error.message : 'runtime configuration is missing.',
    );
  }
}

function createProductionAnalyticsProviders(): Record<'VK' | 'INSTAGRAM', AnalyticsProvider> {
  return {
    VK: configuredProvider('VK', () => new VkAnalyticsProvider(new VkAnalyticsRuntimeClient())),
    INSTAGRAM: configuredProvider(
      'INSTAGRAM',
      () => new InstagramAnalyticsProvider(new InstagramAnalyticsRuntimeClient()),
    ),
  };
}

function parsePayload(run: WorkflowRun, now: Date) {
  if (run.type !== analyticsCollectWorkflowType) {
    throw new InvalidAnalyticsCollectWorkflowPayloadError(
      `Expected ${analyticsCollectWorkflowType} workflow, received ${run.type}.`,
    );
  }
  if (!run.brandId) {
    throw new InvalidAnalyticsCollectWorkflowPayloadError(
      'Analytics collection workflow requires a brand scope.',
    );
  }
  if (!run.payload || typeof run.payload !== 'object' || Array.isArray(run.payload)) {
    throw new InvalidAnalyticsCollectWorkflowPayloadError(
      'Analytics collection workflow payload is required.',
    );
  }
  const payload = run.payload as { publicationId?: unknown; capturedAt?: unknown };
  if (typeof payload.publicationId !== 'string' || !payload.publicationId) {
    throw new InvalidAnalyticsCollectWorkflowPayloadError(
      'Analytics collection workflow payload requires publicationId.',
    );
  }
  if (typeof payload.capturedAt !== 'string') {
    throw new InvalidAnalyticsCollectWorkflowPayloadError(
      'Analytics collection workflow payload requires capturedAt.',
    );
  }
  const capturedAt = new Date(payload.capturedAt);
  if (Number.isNaN(capturedAt.getTime())) {
    throw new InvalidAnalyticsCollectWorkflowPayloadError(
      'Analytics collection workflow capturedAt must be a valid date.',
    );
  }
  if (run.scheduledFor && run.scheduledFor > now) {
    throw new InvalidAnalyticsCollectWorkflowPayloadError(
      'Analytics collection workflow is not due yet.',
    );
  }
  return { brandId: run.brandId, publicationId: payload.publicationId, capturedAt };
}

/**
 * The worker owns the system actor; the core service still enforces the concrete
 * organization, brand and publication relation before decrypting a credential or
 * calling an analytics provider.
 */
export function createAnalyticsCollectionHandler(
  analytics: Pick<AnalyticsService, 'collect'>,
  now: () => Date = () => new Date(),
) {
  return async (run: WorkflowRun) => {
    const payload = parsePayload(run, now());
    const snapshot = await analytics.collect(
      {
        organizationId: run.organizationId,
        brandId: payload.brandId,
        permissions: new Set(['content:write']),
      },
      { publicationId: payload.publicationId, capturedAt: payload.capturedAt },
    );
    return {
      outcome: 'COLLECTED',
      snapshotId: snapshot.id,
      publicationId: snapshot.publicationId,
      capturedAt: snapshot.capturedAt.toISOString(),
    };
  };
}

export function createProductionAnalyticsCollectionHandler() {
  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required for analytics collection.');
  }
  const analytics = createAnalyticsService({
    encryptor: createTokenEncryptor(encryptionKey),
    providers: createProductionAnalyticsProviders(),
    learningProvider: {
      async analyze() {
        throw new Error('BLOCKED_EXTERNAL: analytics learning provider is not configured.');
      },
    },
  });
  return createAnalyticsCollectionHandler(analytics);
}
