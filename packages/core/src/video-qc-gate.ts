import {
  createCaptionsRepository,
  createMediaRepository,
  type PrismaClient,
} from '@ams-content-factory/db';
import { AccessDeniedError, requirePermission, type Permission } from './tenant-context';

type Context = { organizationId: string; brandId?: string; permissions: Set<Permission> };

function scoped(context: Context) {
  requirePermission(context, 'content:write');
  if (!context.brandId) throw new AccessDeniedError('Video QC requires a brand context.');
  return { organizationId: context.organizationId, brandId: context.brandId };
}

export function createVideoQcGateService(options: { prisma?: PrismaClient } = {}) {
  const media = createMediaRepository(options.prisma);
  const captions = createCaptionsRepository(options.prisma);
  return {
    async complete(context: Context, videoProductionId: string) {
      const scope = scoped(context);
      const production = await media.findProduction({ ...scope, id: videoProductionId });
      if (!production) throw new AccessDeniedError('Video production is outside the active brand.');
      if (production.status !== 'QC')
        throw new Error('Video production is not waiting for QC completion.');
      const report = await captions.findLatestQcReport({ ...scope, videoProductionId });
      if (!report || report.status !== 'PASSED') {
        throw new Error(
          'A latest successful QC report is required before video production can become READY.',
        );
      }
      const transitioned = await media.transitionProduction({
        ...scope,
        id: videoProductionId,
        from: 'QC',
        to: 'READY',
      });
      if (transitioned.count !== 1) throw new Error('Video QC completion transition was rejected.');
      return media.findProduction({ ...scope, id: videoProductionId });
    },
  };
}
