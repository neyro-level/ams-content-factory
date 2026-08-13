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
const testIp = `198.18.0.${(Number.parseInt(randomUUID().slice(0, 2), 16) % 250) + 1}`;

test.use({ extraHTTPHeaders: { 'x-real-ip': testIp } });

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
  await expect(page.getByRole('heading', { name: brandName })).toBeVisible();
  await expect(page.getByText('ru-RU')).toBeVisible();
  await page.getByRole('link', { name: 'Открыть рабочее пространство' }).click();
  await expect(page.getByRole('heading', { name: brandName })).toBeVisible();
  await page.locator('.app-navigation').getByRole('link', { name: 'База знаний' }).click();
  await expect(page.getByRole('heading', { name: 'Документы бренда' })).toBeVisible();
  await expect(page.getByText('У этого бренда пока нет документов базы знаний.')).toBeVisible();

  const textForm = page.locator('form').filter({ hasText: 'Добавить текст' });
  await textForm.getByLabel('Название').fill('Текстовый источник E2E');
  await textForm.getByLabel('Содержимое').fill('Надёжный текстовый источник для базы знаний.');
  await textForm.getByRole('button', { name: 'Добавить текст' }).click();
  await expect(page.getByRole('heading', { name: 'Текстовый источник E2E' })).toBeVisible();

  const searchPanel = page.locator('.knowledge-search');
  const searchForm = searchPanel.locator('form');
  await searchForm.getByLabel('Запрос').fill('база знаний');
  await searchForm.getByRole('button', { name: 'Найти' }).click();
  await expect(searchPanel.getByRole('status')).toContainText(
    'Поиск по базе знаний будет доступен после подключения AI-индекса.',
  );

  await page.getByRole('link', { name: 'К брендам' }).click();
  await page.getByRole('link', { name: 'Открыть рабочее пространство' }).click();
  await page.locator('.app-navigation').getByRole('link', { name: 'Исследования' }).click();
  await expect(page.getByRole('heading', { name: 'Источники и материалы' })).toBeVisible();
  const researchWorkspace = page.locator('.research-workspace');
  await expect(researchWorkspace.getByRole('button', { name: 'Найти источники' })).toBeDisabled();

  await page.getByRole('link', { name: 'К брендам' }).click();
  await page.getByRole('link', { name: 'Открыть рабочее пространство' }).click();
  await page.locator('.app-navigation').getByRole('link', { name: 'База знаний' }).click();
  await expect(page).toHaveURL(/\/knowledge$/);

  const organization = await prisma.organization.findFirstOrThrow({
    where: { memberships: { some: { user: { email } } } },
    select: { id: true },
  });
  const brand = await prisma.brand.findFirstOrThrow({
    where: { organizationId: organization.id, name: brandName },
    select: { id: true },
  });
  await prisma.knowledgeDocument.create({
    data: {
      organizationId: organization.id,
      brandId: brand.id,
      title: 'Неудачный источник E2E',
      type: 'TEXT',
      sourceText: 'Сохранённый текст для повторной обработки в браузерном сценарии.',
      status: 'FAILED',
    },
  });
  await page.reload();
  await expect(page).toHaveURL(/\/knowledge$/);
  const failedDocument = page.getByRole('listitem').filter({ hasText: 'Неудачный источник E2E' });
  await expect(failedDocument.getByText('Не удалось обработать')).toBeVisible();
  await failedDocument.getByRole('button', { name: 'Повторить' }).click();
  await expect(failedDocument.getByText('Готов к использованию')).toBeVisible();
});
