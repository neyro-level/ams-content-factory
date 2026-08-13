import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createBrandContextService } from '../../packages/core/src/index.js';
import {
  createKnowledgeRepository,
  createPrismaClient,
  createTenantRepository,
} from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const knowledge = createKnowledgeRepository(prisma);
const slug = `brand-context-v01-${randomUUID()}`;

afterAll(async () => {
  const organizations = await prisma.organization.findMany({
    where: { slug: { startsWith: slug } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { organizationId: { in: organizations.map((item) => item.id) } },
  });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: slug } } });
  await prisma.$disconnect();
});

describe('brand context', () => {
  it('persists scoped profile and voice data with an audit event', async () => {
    const setup = await createSetup('owner');
    const service = createBrandContextService({ tenants, knowledge });
    await service.save(setup.actor, {
      description: 'Brand description',
      websiteUrl: 'https://example.test',
      positioning: 'Clear value',
      targetAudience: 'Operators',
      offers: 'Audit\nStrategy',
      constraints: 'No promises',
      forbiddenClaims: 'Best in market',
      toneSummary: 'Calm and clear',
      styleRules: 'Short sentences',
      forbiddenWords: 'Cheap',
    });
    await expect(service.get(setup.actor)).resolves.toEqual(
      expect.objectContaining({
        brand: expect.objectContaining({
          description: 'Brand description',
          websiteUrl: 'https://example.test',
        }),
        generation: expect.objectContaining({
          profile: expect.objectContaining({ offers: ['Audit', 'Strategy'] }),
          voices: [expect.objectContaining({ toneSummary: 'Calm and clear' })],
        }),
      }),
    );
    await expect(
      prisma.auditLog.findFirst({
        where: { brandId: setup.brand.id, action: 'brand.context.update' },
      }),
    ).resolves.toBeTruthy();
  });

  it('denies a foreign tenant from reading or writing the context', async () => {
    const first = await createSetup('first');
    const second = await createSetup('second');
    const service = createBrandContextService({ tenants, knowledge });
    const foreignActor = { ...second.actor, brandId: first.brand.id };
    await expect(service.get(foreignActor)).rejects.toThrow('outside the active organization');
    await expect(service.save(foreignActor, blankInput())).rejects.toThrow();
  });
});

function blankInput() {
  return {
    description: '',
    websiteUrl: '',
    positioning: '',
    targetAudience: '',
    offers: '',
    constraints: '',
    forbiddenClaims: '',
    toneSummary: '',
    styleRules: '',
    forbiddenWords: '',
  };
}
async function createSetup(name: string) {
  const user = await prisma.user.upsert({
    where: { email: `${slug}-${name}@local` },
    create: { name, email: `${slug}-${name}@local` },
    update: {},
  });
  const organization = await tenants.createOrganizationWithOwner({
    ownerUserId: user.id,
    name: `${slug}-${name}`,
    slug: `${slug}-${name}`,
  });
  const brand = await tenants.createBrand({
    organizationId: organization.id,
    ownerUserId: user.id,
    name,
    slug: name,
  });
  return { actor: { userId: user.id, organizationId: organization.id, brandId: brand.id }, brand };
}
