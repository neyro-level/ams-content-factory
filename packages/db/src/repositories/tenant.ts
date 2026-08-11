import {
  BrandAccessRole,
  BrandStatus,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  type PrismaClient,
} from '../generated/prisma/client';
import { getPrisma } from '../client';

export type TenantRepository = ReturnType<typeof createTenantRepository>;

export function createTenantRepository(prisma: PrismaClient = getPrisma()) {
  return {
    async createOrganizationWithOwner(input: { ownerUserId: string; name: string; slug: string }) {
      return prisma.organization.create({
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
    },

    async createBrand(input: {
      organizationId: string;
      name: string;
      slug: string;
      timezone?: string;
      locale?: string;
    }) {
      return prisma.brand.create({
        data: {
          organizationId: input.organizationId,
          name: input.name,
          slug: input.slug,
          ...(input.timezone ? { timezone: input.timezone } : {}),
          ...(input.locale ? { locale: input.locale } : {}),
          status: BrandStatus.ACTIVE,
        },
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

    findBrandAccess(brandId: string, userId: string) {
      return prisma.brandAccess.findUnique({
        where: { brandId_userId: { brandId, userId } },
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
