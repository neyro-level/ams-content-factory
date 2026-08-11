import {
  createResearchRepository,
  ResearchInboxStatus,
  type PrismaClient,
} from '@ams-content-factory/db';
import { assertSafeKnowledgeUrl, type PageFetcherProvider } from '@ams-content-factory/providers';
import { createHash } from 'node:crypto';
import { AccessDeniedError, requirePermission, type Permission } from './tenant-context';

type Context = { organizationId: string; brandId?: string; permissions: Set<Permission> };
export type ResearchInboxSource =
  | { kind: 'TEXT' | 'IDEA' | 'NOTE'; title: string; content: string; context: Context }
  | { kind: 'URL'; title: string; sourceUrl: string; context: Context };

export function createResearchService(
  options: { prisma?: PrismaClient; pageFetcher?: PageFetcherProvider } = {},
) {
  const repository = createResearchRepository(options.prisma);
  return {
    async ingest(source: ResearchInboxSource) {
      requirePermission(source.context, 'content:write');
      if (!source.context.brandId)
        throw new AccessDeniedError('Research requires a brand context.');
      const brandId = source.context.brandId;
      const organizationId = source.context.organizationId;
      const prepared =
        source.kind === 'URL'
          ? await fetchUrl(source, options.pageFetcher)
          : { content: normalise(source.content), sourceUrl: undefined, title: source.title };
      const checksum = hash(`${source.kind}\0${prepared.sourceUrl ?? ''}\0${prepared.content}`);
      const contentHash = hash(prepared.content);
      const inbox = await repository.createInboxItem({
        organizationId,
        brandId,
        kind: source.kind,
        title: prepared.title.trim(),
        content: prepared.content,
        checksum,
        ...(prepared.sourceUrl ? { sourceUrl: prepared.sourceUrl } : {}),
      });
      if (!inbox) throw new AccessDeniedError('Brand is outside the active organization.');
      const started = await repository.transitionInboxStatus({
        organizationId,
        brandId,
        id: inbox.id,
        from: ResearchInboxStatus.NEW,
        to: ResearchInboxStatus.PROCESSING,
      });
      if (started.count === 0)
        return repository.findItemByContentHash({ organizationId, brandId, contentHash });
      try {
        let sourceId: string | undefined;
        if (prepared.sourceUrl) {
          const url = new URL(prepared.sourceUrl);
          const researchSource = await repository.upsertSource({
            organizationId,
            brandId,
            canonicalUrl: prepared.sourceUrl,
            domain: url.hostname,
            sourceType: 'URL',
            title: prepared.title,
          });
          sourceId = researchSource?.id;
        }
        const item = await repository.createItem({
          organizationId,
          brandId,
          title: prepared.title.trim(),
          rawContent: prepared.content,
          contentHash,
          summary: summarize(prepared.content),
          ...(sourceId ? { sourceId } : {}),
        });
        await repository.transitionInboxStatus({
          organizationId,
          brandId,
          id: inbox.id,
          from: ResearchInboxStatus.PROCESSING,
          to: ResearchInboxStatus.READY,
        });
        return item;
      } catch (error) {
        await repository.transitionInboxStatus({
          organizationId,
          brandId,
          id: inbox.id,
          from: ResearchInboxStatus.PROCESSING,
          to: ResearchInboxStatus.FAILED,
        });
        throw error;
      }
    },
    list(context: Context) {
      requirePermission(context, 'brand:read');
      if (!context.brandId) throw new AccessDeniedError('Research requires a brand context.');
      return repository.findItems({
        organizationId: context.organizationId,
        brandId: context.brandId,
      });
    },
  };
}

async function fetchUrl(
  source: Extract<ResearchInboxSource, { kind: 'URL' }>,
  pageFetcher?: PageFetcherProvider,
) {
  if (!pageFetcher) throw new Error('Research URL ingestion requires a PageFetcherProvider.');
  const safeUrl = await assertSafeKnowledgeUrl(source.sourceUrl);
  const page = await pageFetcher.fetchPage(safeUrl);
  return {
    content: normalise(page.content),
    sourceUrl: page.finalUrl,
    title: page.title || source.title,
  };
}
function normalise(value: string) {
  const result = value.replaceAll('\r\n', '\n').trim();
  if (!result) throw new Error('Research content must not be empty.');
  return result;
}
function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
function summarize(value: string) {
  return value.slice(0, 500);
}
