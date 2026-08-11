import { GET as live } from '../../apps/web/app/api/health/live/route.js';
import { GET as ready } from '../../apps/web/app/api/health/ready/route.js';
import { describe, expect, it } from 'vitest';

describe('health routes', () => {
  it('exposes live and ready JSON contracts', async () => {
    const [liveResponse, readyResponse] = await Promise.all([live(), ready()]);

    expect(liveResponse.status).toBe(200);
    expect(readyResponse.status).toBe(200);
    await expect(liveResponse.json()).resolves.toMatchObject({ check: 'live', ok: true });
    await expect(readyResponse.json()).resolves.toMatchObject({ check: 'ready', ok: true });
  });
});
