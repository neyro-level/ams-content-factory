export type RuntimeNodeEnv = 'development' | 'test' | 'production';

export type RuntimeConfig = {
  nodeEnv: RuntimeNodeEnv;
  appUrl: string;
  databaseUrl: string;
  betterAuthSecret: string;
  tokenEncryptionKey: string;
};

export class EnvironmentValidationError extends Error {
  public constructor(readonly issues: string[]) {
    super(`Invalid runtime environment: ${issues.join(' ')}`);
    this.name = 'EnvironmentValidationError';
  }
}

type Environment = Record<string, string | undefined>;

const providerGroups: ReadonlyArray<readonly string[]> = [
  ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'],
  ['VK_CLIENT_ID', 'VK_CLIENT_SECRET'],
  ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'],
  ['OPENAI_API_KEY'],
  ['HEYGEN_API_KEY'],
  ['MOTION_API_KEY'],
];

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}

function validUrl(value: string | undefined, label: string, issues: string[]) {
  if (!hasValue(value)) return undefined;
  try {
    const url = new URL(value!);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
    return url;
  } catch {
    issues.push(`${label} must be an absolute http(s) URL.`);
    return undefined;
  }
}

function validateProviderGroups(env: Environment, issues: string[]) {
  for (const group of providerGroups) {
    const configured = group.filter((name) => hasValue(env[name]));
    if (configured.length > 0 && configured.length !== group.length) {
      const missing = group.filter((name) => !hasValue(env[name]));
      issues.push(`${group.join('/')} must be configured together; missing ${missing.join('/')}.`);
    }
  }
}

export function readRuntimeConfig(env: Environment = process.env): RuntimeConfig {
  const issues: string[] = [];
  const nodeEnv = env.NODE_ENV;
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    issues.push('NODE_ENV must be development, test, or production.');
  }
  const normalizedNodeEnv = nodeEnv as RuntimeNodeEnv;
  const fallbackUrl =
    normalizedNodeEnv === 'development' || normalizedNodeEnv === 'test'
      ? 'http://localhost:3000'
      : undefined;
  const appUrl = env.APP_URL ?? fallbackUrl;
  const parsedAppUrl = validUrl(appUrl, 'APP_URL', issues);
  if (!parsedAppUrl) issues.push('APP_URL is required outside development and test.');
  if (normalizedNodeEnv === 'production' && parsedAppUrl?.hostname === 'localhost') {
    issues.push('APP_URL must not use localhost in production.');
  }

  const databaseUrl = env.DATABASE_URL;
  if (!hasValue(databaseUrl)) {
    issues.push('DATABASE_URL is required.');
  } else {
    try {
      const parsedDatabaseUrl = new URL(databaseUrl!);
      if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)) {
        issues.push('DATABASE_URL must use a PostgreSQL URL.');
      }
    } catch {
      issues.push('DATABASE_URL must be a valid PostgreSQL URL.');
    }
  }

  const betterAuthSecret = env.BETTER_AUTH_SECRET;
  if (!hasValue(betterAuthSecret) || betterAuthSecret!.length < 32) {
    issues.push('BETTER_AUTH_SECRET must contain at least 32 characters.');
  }

  const tokenEncryptionKey = env.TOKEN_ENCRYPTION_KEY;
  if (!hasValue(tokenEncryptionKey) || Buffer.from(tokenEncryptionKey!, 'base64').length !== 32) {
    issues.push('TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }

  validateProviderGroups(env, issues);
  if (issues.length > 0) throw new EnvironmentValidationError(issues);

  return {
    nodeEnv: normalizedNodeEnv,
    appUrl: parsedAppUrl!.toString().replace(/\/$/, ''),
    databaseUrl: databaseUrl!,
    betterAuthSecret: betterAuthSecret!,
    tokenEncryptionKey: tokenEncryptionKey!,
  };
}

export function assertRuntimeEnvironment(env: Environment = process.env) {
  return readRuntimeConfig(env);
}
