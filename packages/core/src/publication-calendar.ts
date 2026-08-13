import { createPublishingRepository, createTenantRepository } from '@ams-content-factory/db';
import { AccessDeniedError, requirePermission, resolveTenantContext } from './tenant-context';

type CalendarActor = { userId: string; organizationId: string; brandId: string };
export type CalendarView = 'week' | 'month';

function utcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function rangeFor(view: CalendarView, anchor: Date) {
  const start = utcDay(anchor);
  if (view === 'month') {
    start.setUTCDate(1);
    const until = new Date(start);
    until.setUTCMonth(until.getUTCMonth() + 1);
    return { from: start, until };
  }
  const mondayOffset = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - mondayOffset);
  const until = new Date(start);
  until.setUTCDate(until.getUTCDate() + 7);
  return { from: start, until };
}

export function createPublicationCalendarService(
  options: {
    tenantRepository?: ReturnType<typeof createTenantRepository>;
    publishingRepository?: ReturnType<typeof createPublishingRepository>;
  } = {},
) {
  const tenants = options.tenantRepository ?? createTenantRepository();
  const publishing = options.publishingRepository ?? createPublishingRepository();

  return {
    async get(actor: CalendarActor, input: { view: CalendarView; anchor: Date }) {
      const context = await resolveTenantContext(actor, tenants);
      requirePermission(context, 'brand:read');
      if (!context.brandId)
        throw new AccessDeniedError('Publication calendar requires a brand context.');
      const range = rangeFor(input.view, input.anchor);
      const scope = { organizationId: context.organizationId, brandId: context.brandId };
      const [scheduled, unscheduledDrafts, publicationIssues, issueAccounts] = await Promise.all([
        publishing.listCalendarPublications({ ...scope, ...range }),
        publishing.listUnscheduledDraftPublications(scope),
        publishing.listPublicationIssues(scope),
        publishing.listPublicationIssueAccounts(scope),
      ]);
      return {
        view: input.view,
        anchor: utcDay(input.anchor),
        ...range,
        scheduled,
        unscheduledDrafts,
        publicationIssues: publicationIssues.map((publication) => ({
          id: publication.id,
          status: publication.status,
          title: publication.contentProject.title,
          platform: publication.platformVariant.platform,
          accountName: publication.socialAccount.name,
          accountStatus: publication.socialAccount.status,
          errorCode: publication.attempts[0]?.errorCode ?? null,
        })),
        issueAccounts,
      };
    },
  };
}
