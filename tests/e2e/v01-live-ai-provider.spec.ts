import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const email = `v01-live-ai-${randomUUID()}@ams-content-factory.local`;
const password = 'v01-live-ai-smoke-password';
const origin = `http://127.0.0.1:${process.env.E2E_LIVE_AI_PORT ?? '3002'}`;
const isExplicitLiveSmoke =
  process.env.CONFIRM_LIVE_AI_SMOKE === 'run' && Boolean(process.env.OPENAI_API_KEY?.trim());

test.use({ extraHTTPHeaders: { 'x-real-ip': '198.18.0.33' } });
test.skip(
  !isExplicitLiveSmoke,
  'Live provider smoke is excluded until the owner explicitly confirms a securely configured key.',
);
test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test('V0.1 live AI provider: browser generation creates a persisted OpenAI version', async ({
  page,
}) => {
  expect(process.env.CONFIRM_LIVE_AI_SMOKE).toBe('run');
  expect(process.env.OPENAI_API_KEY?.trim()).toBeTruthy();

  const signUp = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'V0.1 Live AI Smoke Owner', email, password },
  });
  expect(signUp.status()).toBe(200);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const organization = await tenants.createOrganizationWithOwner({
    ownerUserId: user.id,
    name: 'V0.1 Live AI Smoke Organization',
    slug: `v01-live-ai-${randomUUID()}`,
  });
  const brand = await tenants.createBrand({
    organizationId: organization.id,
    ownerUserId: user.id,
    name: 'V0.1 Live AI Smoke Brand',
    slug: `v01-live-ai-${randomUUID().slice(0, 8)}`,
  });
  const base = `/app/organizations/${organization.id}/brands/${brand.id}`;

  await page.goto(`/login?next=${base}/content`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByLabel('Название проекта').fill('V0.1 live AI smoke material');
  await page.getByLabel('Цель').fill('Подтвердить защищённый реальный AI-вызов в V0.1.');
  await page.getByLabel('Аудитория').fill('Владелец продукта.');
  await page
    .getByLabel('Brief')
    .fill(
      'Напишите один короткий нейтральный абзац о безопасном контент-процессе без фактов, требующих проверки.',
    );
  await page.getByRole('button', { name: 'Создать проект' }).click();
  await page.getByRole('link', { name: 'Открыть' }).click();
  await page.getByRole('button', { name: 'Сгенерировать черновик' }).click();

  await expect(page.locator('pre.content-preview')).not.toHaveText('');
  const project = await prisma.contentProject.findFirstOrThrow({
    where: {
      organizationId: organization.id,
      brandId: brand.id,
      title: 'V0.1 live AI smoke material',
    },
    include: { aiExecutions: true, versions: { orderBy: { version: 'asc' } } },
  });
  expect(project.status).toBe('DRAFT');
  expect(project.versions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ version: 1, createdByType: 'USER' }),
      expect.objectContaining({ version: 2, createdByType: 'AI' }),
    ]),
  );
  expect(project.aiExecutions).toEqual([
    expect.objectContaining({ provider: 'openai', status: 'SUCCEEDED', operation: 'social-post' }),
  ]);
});
