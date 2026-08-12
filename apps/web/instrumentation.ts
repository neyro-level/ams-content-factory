import { assertRuntimeEnvironment } from '@ams-content-factory/config';

export async function register() {
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  assertRuntimeEnvironment();
}
