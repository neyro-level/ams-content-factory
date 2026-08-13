import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const email = `v01-flow-${randomUUID()}@ams-content-factory.local`;
const password = 'v01-editorial-password';
const origin = `http://127.0.0.1:${process.env.E2E_PORT ?? '3000'}`;

test.use({ extraHTTPHeaders: { 'x-real-ip': '198.18.0.29' } });
test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test('V0.1 editorial flow: context, knowledge, draft, review, READY and copy', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-write'], { origin });
  const signUp = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'V0.1 Owner', email, password },
  });
  expect(signUp.status()).toBe(200);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const organization = await tenants.createOrganizationWithOwner({
    ownerUserId: user.id,
    name: 'V0.1 Organization',
    slug: `v01-${randomUUID()}`,
  });
  const brand = await tenants.createBrand({
    organizationId: organization.id,
    ownerUserId: user.id,
    name: 'V0.1 Brand',
    slug: `v01-${randomUUID().slice(0, 8)}`,
  });
  const base = `/app/organizations/${organization.id}/brands/${brand.id}`;

  await page.goto(`/login?next=${base}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { name: 'V0.1 Brand' })).toBeVisible();
  await page.getByRole('link', { name: /^Бренд/ }).click();
  await page.getByLabel('Позиционирование').fill('Полезный контент для B2B');
  await page.getByLabel('Тон коммуникации').fill('Спокойно и точно');
  await page.getByRole('button', { name: 'Сохранить контекст' }).click();
  await expect(page.getByRole('status')).toContainText('Контекст бренда сохранён');

  await page.goto(`${base}/knowledge`);
  await expect(page.getByRole('heading', { name: 'Документы бренда' })).toBeVisible();
  const textForm = page.getByRole('heading', { name: 'Текст', exact: true }).locator('..');
  await textForm.getByLabel('Название').fill('Факты бренда');
  await textForm
    .getByLabel('Содержимое')
    .fill('Мы работаем с B2B-командами и объясняем сложные процессы.');
  await textForm.getByRole('button', { name: 'Добавить текст' }).click();
  await expect(page.getByRole('status')).toContainText('добавлен в базу знаний');
  await expect(page.getByText('Текст · 1 фрагм.')).toBeVisible();
  await expect(page.getByText('Готов к использованию')).toBeVisible();
  await expect(page.getByText('READY', { exact: true })).toHaveCount(0);

  await page.goto(`${base}/content`);
  await page.getByLabel('Название проекта').fill('Первый V0.1 материал');
  await page.getByLabel('Цель').fill('Показать рабочий редакционный процесс.');
  await page.getByLabel('Аудитория').fill('Владельцы B2B-команд.');
  await page.getByLabel('Brief').fill('Расскажите, как начать работать с контентом.');
  await page.getByRole('button', { name: 'Создать проект' }).click();
  await expect(page.getByRole('link', { name: 'Открыть' })).toBeVisible();
  const project = await prisma.contentProject.findFirstOrThrow({
    where: { organizationId: organization.id, brandId: brand.id, title: 'Первый V0.1 материал' },
    include: { versions: { orderBy: { version: 'asc' } } },
  });
  expect(project.nextVersion).toBe(2);
  expect(project.versions).toEqual([
    expect.objectContaining({
      version: 1,
      createdByType: 'USER',
      createdByUserId: user.id,
      brief: 'Расскажите, как начать работать с контентом.',
      body: 'Расскажите, как начать работать с контентом.',
    }),
  ]);
  await page.getByRole('link', { name: 'Открыть' }).click();
  await page.getByRole('button', { name: 'Сгенерировать черновик' }).click();
  await expect(page.locator('pre.content-preview')).toHaveText(
    'Детерминированный тестовый черновик.',
  );
  await page.getByLabel('Отредактированный текст').fill('Ручная редакторская версия.');
  await page.getByRole('button', { name: 'Сохранить новой версией' }).click();
  await expect(page.locator('pre.content-preview')).toHaveText('Ручная редакторская версия.');
  await page.getByLabel('Инструкция для новой AI-версии').fill('Сделай текст короче.');
  await page.getByRole('button', { name: 'Создать следующую версию' }).click();
  await expect(page.locator('pre.content-preview')).toHaveText(
    'Детерминированный тестовый черновик.',
  );
  await expect(page.getByRole('heading', { name: 'Версия 4' })).toBeVisible();
  await page.getByRole('button', { name: 'Запустить fact-check' }).click();
  await page.getByRole('button', { name: 'Отправить на review' }).click();
  await page.getByRole('button', { name: 'Одобрить вручную' }).click();
  await page.getByRole('button', { name: 'Подготовить финальный текст' }).click();
  await expect(page.getByText('текущий статус: Готово для ручной публикации')).toBeVisible();
  await page.getByRole('button', { name: 'Скопировать финальный текст' }).click();
  await expect(page.getByText('Текст скопирован для ручной публикации.')).toBeVisible();
});
