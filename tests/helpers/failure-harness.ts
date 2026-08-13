import type {
  PublicationStatusResult,
  PublishInput,
  PublishResult,
  PublicationStatusInput,
  PublishingPlatform,
  PublishingProvider,
  StorageProvider,
  StorageWriteInput,
  StoredObject,
} from '../../packages/providers/src/index.js';

export class HarnessFailureError extends Error {
  public constructor(message = 'Simulated dependency failure.') {
    super(message);
    this.name = 'HarnessFailureError';
  }
}

export class ProviderTimeoutError extends Error {
  public constructor(timeoutMs: number) {
    super(`Provider operation exceeded ${timeoutMs}ms.`);
    this.name = 'ProviderTimeoutError';
  }
}

export class SimulatedWorkerCrashError extends Error {
  public constructor(stage: 'before' | 'after') {
    super(`Simulated worker crash ${stage} handler execution.`);
    this.name = 'SimulatedWorkerCrashError';
  }
}

/**
 * Wraps a repository-shaped dependency so tests can exercise the point after an
 * external side effect has completed but before persistence succeeds.
 */
export function createFailingRepository<T extends object>(
  target: T,
  error = new HarnessFailureError(),
): T {
  return new Proxy(target, {
    get(original, property, receiver) {
      const value = Reflect.get(original, property, receiver);
      if (typeof value !== 'function') return value;
      return async () => {
        throw error;
      };
    },
  });
}

export class FailingStorageProvider implements StorageProvider {
  public constructor(
    private readonly error = new HarnessFailureError('Simulated storage failure.'),
  ) {}

  async put(_input: StorageWriteInput): Promise<StoredObject> {
    throw this.error;
  }

  async get(_key: string): Promise<Uint8Array | null> {
    throw this.error;
  }

  async delete(_key: string): Promise<void> {
    throw this.error;
  }

  async getSignedDownloadUrl(_key: string, _expiresInSeconds: number): Promise<string | null> {
    throw this.error;
  }
}

export class FailingPublishingProvider implements PublishingProvider {
  public constructor(
    public readonly platform: PublishingPlatform = 'VK',
    private readonly error = new HarnessFailureError('Simulated provider failure.'),
  ) {}

  async publish(_input: PublishInput): Promise<PublishResult> {
    throw this.error;
  }

  async getStatus(_input: PublicationStatusInput): Promise<PublicationStatusResult> {
    throw this.error;
  }
}

export class DelayedPublishingProvider implements PublishingProvider {
  public readonly platform: PublishingPlatform;

  public constructor(
    private readonly delegate: PublishingProvider,
    private readonly delayMs: number,
  ) {
    if (!Number.isInteger(delayMs) || delayMs < 0) {
      throw new Error('Delay must be a non-negative integer.');
    }
    this.platform = delegate.platform;
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    await delay(this.delayMs);
    return this.delegate.publish(input);
  }

  async getStatus(input: PublicationStatusInput): Promise<PublicationStatusResult> {
    await delay(this.delayMs);
    return this.delegate.getStatus(input);
  }
}

export class CountingPublishingProvider implements PublishingProvider {
  public readonly platform: PublishingPlatform;
  public publishCalls = 0;
  public getStatusCalls = 0;

  public constructor(private readonly delegate: PublishingProvider) {
    this.platform = delegate.platform;
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    this.publishCalls += 1;
    return this.delegate.publish(input);
  }

  async getStatus(input: PublicationStatusInput): Promise<PublicationStatusResult> {
    this.getStatusCalls += 1;
    return this.delegate.getStatus(input);
  }
}

export async function withProviderTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Provider timeout must be a positive integer.');
  }
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProviderTimeoutError(timeoutMs)), timeoutMs);
    void operation.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function simulateWorkerCrash<T>(
  stage: 'before' | 'after',
  handler: () => Promise<T>,
): Promise<never> {
  if (stage === 'before') throw new SimulatedWorkerCrashError(stage);
  await handler();
  throw new SimulatedWorkerCrashError(stage);
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
