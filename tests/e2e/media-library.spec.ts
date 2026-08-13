import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const email = `w10-media-${randomUUID()}@ams-content-factory.local`;
const password = 'w10-media-password';
const origin = `http://127.0.0.1:${process.env.E2E_PORT ?? '3000'}`;

test.use({ extraHTTPHeaders: { 'x-real-ip': '198.18.0.17' } });

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test('shows the brand media library and does not fake an upload without S3', async ({ page }) => {
  const signUp = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'W10 Media E2E', email, password },
  });
  expect(signUp.status()).toBe(200);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const organization = await tenants.createOrganizationWithOwner({
    ownerUserId: user.id,
    name: 'W10 Media org',
    slug: `w10-media-${randomUUID()}`,
  });
  const brand = await tenants.createBrand({
    organizationId: organization.id,
    ownerUserId: user.id,
    name: 'W10 Media brand',
    slug: `w10-${randomUUID().slice(0, 8)}`,
  });

  await page.goto(`/login?next=/app/organizations/${organization.id}/brands/${brand.id}/media`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { name: 'Приватная медиатека бренда' })).toBeVisible();
  await expect(page.getByText('В медиатеке этого бренда пока нет файлов.')).toBeVisible();
  await page.getByLabel('Файл для приватной медиатеки').setInputFiles({
    name: 'demo.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
  });
  await page.getByRole('button', { name: 'Загрузить файл' }).click();
  await expect(page.getByText(/^BLOCKED_EXTERNAL:/)).toBeVisible();
  await expect(
    prisma.mediaAsset.count({ where: { organizationId: organization.id, brandId: brand.id } }),
  ).resolves.toBe(0);
});
