import 'dotenv/config';
import {
  createOrganizationService,
  OrganizationInputError,
} from '../../packages/core/src/index.js';
import {
  createPrismaClient,
  createTenantRepository,
  MembershipStatus,
} from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const repository = createTenantRepository(prisma);
const service = createOrganizationService(repository);
const prefix = 'w5-organizations-contract';
const ownerEmail = `${prefix}-owner@local`;
const foreignEmail = `${prefix}-foreign@local`;

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('organization application service', () => {
  it('creates an owner organization, isolates lists and excludes revoked membership', async () => {
    await prisma.organization.deleteMany({ where: { slug: { startsWith: prefix } } });
    const [owner, foreign] = await Promise.all([
      prisma.user.upsert({
        where: { email: ownerEmail },
        create: { email: ownerEmail, name: 'Owner' },
        update: {},
      }),
      prisma.user.upsert({
        where: { email: foreignEmail },
        create: { email: foreignEmail, name: 'Foreign' },
        update: {},
      }),
    ]);

    const first = await service.createForUser(owner.id, `${prefix} alpha`);
    const second = await service.createForUser(owner.id, `${prefix} alpha`);
    expect(first.memberships).toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: owner.id, role: 'OWNER' })]),
    );
    expect(second.slug).not.toBe(first.slug);

    await expect(service.listForUser(foreign.id)).resolves.toEqual([]);
    await expect(service.listForUser(owner.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organization: expect.objectContaining({ id: first.id }) }),
      ]),
    );

    await prisma.membership.updateMany({
      where: { organizationId: first.id, userId: owner.id },
      data: { status: MembershipStatus.SUSPENDED },
    });
    await expect(service.listForUser(owner.id)).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organization: expect.objectContaining({ id: first.id }) }),
      ]),
    );
    await expect(service.createForUser(owner.id, 'x')).rejects.toBeInstanceOf(
      OrganizationInputError,
    );
  });

  it('falls back to a unique slug after the readable collision range is exhausted', async () => {
    await prisma.organization.deleteMany({ where: { slug: { startsWith: `${prefix}-fallback` } } });
    const owner = await prisma.user.upsert({
      where: { email: ownerEmail },
      create: { email: ownerEmail, name: 'Owner' },
      update: {},
    });
    const baseSlug = `${prefix}-fallback`;
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        repository.createOrganizationWithOwner({
          ownerUserId: owner.id,
          name: `Reserved ${index + 1}`,
          slug: index === 0 ? baseSlug : `${baseSlug}-${index + 1}`,
        }),
      ),
    );

    await expect(service.createForUser(owner.id, `${prefix} fallback`)).resolves.toEqual(
      expect.objectContaining({
        slug: expect.stringMatching(new RegExp(`^${baseSlug}-[a-f0-9]{12}$`)),
      }),
    );
  });
});
