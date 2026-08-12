import { MockPublishingProvider, type PublishInput } from '../../packages/providers/src/index.js';
import {
  CountingPublishingProvider,
  createFailingRepository,
  DelayedPublishingProvider,
  FailingPublishingProvider,
  FailingStorageProvider,
  HarnessFailureError,
  ProviderTimeoutError,
  SimulatedWorkerCrashError,
  simulateWorkerCrash,
  withProviderTimeout,
} from '../helpers/failure-harness.js';
import { describe, expect, it } from 'vitest';

const publicationInput: PublishInput = {
  idempotencyKey: 'failure-harness-publication',
  externalAccountId: 'failure-harness-account',
  credentials: { accessToken: 'test-token' },
  text: 'Failure harness publication',
  mediaKeys: [],
};

describe('concurrency and failure harness', () => {
  it('provides failing storage and provider adapters without external credentials', async () => {
    const storage = new FailingStorageProvider();
    const provider = new FailingPublishingProvider();

    await expect(
      storage.put({
        key: 'failure-harness/object.txt',
        content: new TextEncoder().encode('object'),
        contentType: 'text/plain',
      }),
    ).rejects.toBeInstanceOf(HarnessFailureError);
    await expect(provider.publish(publicationInput)).rejects.toBeInstanceOf(HarnessFailureError);
  });

  it('makes duplicate and parallel provider requests observable', async () => {
    const provider = new CountingPublishingProvider(new MockPublishingProvider('VK'));

    const [first, duplicate] = await Promise.all([
      provider.publish(publicationInput),
      provider.publish(publicationInput),
    ]);

    expect(first.externalPostId).toBe(duplicate.externalPostId);
    expect(provider.publishCalls).toBe(2);
  });

  it('models provider success followed by repository failure', async () => {
    const provider = new CountingPublishingProvider(new MockPublishingProvider('VK'));
    const result = await provider.publish(publicationInput);
    const repository = createFailingRepository({
      async save(_result: typeof result) {
        return undefined;
      },
    });

    await expect(repository.save(result)).rejects.toBeInstanceOf(HarnessFailureError);
    expect(provider.publishCalls).toBe(1);
  });

  it('models a delayed provider timeout without waiting for a real API', async () => {
    const provider = new DelayedPublishingProvider(new MockPublishingProvider('VK'), 25);

    await expect(withProviderTimeout(provider.publish(publicationInput), 1)).rejects.toBeInstanceOf(
      ProviderTimeoutError,
    );
  });

  it('models a worker crash before and after handler execution', async () => {
    let handlerCalls = 0;
    const handler = async () => {
      handlerCalls += 1;
      return { handled: true };
    };

    await expect(simulateWorkerCrash('before', handler)).rejects.toBeInstanceOf(
      SimulatedWorkerCrashError,
    );
    expect(handlerCalls).toBe(0);
    await expect(simulateWorkerCrash('after', handler)).rejects.toBeInstanceOf(
      SimulatedWorkerCrashError,
    );
    expect(handlerCalls).toBe(1);
  });
});
