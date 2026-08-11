export type HealthCheckKind = 'live' | 'ready';

export interface HealthPayload {
  readonly ok: boolean;
  readonly service: 'ams-content-factory';
  readonly check: HealthCheckKind;
  readonly timestamp: string;
}

export function buildHealthPayload(check: HealthCheckKind, now = new Date()): HealthPayload {
  return {
    ok: true,
    service: 'ams-content-factory',
    check,
    timestamp: now.toISOString(),
  };
}
