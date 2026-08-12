import {
  BrandAccessRole,
  createTenantRepository,
  MembershipRole,
  type TenantRepository,
} from '@ams-content-factory/db';

export type Permission = 'brand:manage' | 'brand:read' | 'content:review' | 'content:write';

export class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessDeniedError';
  }
}

const organizationPermissions: Record<MembershipRole, Permission[]> = {
  OWNER: ['brand:manage', 'brand:read', 'content:review', 'content:write'],
  ADMIN: ['brand:manage', 'brand:read', 'content:review', 'content:write'],
  EDITOR: ['brand:read', 'content:write'],
  REVIEWER: ['brand:read', 'content:review'],
  VIEWER: ['brand:read'],
};

const brandPermissions: Record<BrandAccessRole, Permission[]> = {
  MANAGE: ['brand:manage', 'brand:read', 'content:review', 'content:write'],
  EDIT: ['brand:read', 'content:write'],
  REVIEW: ['brand:read', 'content:review'],
  VIEW: ['brand:read'],
};

export async function resolveTenantContext(
  input: { userId: string; organizationId: string; brandId?: string },
  repository: TenantRepository = createTenantRepository(),
) {
  if (!(await repository.isOrganizationActive(input.organizationId))) {
    throw new AccessDeniedError('An active organization is required.');
  }

  const membership = await repository.findActiveMembership(input.organizationId, input.userId);
  if (!membership) throw new AccessDeniedError('Active organization membership is required.');

  let brandRole: BrandAccessRole | undefined;
  if (input.brandId) {
    const brand = await repository.findBrandInOrganization(input.organizationId, input.brandId);
    if (!brand) throw new AccessDeniedError('Brand is outside the active organization.');
    brandRole = (await repository.findBrandAccess(input.brandId, input.userId))?.role;
  }

  return {
    ...input,
    organizationRole: membership.role,
    brandRole,
    permissions: new Set([
      ...organizationPermissions[membership.role],
      ...(brandRole ? brandPermissions[brandRole] : []),
    ]),
  };
}

export function requirePermission(
  context: { permissions: Set<Permission> },
  permission: Permission,
) {
  if (!context.permissions.has(permission)) {
    throw new AccessDeniedError(`Permission required: ${permission}`);
  }
}
