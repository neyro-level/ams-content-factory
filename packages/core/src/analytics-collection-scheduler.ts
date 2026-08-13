import { createPublishingRepository, createWorkflowRunRepository } from '@ams-content-factory/db';
import { defaultAnalyticsSnapshotDelaysHours } from './analytics';

type PublishingRepository = ReturnType<typeof createPublishingRepository>;
type WorkflowRepository = ReturnType<typeof createWorkflowRunRepository>;

export const analyticsCollectWorkflowType = 'analytics.collect';

function captureTimes(publishedAt: Date, delaysHours: readonly number[]) {
  return [...new Set(delaysHours)]
    .sort((first, second) => first - second)
    .map((hours) => new Date(publishedAt.getTime() + hours * 3_600_000));
}

/**
 * Persists future collection intentions, but never invokes a provider or sends a
 * queue job ahead of its scheduled time. W14.4 owns actual worker dispatch.
 */
export function createAnalyticsCollectionScheduler(
  options: {
    publishingRepository?: PublishingRepository;
    workflowRepository?: WorkflowRepository;
    delaysHours?: readonly number[];
  } = {},
) {
  const publishing = options.publishingRepository ?? createPublishingRepository();
  const workflows = options.workflowRepository ?? createWorkflowRunRepository();
  const delaysHours = options.delaysHours ?? defaultAnalyticsSnapshotDelaysHours;
  if (!delaysHours.length || delaysHours.some((hours) => !Number.isInteger(hours) || hours <= 0)) {
    throw new Error('Analytics snapshot delays must be positive whole hours.');
  }

  return {
    async schedulePublication(input: {
      organizationId: string;
      brandId: string;
      publicationId: string;
    }) {
      const publication = await publishing.findPublication({
        organizationId: input.organizationId,
        brandId: input.brandId,
        id: input.publicationId,
      });
      if (!publication || publication.status !== 'PUBLISHED' || !publication.publishedAt) {
        throw new Error(
          'Only a published active-brand publication can schedule analytics collection.',
        );
      }
      const workflowsCreated = await Promise.all(
        captureTimes(publication.publishedAt, delaysHours).map(async (capturedAt) => {
          const capturedAtIso = capturedAt.toISOString();
          return workflows.createOrGet({
            organizationId: publication.organizationId,
            brandId: publication.brandId,
            type: analyticsCollectWorkflowType,
            idempotencyKey: `analytics-collect:${publication.id}:${capturedAtIso}`,
            scheduledFor: capturedAt,
            payload: { publicationId: publication.id, capturedAt: capturedAtIso },
          });
        }),
      );
      return workflowsCreated;
    },
  };
}
