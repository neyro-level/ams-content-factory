import { buildHealthPayload } from '../../packages/config/src/index.js';
import { checkApplicationReadiness } from '../../packages/core/src/health.js';
import { describe, expect, it } from 'vitest';

describe('health payload', () => {
  it('returns the stable live contract', () => {
    expect(buildHealthPayload('live', new Date('2026-08-11T00:00:00.000Z'))).toEqual({
      ok: true,
      service: 'ams-content-factory',
      check: 'live',
      timestamp: '2026-08-11T00:00:00.000Z',
    });
  });

  it('returns not ready when the database repository fails', async () => {
    await expect(
      checkApplicationReadiness({
        isReady: async () => Promise.reject(new Error('database unavailable')),
      }),
    ).resolves.toMatchObject({ check: 'ready', ok: false });
  });

  it('returns not ready when runtime configuration is invalid', async () => {
    await expect(
      checkApplicationReadiness({ isReady: async () => undefined }, () => {
        throw new Error('invalid configuration');
      }),
    ).resolves.toMatchObject({ check: 'ready', ok: false });
  });
});
