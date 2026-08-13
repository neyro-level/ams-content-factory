import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  createPrismaClient,
  createPublishingRepository,
  createTenantRepository,
} from '../../packages/db/src/index.js';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const publishing = createPublishingRepository(prisma);
const email = `w11-social-${randomUUID()}@ams-content-factory.local`;
const password = 'w11-social-password';
const origin = `http://127.0.0.1:${process.env.E2E_PORT ?? '3000'}`;

test.use({ extraHTTPHeaders: { 'x-real-ip': '198.18.0.20' } });

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test('shows only the active brand social accounts without exposing a token form', async ({
  page,
}) => {
  const signUp = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'W11 Social E2E', email, password },
  });
  expect(signUp.status()).toBe(200);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const organization = await tenants.createOrganizationWithOwner({
    ownerUserId: user.id,
    name: 'W11 Social org',
    slug: `w11-social-${randomUUID()}`,
  });
  const brand = await tenants.createBrand({
    organizationId: organization.id,
    ownerUserId: user.id,
    name: 'W11 Social brand',
    slug: `w11-${randomUUID().slice(0, 8)}`,
  });
  await publishing.createSocialAccount({
    organizationId: organization.id,
    brandId: brand.id,
    platform: 'VK',
    externalAccountId: 'vk-e2e',
    name: 'VK for E2E',
    username: 'w11_e2e',
  });

  await page.goto(
    `/login?next=/app/organizations/${organization.id}/brands/${brand.id}/social-accounts`,
  );
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page.getByRole('heading', { name: 'Аккаунты бренда' })).toBeVisible();
  await expect(page.getByText('VK for E2E')).toBeVisible();
  await expect(page.getByText('CONNECTED', { exact: true })).toBeVisible();
  await expect(page.getByText('Защищённый OAuth-поток', { exact: false })).toBeVisible();
  await expect(page.getByLabel(/token|токен/i)).toHaveCount(0);
});
