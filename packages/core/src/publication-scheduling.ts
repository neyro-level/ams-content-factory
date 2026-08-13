import { createPublishingRepository, createTenantRepository } from '@ams-content-factory/db';
import { AccessDeniedError, requirePermission, resolveTenantContext } from './tenant-context';

type SchedulingActor = { userId: string; organizationId: string; brandId: string };

export class PublicationSchedulingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicationSchedulingError';
  }
}

function assertFutureDate(scheduledAt: Date, now: Date) {
  if (Number.isNaN(scheduledAt.getTime()))
    throw new PublicationSchedulingError('A valid publication schedule time is required.');
  if (scheduledAt.getTime() <= now.getTime())
    throw new PublicationSchedulingError('Publication schedule time must be in the future.');
}

export function createPublicationSchedulingService(
  options: {
    tenantRepository?: ReturnType<typeof createTenantRepository>;
    publishingRepository?: ReturnType<typeof createPublishingRepository>;
    now?: () => Date;
  } = {},
) {
  const tenants = options.tenantRepository ?? createTenantRepository();
  const publishing = options.publishingRepository ?? createPublishingRepository();
  const now = options.now ?? (() => new Date());

  return {
    async schedule(actor: SchedulingActor, input: { id: string; scheduledAt: Date }) {
      const context = await resolveTenantContext(actor, tenants);
      requirePermission(context, 'content:write');
      if (!context.brandId)
        throw new AccessDeniedError('Publication scheduling requires a brand context.');
      assertFutureDate(input.scheduledAt, now());
      const scope = { organizationId: context.organizationId, brandId: context.brandId };
      const updated = await publishing.schedulePublication({ ...scope, ...input });
      if (updated.count !== 1)
        throw new PublicationSchedulingError(
          'Only an active-brand DRAFT publication can be scheduled once.',
        );
      const publication = await publishing.findPublication({ ...scope, id: input.id });
      if (publication) {
        await tenants.appendAuditLog({
          organizationId: context.organizationId,
          brandId: context.brandId,
          actorUserId: actor.userId,
          action: 'publication.schedule',
          entityType: 'Publication',
          entityId: publication.id,
          metadata: { scheduledAt: publication.scheduledAt?.toISOString() ?? null },
        });
      }
      return publication;
    },
    async reschedule(actor: SchedulingActor, input: { id: string; scheduledAt: Date }) {
      const context = await resolveTenantContext(actor, tenants);
      requirePermission(context, 'content:write');
      if (!context.brandId)
        throw new AccessDeniedError('Publication scheduling requires a brand context.');
      assertFutureDate(input.scheduledAt, now());
      const scope = { organizationId: context.organizationId, brandId: context.brandId };
      const updated = await publishing.reschedulePublication({ ...scope, ...input });
      if (updated.count !== 1)
        throw new PublicationSchedulingError(
          'Only an active-brand queued publication before dispatch can be rescheduled.',
        );
      return publishing.findPublication({ ...scope, id: input.id });
    },
    async cancel(actor: SchedulingActor, id: string) {
      const context = await resolveTenantContext(actor, tenants);
      requirePermission(context, 'content:write');
      if (!context.brandId)
        throw new AccessDeniedError('Publication scheduling requires a brand context.');
      const scope = { organizationId: context.organizationId, brandId: context.brandId };
      const updated = await publishing.cancelPublication({ ...scope, id });
      if (updated.count !== 1)
        throw new PublicationSchedulingError(
          'Only an active-brand queued publication before dispatch can be cancelled.',
        );
      return publishing.findPublication({ ...scope, id });
    },
  };
}
