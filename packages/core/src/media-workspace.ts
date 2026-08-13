import {
  createMediaRepository,
  createTenantRepository,
  type MediaSourceType,
} from '@ams-content-factory/db';
import { createMediaService } from './media';
import { AccessDeniedError, requirePermission, resolveTenantContext } from './tenant-context';

type MediaActor = { userId: string; organizationId: string; brandId: string };

export class MediaStorageBlockedExternalError extends Error {
  constructor() {
    super(
      'BLOCKED_EXTERNAL: production S3 storage is not configured. Add the private S3 endpoint, bucket, and credentials before uploading media.',
    );
    this.name = 'MediaStorageBlockedExternalError';
  }
}

export function createMediaWorkspaceService(
  options: {
    tenantRepository?: ReturnType<typeof createTenantRepository>;
    mediaRepository?: ReturnType<typeof createMediaRepository>;
    mediaService?: ReturnType<typeof createMediaService>;
  } = {},
) {
  const tenants = options.tenantRepository ?? createTenantRepository();
  const mediaRepository = options.mediaRepository ?? createMediaRepository();

  async function readContext(actor: MediaActor) {
    const context = await resolveTenantContext(actor, tenants);
    requirePermission(context, 'brand:read');
    if (!context.brandId) throw new AccessDeniedError('Media requires a brand context.');
    return context;
  }

  return {
    async list(actor: MediaActor, input: { take?: number; cursor?: string } = {}) {
      const context = await readContext(actor);
      return mediaRepository.listAssets({
        organizationId: context.organizationId,
        brandId: context.brandId!,
        ...input,
      });
    },

    async upload(
      actor: MediaActor,
      input: { type: string; filename: string; content: Uint8Array; sourceType: MediaSourceType },
    ) {
      const context = await readContext(actor);
      requirePermission(context, 'content:write');
      if (!options.mediaService) throw new MediaStorageBlockedExternalError();
      return options.mediaService.store(context, input);
    },
  };
}
