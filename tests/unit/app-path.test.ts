import { describe, expect, it } from 'vitest';
import { getSafeAppPath } from '../../apps/web/lib/app-path.js';

describe('application redirect paths', () => {
  it('keeps only local application destinations', () => {
    expect(getSafeAppPath('/app')).toBe('/app');
    expect(getSafeAppPath('/app/brands')).toBe('/app/brands');
    expect(getSafeAppPath('https://example.com')).toBe('/app');
    expect(getSafeAppPath('//example.com')).toBe('/app');
    expect(getSafeAppPath('/login')).toBe('/app');
  });
});
