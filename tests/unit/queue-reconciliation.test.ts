import { describe, expect, it } from 'vitest';
import { reconcileQueuedWorkflowRuns } from '../../apps/worker/src/queue-reconciliation.js';

describe('queued workflow reconciliation', () => {
  it('re-enqueues every durable queued run with a singleton key', async () => {
    const sent: unknown[][] = [];
    const result = await reconcileQueuedWorkflowRuns(
      {
        findQueued: async () => [
          { id: 'a', organizationId: 'org-a' },
          { id: 'b', organizationId: 'org-b' },
        ],
      } as never,
      {
        send: async (...args: unknown[]) => {
          sent.push(args);
        },
      } as never,
    );
    expect(result).toEqual({ requeued: 2 });
    expect(sent).toEqual(
      expect.arrayContaining([
        ['workflow.run', { workflowRunId: 'a', organizationId: 'org-a' }, { singletonKey: 'a' }],
        ['workflow.run', { workflowRunId: 'b', organizationId: 'org-b' }, { singletonKey: 'b' }],
      ]),
    );
  });
});
