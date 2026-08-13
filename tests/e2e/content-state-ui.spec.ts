import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const email = `w9-state-${randomUUID()}@ams-content-factory.local`;
const password = 'w9-state-password';
const origin = `http://127.0.0.1:${process.env.E2E_PORT ?? '3000'}`;

test.use({ extraHTTPHeaders: { 'x-real-ip': '198.18.0.15' } });

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test('creates a content project and exposes BLOCKED_EXTERNAL rather than a mock draft', async ({
  page,
}) => {
  const signUp = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'W9 State E2E', email, password },
  });
  expect(signUp.status()).toBe(200);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const organization = await tenants.createOrganizationWithOwner({
    ownerUserId: user.id,
    name: 'W9 State org',
    slug: `w9-state-${randomUUID()}`,
  });
  const brand = await tenants.createBrand({
    organizationId: organization.id,
    ownerUserId: user.id,
    name: 'W9 State brand',
    slug: `w9-${randomUUID().slice(0, 8)}`,
  });

  await page.goto(`/login?next=/app/organizations/${organization.id}/brands/${brand.id}/content`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByLabel('Название проекта').fill('UI content project');
  await page.getByRole('button', { name: 'Создать проект' }).click();
  await expect(page.getByRole('heading', { name: 'UI content project' })).toBeVisible();
  await page.getByRole('link', { name: 'Открыть' }).click();
  await page.getByRole('button', { name: 'Начать исследование' }).click();
  await expect(page.getByRole('button', { name: 'Сгенерировать черновик' })).toBeVisible();
  await page.getByRole('button', { name: 'Сгенерировать черновик' }).click();
  await expect(page.getByText(/^BLOCKED_EXTERNAL:/)).toBeVisible();
  await expect(page.getByText('текущий статус: RESEARCHING')).toBeVisible();
});
