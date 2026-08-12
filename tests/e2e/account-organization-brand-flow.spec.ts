import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createPrismaClient } from '../../packages/db/src/index.js';

const prisma = createPrismaClient();
const suffix = randomUUID().slice(0, 8);
const email = `w5-flow-${suffix}@ams-content-factory.local`;
const password = 'w5-real-flow-password';
const organizationName = `W5 flow ${suffix}`;
const brandName = `W5 brand ${suffix}`;
const origin = `http://127.0.0.1:${process.env.E2E_PORT ?? '3000'}`;

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test('persists an owner and managed brand through the authenticated application flow', async ({
  page,
}) => {
  const signUp = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'W5 Real Flow E2E', email, password },
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

  await page.getByLabel('Название бренда').fill(brandName);
  await page.getByRole('button', { name: 'Создать бренд' }).click();
  await expect(page.getByRole('status')).toContainText('создан');
  await expect(page.getByRole('heading', { name: brandName })).toBeVisible();

  const user = await prisma.user.findUnique({ where: { email } });
  expect(user).not.toBeNull();

  const organization = await prisma.organization.findUnique({
    where: { slug: `w5-flow-${suffix}` },
    include: { memberships: { where: { userId: user!.id } } },
  });
  expect(organization).not.toBeNull();
  expect(organization!.status).toBe('ACTIVE');
  expect(organization!.memberships).toEqual([
    expect.objectContaining({ userId: user!.id, role: 'OWNER', status: 'ACTIVE' }),
  ]);

  const brand = await prisma.brand.findFirst({
    where: { organizationId: organization!.id, name: brandName },
    include: { accesses: { where: { userId: user!.id } } },
  });
  expect(brand).not.toBeNull();
  expect(brand!.status).toBe('ACTIVE');
  expect(brand!.accesses).toEqual([expect.objectContaining({ userId: user!.id, role: 'MANAGE' })]);

  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(`/app/organizations/${organization!.id}/brands`);
  await expect(page).toHaveURL(/\/login\?next=\/app$/);
});
