import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const email = `w14-dashboard-${randomUUID()}@ams-content-factory.local`;
const password = 'w14-dashboard-password';
const origin = `http://127.0.0.1:${process.env.E2E_PORT ?? '3000'}`;

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test('shows the protected active-brand analytics dashboard from persisted snapshots', async ({
  page,
}) => {
  const signUp = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'W14 Dashboard E2E', email, password },
  });
  expect(signUp.status()).toBe(200);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const organization = await tenants.createOrganizationWithOwner({
    ownerUserId: user.id,
    name: 'W14 Dashboard org',
    slug: `w14-dashboard-${randomUUID()}`,
  });
  const brand = await tenants.createBrand({
    organizationId: organization.id,
    ownerUserId: user.id,
    name: 'W14 Dashboard brand',
    slug: `w14-${randomUUID().slice(0, 8)}`,
  });
  const project = await prisma.contentProject.create({
    data: {
      organizationId: organization.id,
      brandId: brand.id,
      title: 'Dashboard E2E content',
      contentType: 'SOCIAL_POST',
      status: 'APPROVED',
    },
  });
  const variant = await prisma.platformVariant.create({
    data: { contentProjectId: project.id, platform: 'VK', caption: 'Dashboard E2E caption' },
  });
  const account = await prisma.socialAccount.create({
    data: {
      brandId: brand.id,
      platform: 'VK',
      externalAccountId: `dashboard-e2e-${randomUUID()}`,
      name: 'Dashboard E2E VK',
    },
  });
  const publication = await prisma.publication.create({
    data: {
      organizationId: organization.id,
      brandId: brand.id,
      contentProjectId: project.id,
      platformVariantId: variant.id,
      socialAccountId: account.id,
      status: 'PUBLISHED',
      publishedAt: new Date('2026-08-12T00:00:00.000Z'),
      externalPostId: 'dashboard-e2e-post',
    },
  });
  await prisma.metricSnapshot.create({
    data: {
      brandId: brand.id,
      publicationId: publication.id,
      capturedAt: new Date('2026-08-14T00:00:00.000Z'),
      views: 150,
      reach: 100,
      likes: 12,
      comments: 3,
      rawMetrics: {},
    },
  });

  await page.goto(`/login?next=/app/organizations/${organization.id}/brands/${brand.id}/analytics`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { name: 'Результаты контента' })).toBeVisible();
  await expect(page.getByLabel('Сводные метрики')).toContainText('150');
  await expect(page.getByRole('heading', { name: 'Сравнение платформ' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Лучший контент' })).toBeVisible();
  await expect(
    page
      .getByRole('heading', { name: 'Лучший контент' })
      .locator('..')
      .getByRole('heading', { name: 'Dashboard E2E content' }),
  ).toBeVisible();
});
