import {
  BrandAccessRole,
  BrandStatus,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  type PrismaClient,
} from '../generated/prisma/client';
import { getPrisma } from '../client';

export type TenantRepository = ReturnType<typeof createTenantRepository>;

export class OrganizationSlugConflictError extends Error {
  constructor() {
    super('Organization slug already exists.');
    this.name = 'OrganizationSlugConflictError';
  }
}

export class BrandSlugConflictError extends Error {
  constructor() {
    super('Brand slug already exists in this organization.');
    this.name = 'BrandSlugConflictError';
  }
}

export function createTenantRepository(prisma: PrismaClient = getPrisma()) {
  return {
    async createOrganizationWithOwner(input: { ownerUserId: string; name: string; slug: string }) {
      try {
        return await prisma.organization.create({
          data: {
            name: input.name,
            slug: input.slug,
            status: OrganizationStatus.ACTIVE,
            memberships: {
              create: {
                userId: input.ownerUserId,
                role: MembershipRole.OWNER,
                status: MembershipStatus.ACTIVE,
              },
            },
          },
          include: { memberships: true },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new OrganizationSlugConflictError();
        }
        throw error;
      }
    },

    listActiveOrganizationsForUser(userId: string) {
      return prisma.membership.findMany({
        where: {
          userId,
          status: MembershipStatus.ACTIVE,
          organization: { status: OrganizationStatus.ACTIVE },
        },
        select: {
          role: true,
          organization: { select: { id: true, name: true, slug: true, createdAt: true } },
        },
        orderBy: { organization: { createdAt: 'asc' } },
      });
    },

    async createBrand(input: {
      organizationId: string;
      name: string;
      slug: string;
      ownerUserId?: string;
      timezone?: string;
      locale?: string;
    }) {
      try {
        return await prisma.brand.create({
          data: {
            organizationId: input.organizationId,
            name: input.name,
            slug: input.slug,
            ...(input.timezone ? { timezone: input.timezone } : {}),
            ...(input.locale ? { locale: input.locale } : {}),
            status: BrandStatus.ACTIVE,
            ...(input.ownerUserId
              ? {
                  accesses: { create: { userId: input.ownerUserId, role: BrandAccessRole.MANAGE } },
                }
              : {}),
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new BrandSlugConflictError();
        }
        throw error;
      }
    },

    listActiveBrandsInOrganization(organizationId: string) {
      return prisma.brand.findMany({
        where: { organizationId, status: BrandStatus.ACTIVE, deletedAt: null },
        select: { id: true, name: true, slug: true, timezone: true, locale: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
    },

    async grantBrandAccess(input: { brandId: string; userId: string; role: BrandAccessRole }) {
      return prisma.brandAccess.upsert({
        where: { brandId_userId: { brandId: input.brandId, userId: input.userId } },
        create: input,
        update: { role: input.role },
      });
    },

    findActiveMembership(organizationId: string, userId: string) {
      return prisma.membership.findFirst({
        where: { organizationId, userId, status: MembershipStatus.ACTIVE },
      });
    },

    findBrandInOrganization(organizationId: string, brandId: string) {
      return prisma.brand.findFirst({
        where: { id: brandId, organizationId, status: BrandStatus.ACTIVE, deletedAt: null },
      });
    },

    updateBrandDetails(input: {
      organizationId: string;
      brandId: string;
      description?: string;
      websiteUrl?: string | null;
    }) {
      return prisma.brand.updateMany({
        where: {
          id: input.brandId,
          organizationId: input.organizationId,
          status: BrandStatus.ACTIVE,
          deletedAt: null,
        },
        data: {
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.websiteUrl === undefined ? {} : { websiteUrl: input.websiteUrl }),
        },
      });
    },

    findBrandAccess(input: { organizationId: string; brandId: string; userId: string }) {
      return prisma.brandAccess.findFirst({
        where: {
          brandId: input.brandId,
          userId: input.userId,
          brand: { organizationId: input.organizationId, deletedAt: null },
        },
      });
    },

    appendAuditLog(input: {
      organizationId: string;
      brandId?: string;
      actorUserId?: string;
      action: string;
      entityType: string;
      entityId: string;
      metadata?: object;
    }) {
      return prisma.auditLog.create({ data: input });
    },

    async isOrganizationActive(organizationId: string) {
      return Boolean(
        await prisma.organization.findFirst({
          where: { id: organizationId, status: OrganizationStatus.ACTIVE },
          select: { id: true },
        }),
      );
    },
  };
}
