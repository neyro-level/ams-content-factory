import {
  assertRuntimeEnvironment,
  buildHealthPayload,
  type HealthPayload,
} from '@ams-content-factory/config';
import { createHealthRepository, type HealthRepository } from '@ams-content-factory/db';

export async function checkApplicationReadiness(
  repository: HealthRepository = createHealthRepository(),
  assertEnvironment: () => unknown = assertRuntimeEnvironment,
): Promise<HealthPayload> {
  try {
    assertEnvironment();
    await repository.isReady();
    return buildHealthPayload('ready');
  } catch {
    return buildHealthPayload('ready', new Date(), false);
  }
}
