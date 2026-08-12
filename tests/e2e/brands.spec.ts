import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createPrismaClient } from '../../packages/db/src/index.js';

const prisma = createPrismaClient();
const email = `w5-brands-${randomUUID()}@ams-content-factory.local`;
const password = 'w5-brands-password';
const organizationName = 'Организация бренда E2E';
const brandName = 'Первый бренд E2E';
const origin = `http://127.0.0.1:${process.env.E2E_PORT ?? '3000'}`;

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test('creates a brand inside the current authenticated organization', async ({ page }) => {
  const signUp = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'W5 Brands E2E', email, password },
  });
  expect(signUp.status()).toBe(200);

  await page.goto('/login?next=/app/organizations');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/app\/organizations$/);

  await page.getByLabel('Название организации').fill(organizationName);
  await page.getByRole('button', { name: 'Создать организацию' }).click();
  await expect(page.getByRole('heading', { name: organizationName })).toBeVisible();
  await page.getByRole('link', { name: 'Бренды' }).click();
  await expect(page.getByRole('heading', { name: 'Бренды организации' })).toBeVisible();

  await page.getByLabel('Название бренда').fill(brandName);
  await page.getByRole('button', { name: 'Создать бренд' }).click();
  await expect(page.getByRole('status')).toContainText('создан');
  await expect(page.getByRole('heading', { name: brandName })).toBeVisible();
  await expect(page.getByText('ru-RU')).toBeVisible();
});
