export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type StructuredLogEvent = {
  timestamp: string;
  level: LogLevel;
  event: string;
  requestId?: string;
  organizationId?: string;
  brandId?: string;
  workflowRunId?: string;
  contentProjectId?: string;
  publicationId?: string;
  provider?: string;
  providerJobId?: string;
  durationMs?: number;
  errorCode?: string;
};

export type StructuredLogger = {
  log(event: Omit<StructuredLogEvent, 'timestamp'>): void;
  debug(event: Omit<StructuredLogEvent, 'timestamp' | 'level'>): void;
  info(event: Omit<StructuredLogEvent, 'timestamp' | 'level'>): void;
  warn(event: Omit<StructuredLogEvent, 'timestamp' | 'level'>): void;
  error(event: Omit<StructuredLogEvent, 'timestamp' | 'level'>): void;
};

export type StructuredLogSink = (event: StructuredLogEvent) => void;
export type ErrorReport = {
  error: { name: string; message: string };
  context?: unknown;
};
export type ErrorReporter = { report(error: unknown, context?: unknown): void };

const now = () => new Date().toISOString();
const secretKey = /password|cookie|token|secret|api[-_]?key|authorization|encryption/i;
const bearer = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
const rawKey = /\bamscf_[A-Za-z0-9_-]{20,}\b/g;

/** Removes secrets from arbitrary error/context values before any sink receives them. */
export function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string')
    return value.replace(bearer, '$1[REDACTED]').replace(rawKey, '[REDACTED]');
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      secretKey.test(key) ? '[REDACTED]' : redactSecrets(item),
    ]),
  );
}

/**
 * Minimal adapter point for an infrastructure error sink. It deliberately does not require
 * a vendor SDK and redacts every free-form value before forwarding the report.
 */
export function createErrorReporter(
  options: { sink?: (report: ErrorReport) => void } = {},
): ErrorReporter {
  const sink = options.sink ?? ((report: ErrorReport) => console.error(JSON.stringify(report)));
  return {
    report(error, context) {
      const normalized =
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { name: 'UnknownError', message: String(error) };
      sink({
        error: redactSecrets(normalized) as ErrorReport['error'],
        ...(context === undefined ? {} : { context: redactSecrets(context) }),
      });
    },
  };
}

/**
 * Emits one JSON-safe event with a deliberately closed field set. Callers cannot attach
 * arbitrary metadata here; redactSecrets is required for free-form error/context values.
 */
export function createStructuredLogger(
  options: {
    sink?: StructuredLogSink;
    clock?: () => string;
  } = {},
): StructuredLogger {
  const sink = options.sink ?? ((event: StructuredLogEvent) => console.log(JSON.stringify(event)));
  const clock = options.clock ?? now;
  const log = (event: Omit<StructuredLogEvent, 'timestamp'>) =>
    sink({ ...event, timestamp: clock() });
  const at = (level: LogLevel) => (event: Omit<StructuredLogEvent, 'timestamp' | 'level'>) =>
    log({ ...event, level });

  return { log, debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
}
