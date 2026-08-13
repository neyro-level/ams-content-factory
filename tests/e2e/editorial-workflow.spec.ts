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
const email = `w9-editorial-${randomUUID()}@ams-content-factory.local`;
const password = 'w9-editorial-password';
const origin = `http://127.0.0.1:${process.env.E2E_PORT ?? '3000'}`;

test.use({ extraHTTPHeaders: { 'x-real-ip': '198.18.0.16' } });

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test('moves a fact-checked project through manual review and approval', async ({ page }) => {
  const signUp = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'W9 Editorial E2E', email, password },
  });
  expect(signUp.status()).toBe(200);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const organization = await tenants.createOrganizationWithOwner({
    ownerUserId: user.id,
    name: 'W9 Editorial org',
    slug: `w9-editorial-${randomUUID()}`,
  });
  const brand = await tenants.createBrand({
    organizationId: organization.id,
    ownerUserId: user.id,
    name: 'W9 Editorial brand',
    slug: `w9-${randomUUID().slice(0, 8)}`,
  });
  const project = await content.createProject({
    organizationId: organization.id,
    brandId: brand.id,
    title: 'W9 review project',
    contentType: 'SOCIAL_POST',
  });
  if (!project) throw new Error('E2E content project could not be created.');
  for (const [from, to] of [
    ['IDEA', 'RESEARCHING'],
    ['RESEARCHING', 'DRAFT'],
    ['DRAFT', 'FACT_CHECK'],
  ] as const)
    await content.transition({
      organizationId: organization.id,
      brandId: brand.id,
      id: project.id,
      from,
      to,
    });

  await page.goto(
    `/login?next=/app/organizations/${organization.id}/brands/${brand.id}/content/${project.id}`,
  );
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('button', { name: 'Отправить на review' })).toBeVisible();
  await page.getByRole('button', { name: 'Отправить на review' }).click();
  await expect(page.getByRole('button', { name: 'Одобрить вручную' })).toBeVisible();
  await page.getByRole('button', { name: 'Одобрить вручную' }).click();
  await expect(page.getByText('текущий статус: APPROVED')).toBeVisible();
  await expect(
    prisma.approval.findFirst({ where: { contentProjectId: project.id, reviewerUserId: user.id } }),
  ).resolves.toEqual(expect.objectContaining({ status: 'APPROVED' }));
});
