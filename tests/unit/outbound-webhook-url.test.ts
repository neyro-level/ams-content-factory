import { describe, expect, it } from 'vitest';
import {
  OutboundWebhookUrlError,
  validateOutboundWebhookUrl,
} from '../../packages/core/src/index.js';

describe('outbound webhook URL guard', () => {
  it('requires HTTPS before any outbound URL resolution', async () => {
    await expect(
      validateOutboundWebhookUrl('http://public.example.test/hook'),
    ).rejects.toBeInstanceOf(OutboundWebhookUrlError);
  });

  it('converts unsafe resolver results into a safe configuration error', async () => {
    await expect(
      validateOutboundWebhookUrl('https://private.example.test/hook', async () =>
        Promise.reject(new Error('private network')),
      ),
    ).rejects.toMatchObject<OutboundWebhookUrlError>({
      message: 'Webhook endpoint URL is not a safe public target.',
    });
  });

  it('persists only a validated normalized public HTTPS URL', async () => {
    await expect(
      validateOutboundWebhookUrl('https://hooks.example.test/path', async (url) => url),
    ).resolves.toBe('https://hooks.example.test/path');
  });
});
