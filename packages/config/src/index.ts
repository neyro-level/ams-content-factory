export type HealthCheckKind = 'live' | 'ready';

export { assertRuntimeEnvironment, EnvironmentValidationError, readRuntimeConfig } from './env';
export type { RuntimeConfig, RuntimeNodeEnv } from './env';

export interface HealthPayload {
  readonly ok: boolean;
  readonly service: 'ams-content-factory';
  readonly check: HealthCheckKind;
  readonly timestamp: string;
}

export function buildHealthPayload(
  check: HealthCheckKind,
  now = new Date(),
  ok = true,
): HealthPayload {
  return {
    ok,
    service: 'ams-content-factory',
    check,
    timestamp: now.toISOString(),
  };
}
