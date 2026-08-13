import {
  createPublishingRepository,
  createWorkflowRunRepository,
  type PublicationStatus,
} from '@ams-content-factory/db';
import { createPublishingService } from './publishing';
import { publicationDispatchWorkflowType } from './publication-dispatch-scheduler';

type PublishingRepository = ReturnType<typeof createPublishingRepository>;
type WorkflowRun = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createWorkflowRunRepository>['find']>>
>;
type PublishingService = ReturnType<typeof createPublishingService>;

export class PublicationDispatchPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicationDispatchPayloadError';
  }
}

function publicationIdFromPayload(payload: unknown) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    typeof (payload as { publicationId?: unknown }).publicationId !== 'string'
  ) {
    throw new PublicationDispatchPayloadError('Publication dispatch workflow payload is invalid.');
  }
  return (payload as { publicationId: string }).publicationId;
}

function skipped(publicationId: string, status: PublicationStatus | 'MISSING', reason: string) {
  return { outcome: 'SKIPPED' as const, publicationId, status, reason };
}

/**
 * A worker-only application service. Workflow scope is read from its durable DB
 * record, not trusted from the broker payload. The repository claim is the point
 * where cancellation/rescheduling races are resolved before an external mutation.
 */
export function createPublicationDispatchService(options: {
  publishingRepository?: PublishingRepository;
  publishingService: Pick<PublishingService, 'publishFromWorker'>;
  now?: () => Date;
}) {
  const publishingRepository = options.publishingRepository ?? createPublishingRepository();
  const now = options.now ?? (() => new Date());

  return {
    async dispatch(run: WorkflowRun) {
      if (run.type !== publicationDispatchWorkflowType || !run.brandId) {
        throw new PublicationDispatchPayloadError(
          'Workflow is not a brand-scoped publication dispatch.',
        );
      }
      const publicationId = publicationIdFromPayload(run.payload);
      const publication = await publishingRepository.findPublication({
        organizationId: run.organizationId,
        brandId: run.brandId,
        id: publicationId,
      });
      if (!publication)
        return skipped(publicationId, 'MISSING', 'PUBLICATION_OUTSIDE_WORKFLOW_SCOPE');
      if (publication.status !== 'QUEUED') {
        return skipped(publicationId, publication.status, 'PUBLICATION_NOT_QUEUED');
      }
      const claimed = await publishingRepository.claimDuePublicationForDispatch({
        organizationId: run.organizationId,
        brandId: run.brandId,
        id: publicationId,
        now: now(),
      });
      if (claimed.count !== 1) {
        const current = await publishingRepository.findPublication({
          organizationId: run.organizationId,
          brandId: run.brandId,
          id: publicationId,
        });
        return skipped(
          publicationId,
          current?.status ?? 'MISSING',
          'PUBLICATION_NOT_DUE_OR_CONFLICTED',
        );
      }
      const result = await options.publishingService.publishFromWorker({
        organizationId: run.organizationId,
        brandId: run.brandId,
        id: publicationId,
        idempotencyKey: run.idempotencyKey,
      });
      return { outcome: 'DISPATCHED' as const, publicationId, status: result.status };
    },
  };
}
