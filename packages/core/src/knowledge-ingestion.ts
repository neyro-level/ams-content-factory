import {
  createKnowledgeRepository,
  KnowledgeDocumentStatus,
  KnowledgeDocumentType,
  type PrismaClient,
} from '@ams-content-factory/db';
import {
  assertSafeKnowledgeUrl,
  NodeKnowledgeUrlProvider,
  type KnowledgeUrlProvider,
} from '@ams-content-factory/providers';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { AccessDeniedError, requirePermission, type Permission } from './tenant-context';

const MAX_SOURCE_BYTES = 1_000_000;
const MAX_CHUNK_CHARS = 4_000;
const TEXT_FILE_EXTENSIONS = new Set(['.csv', '.html', '.htm', '.json', '.md', '.txt', '.xml']);

type KnowledgeWriteContext = {
  organizationId: string;
  brandId?: string;
  permissions: Set<Permission>;
};

type IngestionBase = {
  context: KnowledgeWriteContext;
  title: string;
};

export type KnowledgeSource =
  | (IngestionBase & { kind: 'TEXT'; text: string })
  | (IngestionBase & { kind: 'FILE'; fileName: string; contentType?: string; bytes: Uint8Array })
  | (IngestionBase & { kind: 'URL'; sourceUrl: string });

export class KnowledgeIngestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeIngestionError';
  }
}

export class KnowledgeInProgressError extends KnowledgeIngestionError {
  constructor() {
    super('Knowledge document ingestion is already processing for this source.');
    this.name = 'KnowledgeInProgressError';
  }
}

export class KnowledgeIntegrityError extends KnowledgeIngestionError {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeIntegrityError';
  }
}

export function createKnowledgeIngestionService(
  options: {
    prisma?: PrismaClient;
    urlProvider?: KnowledgeUrlProvider;
    repository?: ReturnType<typeof createKnowledgeRepository>;
  } = {},
) {
  const repository = options.repository ?? createKnowledgeRepository(options.prisma);
  const urlProvider = options.urlProvider ?? new NodeKnowledgeUrlProvider();

  return {
    async ingest(source: KnowledgeSource) {
      const { organizationId, brandId } = requireWriteContext(source.context);
      const extracted = await extractSource(source, urlProvider);
      const checksum = createChecksum(source.kind, extracted.identity, extracted.text);
      const created = await repository.createOrGetDocument({
        organizationId,
        brandId,
        title: source.title.trim(),
        type: KnowledgeDocumentType[source.kind],
        sourceText: extracted.text,
        checksum,
        metadata: extracted.metadata,
        ...(extracted.sourceUrl ? { sourceUrl: extracted.sourceUrl } : {}),
      });
      if (!created) {
        throw new AccessDeniedError('Brand is outside the active organization.');
      }

      const document = created.document;
      if (document.status === KnowledgeDocumentStatus.READY) return document;
      if (document.status === KnowledgeDocumentStatus.PROCESSING)
        throw new KnowledgeInProgressError();
      if (
        document.status !== KnowledgeDocumentStatus.PENDING &&
        document.status !== KnowledgeDocumentStatus.FAILED
      ) {
        throw new KnowledgeIntegrityError(
          `Knowledge document cannot be processed from ${document.status}.`,
        );
      }

      await transition({
        organizationId,
        brandId,
        documentId: document.id,
        from: document.status === KnowledgeDocumentStatus.FAILED ? 'FAILED' : 'PENDING',
        to: 'PROCESSING',
      });
      try {
        await Promise.all(
          splitIntoChunks(extracted.text).map((content, ordinal) =>
            repository.addChunk({
              organizationId,
              brandId,
              documentId: document.id,
              ordinal,
              content,
            }),
          ),
        );
        await transition({
          organizationId,
          brandId,
          documentId: document.id,
          from: 'PROCESSING',
          to: 'READY',
        });
        const ready = await repository.findDocumentByChecksum({
          organizationId,
          brandId,
          checksum,
        });
        if (!ready || ready.status !== KnowledgeDocumentStatus.READY) {
          throw new KnowledgeIntegrityError('READY knowledge document could not be reloaded.');
        }
        return ready;
      } catch (error) {
        await transition({
          organizationId,
          brandId,
          documentId: document.id,
          from: 'PROCESSING',
          to: 'FAILED',
        });
        throw error;
      }
    },
  };

  async function transition(input: {
    organizationId: string;
    brandId: string;
    documentId: string;
    from: keyof typeof KnowledgeDocumentStatus;
    to: keyof typeof KnowledgeDocumentStatus;
  }) {
    const result = await repository.transitionDocumentStatus({
      ...input,
      from: KnowledgeDocumentStatus[input.from],
      to: KnowledgeDocumentStatus[input.to],
    });
    if (result.count !== 1) {
      throw new KnowledgeIngestionError('Knowledge document transition was rejected.');
    }
  }
}

