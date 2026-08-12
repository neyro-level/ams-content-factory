import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export type StorageWriteInput = {
  key: string;
  content: Uint8Array;
  contentType: string;
};

export type StoredObject = {
  key: string;
  sizeBytes: number;
  contentType: string;
};

export interface StorageProvider {
  put(input: StorageWriteInput): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  getSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string | null>;
}

function assertSafeStorageKey(key: string) {
  if (!key || isAbsolute(key) || key.includes('\\')) {
    throw new Error('Storage key must be a non-empty relative POSIX path.');
  }
  const segments = key.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Storage key contains an unsafe path segment.');
  }
}

/** Local, private object storage for development and test environments. */
export class LocalStorageProvider implements StorageProvider {
  public constructor(private readonly baseDirectory: string) {}

  private resolveKey(key: string) {
    assertSafeStorageKey(key);
    const root = resolve(this.baseDirectory);
    const candidate = resolve(root, ...key.split('/'));
    if (relative(root, candidate).startsWith('..')) {
      throw new Error('Storage key resolves outside the configured storage directory.');
    }
    return candidate;
  }

  async put(input: StorageWriteInput): Promise<StoredObject> {
    const target = this.resolveKey(input.key);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, input.content, { flag: 'wx' });
    return { key: input.key, sizeBytes: input.content.byteLength, contentType: input.contentType };
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.resolveKey(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const target = this.resolveKey(key);
    try {
      const { unlink } = await import('node:fs/promises');
      await unlink(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string | null> {
    this.resolveKey(key);
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0) {
      throw new Error('Signed URL expiry must be a positive integer.');
    }
    return null;
  }
}

export interface S3ObjectClient {
  putObject(input: StorageWriteInput): Promise<void>;
  getObject(key: string): Promise<Uint8Array | null>;
  deleteObject(key: string): Promise<void>;
  getSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
}

/** Adapter boundary for a private S3-compatible bucket; SDK credentials stay outside the domain. */
export class S3StorageProvider implements StorageProvider {
  public constructor(private readonly client: S3ObjectClient) {}

  async put(input: StorageWriteInput): Promise<StoredObject> {
    assertSafeStorageKey(input.key);
    await this.client.putObject(input);
    return { key: input.key, sizeBytes: input.content.byteLength, contentType: input.contentType };
  }

  get(key: string) {
    assertSafeStorageKey(key);
    return this.client.getObject(key);
  }

  delete(key: string) {
    assertSafeStorageKey(key);
    return this.client.deleteObject(key);
  }

  getSignedDownloadUrl(key: string, expiresInSeconds: number) {
    assertSafeStorageKey(key);
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0) {
      throw new Error('Signed URL expiry must be a positive integer.');
    }
    return this.client.getSignedDownloadUrl(key, expiresInSeconds);
  }
}

/** Deterministic private provider for tests and absent external storage credentials. */
export class MockStorageProvider implements StorageProvider {
  private readonly objects = new Map<string, Uint8Array>();

  async put(input: StorageWriteInput): Promise<StoredObject> {
    assertSafeStorageKey(input.key);
    if (this.objects.has(input.key)) throw new Error(`Object already exists: ${input.key}`);
    this.objects.set(input.key, input.content.slice());
    return { key: input.key, sizeBytes: input.content.byteLength, contentType: input.contentType };
  }

  async get(key: string): Promise<Uint8Array | null> {
    assertSafeStorageKey(key);
    const content = this.objects.get(key);
    return content?.slice() ?? null;
  }

  async delete(key: string): Promise<void> {
    assertSafeStorageKey(key);
    this.objects.delete(key);
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string | null> {
    assertSafeStorageKey(key);
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0) {
      throw new Error('Signed URL expiry must be a positive integer.');
    }
    return `mock-storage://${encodeURIComponent(key)}?expiresIn=${expiresInSeconds}`;
  }
}
