import {
  createTenantRepository,
  OrganizationSlugConflictError,
  type TenantRepository,
} from '@ams-content-factory/db';
import { randomUUID } from 'node:crypto';

export class OrganizationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrganizationInputError';
  }
}

function toSlug(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'organization';
}

export function createOrganizationService(repository: TenantRepository = createTenantRepository()) {
  return {
    listForUser(userId: string) {
      return repository.listActiveOrganizationsForUser(userId);
    },

    async createForUser(userId: string, rawName: string) {
      const name = rawName.trim().replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 120) {
        throw new OrganizationInputError(
          'Название организации должно содержать от 2 до 120 символов.',
        );
      }

      const baseSlug = toSlug(name);
      for (let suffix = 1; suffix <= 20; suffix += 1) {
        const slug = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`;
        try {
          return await repository.createOrganizationWithOwner({ ownerUserId: userId, name, slug });
        } catch (error) {
          if (!(error instanceof OrganizationSlugConflictError)) throw error;
        }
      }

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const slug = `${baseSlug}-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
        try {
          return await repository.createOrganizationWithOwner({ ownerUserId: userId, name, slug });
        } catch (error) {
          if (!(error instanceof OrganizationSlugConflictError)) throw error;
        }
      }
      throw new OrganizationInputError('Не удалось подобрать свободный адрес организации.');
    },
  };
}
