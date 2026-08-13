import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  createContentRepository,
  createPrismaClient,
  createTenantRepository,
} from '../../packages/db/src/index.js';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const content = createContentRepository(prisma);
const suffix = randomUUID();
const firstEmail = `v01-a-${suffix}@ams-content-factory.local`;
const secondEmail = `v01-b-${suffix}@ams-content-factory.local`;
const password = 'v01-isolation-password';
const origin = `http://127.0.0.1:${process.env.E2E_PORT ?? '3000'}`;

test.use({ extraHTTPHeaders: { 'x-real-ip': '198.18.0.30' } });
test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [firstEmail, secondEmail] } } });
  await prisma.$disconnect();
});

test('tenant B cannot read tenant A knowledge or content routes', async ({ page }) => {
  for (const [index, [name, email]] of [
    ['A', firstEmail],
    ['B', secondEmail],
  ].entries()) {
    const response = await page.request.post('/api/auth/sign-up/email', {
      headers: { origin, 'x-real-ip': `198.18.0.${31 + index}` },
      data: { name, email, password },
    });
    expect(response.status()).toBe(200);
  }
  const firstUser = await prisma.user.findUniqueOrThrow({ where: { email: firstEmail } });
  const firstOrganization = await tenants.createOrganizationWithOwner({
    ownerUserId: firstUser.id,
    name: `Tenant A ${suffix}`,
    slug: `tenant-a-${suffix}`,
  });
  const firstBrand = await tenants.createBrand({
    organizationId: firstOrganization.id,
    ownerUserId: firstUser.id,
    name: 'A Brand',
    slug: `a-${suffix.slice(0, 8)}`,
  });
  const project = await content.createProject({
    organizationId: firstOrganization.id,
    brandId: firstBrand.id,
    title: 'Private A project',
    contentType: 'SOCIAL_POST',
  });
  await page.goto(`/login?next=/app`);
  await page.getByLabel('Email').fill(secondEmail);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  const knowledgeResponse = await page.goto(
    `/app/organizations/${firstOrganization.id}/brands/${firstBrand.id}/knowledge`,
  );
  expect(knowledgeResponse?.status()).toBe(404);
  const contentResponse = await page.goto(
    `/app/organizations/${firstOrganization.id}/brands/${firstBrand.id}/content/${project!.id}`,
  );
  expect(contentResponse?.status()).toBe(404);
});
