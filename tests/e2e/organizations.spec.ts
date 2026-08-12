import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createPrismaClient } from '../../packages/db/src/index.js';

const prisma = createPrismaClient();
const email = `w5-organizations-${randomUUID()}@ams-content-factory.local`;
const password = 'w5-organizations-password';
const organizationName = 'Первая организация E2E';
const origin = `http://127.0.0.1:${process.env.E2E_PORT ?? '3000'}`;

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test('creates and lists an organization for the authenticated owner', async ({ page }) => {
  const signUp = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'W5 Organizations E2E', email, password },
  });
  expect(signUp.status()).toBe(200);

  await page.goto('/login?next=/app/organizations');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/app\/organizations$/);

  await expect(page.getByText('У вас пока нет активных организаций.')).toBeVisible();
  await page.getByLabel('Название организации').fill(organizationName);
  await page.getByRole('button', { name: 'Создать организацию' }).click();

  await expect(page.getByRole('status')).toContainText('создана');
  await expect(page.getByRole('heading', { name: organizationName })).toBeVisible();
  await expect(page.getByText('OWNER')).toBeVisible();
});
