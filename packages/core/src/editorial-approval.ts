import { createContentRepository, createTenantRepository } from '@ams-content-factory/db';
import { AccessDeniedError, requirePermission, resolveTenantContext } from './tenant-context';

type Actor = { userId: string; organizationId: string; brandId: string };

export function createEditorialApprovalService(
  options: {
    tenantRepository?: ReturnType<typeof createTenantRepository>;
    contentRepository?: ReturnType<typeof createContentRepository>;
  } = {},
) {
  const tenants = options.tenantRepository ?? createTenantRepository();
  const content = options.contentRepository ?? createContentRepository();
  return {
    async requestReview(actor: Actor, input: { contentProjectId: string }) {
      const context = await resolveTenantContext(actor, tenants);
      requirePermission(context, 'content:write');
      const transition = await content.transition({
        organizationId: context.organizationId,
        brandId: actor.brandId,
        id: input.contentProjectId,
        from: 'FACT_CHECK',
        to: 'REVIEW',
      });
      if (transition.count !== 1)
        throw new AccessDeniedError(
          'Content project is not in FACT_CHECK within the active organization.',
        );
    },
    async approve(actor: Actor, input: { contentProjectId: string; note?: string }) {
      const context = await resolveTenantContext(actor, tenants);
      requirePermission(context, 'content:review');
      const approval = await content.approveManual({
        organizationId: context.organizationId,
        brandId: actor.brandId,
        contentProjectId: input.contentProjectId,
        reviewerUserId: actor.userId,
        ...(input.note === undefined ? {} : { note: input.note }),
      });
      if (!approval)
        throw new AccessDeniedError(
          'Content project is not in REVIEW within the active organization.',
        );
      await tenants.appendAuditLog({
        organizationId: context.organizationId,
        brandId: actor.brandId,
        actorUserId: actor.userId,
        action: 'content.approve',
        entityType: 'ContentProject',
        entityId: input.contentProjectId,
      });
      return approval;
    },
    async returnToDraft(actor: Actor, input: { contentProjectId: string; note?: string }) {
      return decide(actor, input, 'DRAFT', 'CHANGES_REQUESTED');
    },
    async reject(actor: Actor, input: { contentProjectId: string; note?: string }) {
      return decide(actor, input, 'REJECTED', 'REJECTED');
    },
    async comment(actor: Actor, input: { contentProjectId: string; body: string }) {
      const context = await resolveTenantContext(actor, tenants);
      requirePermission(context, 'content:write');
      const body = input.body.trim();
      if (!body || body.length > 5000) throw new Error('Comment must contain 1–5000 characters.');
      const comment = await content.addComment({
        organizationId: context.organizationId,
        brandId: actor.brandId,
        contentProjectId: input.contentProjectId,
        authorUserId: actor.userId,
        body,
      });
      if (!comment)
        throw new AccessDeniedError('Content project is outside the active organization.');
      return comment;
    },
  };

  async function decide(
    actor: Actor,
    input: { contentProjectId: string; note?: string },
    to: 'DRAFT' | 'REJECTED',
    status: 'CHANGES_REQUESTED' | 'REJECTED',
  ) {
    const context = await resolveTenantContext(actor, tenants);
    requirePermission(context, 'content:review');
    const decision = await content.recordEditorialDecision({
      organizationId: context.organizationId,
      brandId: actor.brandId,
      contentProjectId: input.contentProjectId,
      reviewerUserId: actor.userId,
      from: 'REVIEW',
      to,
      status,
      ...(input.note === undefined ? {} : { note: input.note }),
    });
    if (!decision)
      throw new AccessDeniedError(
        'Content project is not in REVIEW within the active organization.',
      );
    await tenants.appendAuditLog({
      organizationId: context.organizationId,
      brandId: actor.brandId,
      actorUserId: actor.userId,
      action: to === 'REJECTED' ? 'content.reject' : 'content.return_to_draft',
      entityType: 'ContentProject',
      entityId: input.contentProjectId,
    });
    return decision;
  }
}
