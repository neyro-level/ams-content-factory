import 'dotenv/config';
import { GET as live } from '../../apps/web/app/api/health/live/route.js';
import { GET as ready } from '../../apps/web/app/api/health/ready/route.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const runtimeKeys = ['BETTER_AUTH_SECRET', 'TOKEN_ENCRYPTION_KEY'] as const;
const originalEnvironment = new Map(runtimeKeys.map((key) => [key, process.env[key]]));

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = 'health-route-test-secret-with-at-least-32-characters';
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 91).toString('base64');
});

afterEach(() => {
  for (const key of runtimeKeys) {
    const value = originalEnvironment.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('health routes', () => {
  it('exposes live and ready JSON contracts', async () => {
    const [liveResponse, readyResponse] = await Promise.all([live(), ready()]);

    expect(liveResponse.status).toBe(200);
    expect(readyResponse.status).toBe(200);
    await expect(liveResponse.json()).resolves.toMatchObject({ check: 'live', ok: true });
    await expect(readyResponse.json()).resolves.toMatchObject({ check: 'ready', ok: true });
  });
});
