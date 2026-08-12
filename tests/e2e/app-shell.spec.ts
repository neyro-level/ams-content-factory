import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createPrismaClient } from '../../packages/db/src/index.js';

const prisma = createPrismaClient();
const email = `w5-shell-${randomUUID()}@ams-content-factory.local`;
const password = 'w5-shell-password';
const origin = `http://127.0.0.1:${process.env.E2E_PORT ?? '3000'}`;

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test('redirects an anonymous visitor from the protected application shell', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login\?next=\/app$/);
  await expect(page.getByRole('heading', { name: 'Вход в рабочее пространство' })).toBeVisible();
});

test('signs in through Better Auth and opens the protected application shell', async ({ page }) => {
  const signUp = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'W5 Shell E2E', email, password },
  });
  expect(signUp.status()).toBe(200);

  await page.goto('/login?next=/app');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole('heading', { name: 'Доступ к приложению подтверждён' }),
  ).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Навигация приложения' })).toBeVisible();
  await page.getByRole('link', { name: 'Организации' }).click();
  await expect(page).toHaveURL(/\/app\/organizations$/);
  await expect(page.getByRole('link', { name: 'Организации' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.getByRole('link', { name: 'Рабочее пространство' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto('/app');
  await expect(page).toHaveURL(/\/login\?next=\/app$/);
});
