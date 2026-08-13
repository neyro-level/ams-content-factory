import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  createContentRepository,
  createPrismaClient,
  createTenantRepository,
} from '../../packages/db/src/index.js';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const content = createContentRepository(prisma);
const email = `v01-limited-${randomUUID()}@ams-content-factory.local`;
const password = 'v01-limited-capability-password';
const origin = `http://127.0.0.1:${process.env.E2E_LIMITED_PORT ?? '3001'}`;

test.use({ extraHTTPHeaders: { 'x-real-ip': '198.18.0.32' } });
test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test('V0.1 shows a truthful limited Content mode without a real AI credential', async ({
  page,
}) => {
  const signUp = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'V0.1 Limited Owner', email, password },
  });
  expect(signUp.status()).toBe(200);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const organization = await tenants.createOrganizationWithOwner({
    ownerUserId: user.id,
    name: 'V0.1 Limited Organization',
    slug: `v01-limited-${randomUUID()}`,
  });
  const brand = await tenants.createBrand({
    organizationId: organization.id,
    ownerUserId: user.id,
    name: 'V0.1 Limited Brand',
    slug: `v01-limited-${randomUUID().slice(0, 8)}`,
  });
  const result = await content.createProjectWithBrief({
    organizationId: organization.id,
    brandId: brand.id,
    title: 'Limited generation project',
    contentType: 'SOCIAL_POST',
    goal: 'Проверить ограниченный режим.',
    audience: 'Владелец продукта.',
    brief: 'Ручной brief без внешней AI-модели.',
    createdBy: user.id,
  });
  expect(result?.project.id).toBeTruthy();
  const base = `/app/organizations/${organization.id}/brands/${brand.id}`;

  await page.goto(`/login?next=${base}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('link', { name: 'Контент (Ограниченный режим)' })).toBeVisible();

  await page.goto(`${base}/content`);
  await expect(
    page.getByRole('heading', { name: 'AI-генерация пока не подключена' }),
  ).toBeVisible();
  await expect(
    page.getByText('Генерация и AI-rewrite станут доступны после безопасного подключения модели.'),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Открыть' }).click();
  const generate = page.getByRole('button', { name: 'Сгенерировать черновик' });
  await expect(generate).toBeDisabled();
  await expect(
    page.getByText('AI-генерация будет доступна после безопасного подключения модели.'),
  ).toBeVisible();
});