function requireWriteContext(context: KnowledgeWriteContext) {
  requirePermission(context, 'content:write');
  if (!context.brandId) {
    throw new KnowledgeIngestionError('Knowledge ingestion requires a brand context.');
  }
  return { organizationId: context.organizationId, brandId: context.brandId };
}

async function extractSource(source: KnowledgeSource, urlProvider: KnowledgeUrlProvider) {
  validateTitle(source.title);

  if (source.kind === 'TEXT') {
    const text = validateText(source.text);
    return { identity: 'text', text, metadata: { sourceKind: source.kind } };
  }

  if (source.kind === 'FILE') {
    const extension = extname(source.fileName).toLowerCase();
    if (!TEXT_FILE_EXTENSIONS.has(extension)) {
      throw new KnowledgeIngestionError(
        'Only UTF-8 text files are supported for knowledge ingestion.',
      );
    }
    if (source.contentType && !source.contentType.toLowerCase().startsWith('text/')) {
      throw new KnowledgeIngestionError('Knowledge file content type must be textual.');
    }
    if (source.bytes.byteLength === 0 || source.bytes.byteLength > MAX_SOURCE_BYTES) {
      throw new KnowledgeIngestionError('Knowledge file exceeds the allowed size.');
    }
    return {
      identity: source.fileName,
      text: validateText(new TextDecoder('utf-8', { fatal: true }).decode(source.bytes)),
      metadata: {
        contentType: source.contentType,
        fileName: source.fileName,
        sourceKind: source.kind,
      },
    };
  }

  const sourceUrl = await assertSafeKnowledgeUrl(source.sourceUrl);
  const fetched = await urlProvider.fetchText(sourceUrl);
  return {
    identity: fetched.finalUrl,
    text: validateText(fetched.content),
    sourceUrl: fetched.finalUrl,
    metadata: { contentType: fetched.contentType, sourceKind: source.kind },
  };
}

function validateTitle(title: string) {
  if (title.trim().length === 0 || title.trim().length > 300) {
    throw new KnowledgeIngestionError('Knowledge document title must contain 1–300 characters.');
  }
}

function validateText(value: string) {
  const text = value.replaceAll('\r\n', '\n').trim();
  if (
    text.length === 0 ||
    Buffer.byteLength(text, 'utf-8') > MAX_SOURCE_BYTES ||
    text.includes('\0')
  ) {
    throw new KnowledgeIngestionError(
      'Knowledge source must contain safe non-empty text within the size limit.',
    );
  }
  return text;
}

function createChecksum(kind: KnowledgeSource['kind'], identity: string, text: string) {
  return createHash('sha256').update(`${kind}\0${identity}\0${text}`, 'utf8').digest('hex');
}

function splitIntoChunks(text: string) {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > MAX_CHUNK_CHARS) {
    const boundary = Math.max(
      remaining.lastIndexOf('\n', MAX_CHUNK_CHARS),
      remaining.lastIndexOf(' ', MAX_CHUNK_CHARS),
    );
    const end = boundary > 0 ? boundary : MAX_CHUNK_CHARS;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trimStart();
  }
  chunks.push(remaining);
  return chunks;
}
