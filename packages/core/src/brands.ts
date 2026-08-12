import {
  BrandSlugConflictError,
  createTenantRepository,
  type TenantRepository,
} from '@ams-content-factory/db';
import { requirePermission, resolveTenantContext, type Permission } from './tenant-context';

export class BrandInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrandInputError';
  }
}

type Actor = { userId: string; organizationId: string };
type Context = Actor & { permissions: Set<Permission> };

function toSlug(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'brand';
}

export function createBrandService(repository: TenantRepository = createTenantRepository()) {
  const context = (actor: Actor): Promise<Context> => resolveTenantContext(actor, repository);
  return {
    async list(actor: Actor) {
      const tenant = await context(actor);
      requirePermission(tenant, 'brand:read');
      return repository.listActiveBrandsInOrganization(tenant.organizationId);
    },

    async create(actor: Actor, rawName: string) {
      const tenant = await context(actor);
      requirePermission(tenant, 'brand:manage');
      const name = rawName.trim().replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 120) {
        throw new BrandInputError('Название бренда должно содержать от 2 до 120 символов.');
      }

      const baseSlug = toSlug(name);
      for (let suffix = 1; suffix <= 20; suffix += 1) {
        const slug = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`;
        try {
          return await repository.createBrand({
            organizationId: tenant.organizationId,
            ownerUserId: tenant.userId,
            name,
            slug,
          });
        } catch (error) {
          if (!(error instanceof BrandSlugConflictError)) throw error;
        }
      }
      throw new BrandInputError('Не удалось подобрать свободный адрес бренда.');
    },
  };
}
