import { jobNames } from '@ams-content-factory/jobs';

export type WorkerReadinessSignal = {
  event: 'worker.ready';
  ready: true;
  timestamp: string;
  registeredQueues: readonly string[];
  requeuedWorkflowRuns: number;
};

/**
 * A process-level signal for a supervisor. It is emitted only after worker
 * startup has completed; W18 will attach this state to a real health probe.
 */
export function createWorkerReadinessSignal(requeuedWorkflowRuns: number): WorkerReadinessSignal {
  return {
    event: 'worker.ready',
    ready: true,
    timestamp: new Date().toISOString(),
    registeredQueues: [jobNames.health, jobNames.workflowRun, jobNames.publicationDispatch],
    requeuedWorkflowRuns,
  };
}

export function reportWorkerReadiness(
  signal: WorkerReadinessSignal,
  report: (message: string) => void = console.info,
) {
  report(JSON.stringify(signal));
}
