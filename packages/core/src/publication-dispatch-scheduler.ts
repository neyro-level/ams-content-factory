import { createPublishingRepository, createWorkflowRunRepository } from '@ams-content-factory/db';
import { getManagedJobQueue, jobNames } from '@ams-content-factory/jobs';

type PublishingRepository = ReturnType<typeof createPublishingRepository>;
type WorkflowRepository = ReturnType<typeof createWorkflowRunRepository>;
type Queue = {
  send: (name: string, data: object, options: { singletonKey: string }) => Promise<unknown>;
};

export const publicationDispatchWorkflowType = 'publication.dispatch';

export function createPublicationDispatchScheduler(
  options: {
    publishingRepository?: PublishingRepository;
    workflowRepository?: WorkflowRepository;
    getQueue?: () => Promise<Queue>;
    now?: () => Date;
    batchSize?: number;
  } = {},
) {
  const publishing = options.publishingRepository ?? createPublishingRepository();
  const workflows = options.workflowRepository ?? createWorkflowRunRepository();
  const getQueue = options.getQueue ?? (() => getManagedJobQueue());
  const now = options.now ?? (() => new Date());
  const batchSize = options.batchSize ?? 100;

  return {
    async enqueueDue() {
      const publications = await publishing.listDueQueuedPublications({
        now: now(),
        take: batchSize,
      });
      const queue = await getQueue();
      const workflowsCreated = await Promise.all(
        publications.map(async (publication) => {
          const idempotencyKey = `publication-dispatch:${publication.id}`;
          const workflow = await workflows.createOrGet({
            organizationId: publication.organizationId,
            brandId: publication.brandId,
            type: publicationDispatchWorkflowType,
            idempotencyKey,
            payload: { publicationId: publication.id },
          });
          await queue.send(
            jobNames.publicationDispatch,
            {
              workflowRunId: workflow.id,
              organizationId: workflow.organizationId,
              publicationId: publication.id,
            },
            { singletonKey: workflow.id },
          );
          return workflow;
        }),
      );
      return {
        due: publications.length,
        enqueued: workflowsCreated.length,
        workflows: workflowsCreated,
      };
    },
  };
}
