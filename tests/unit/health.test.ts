import { buildHealthPayload } from '../../packages/config/src/index.js';
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
});
