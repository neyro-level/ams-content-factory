import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const email = `w12-calendar-${randomUUID()}@ams-content-factory.local`;
const password = 'w12-calendar-password';
const origin = `http://127.0.0.1:${process.env.E2E_PORT ?? '3000'}`;
test.use({ extraHTTPHeaders: { 'x-real-ip': '198.18.0.19' } });

function localDateTime(daysFromNow: number) {
  const value = new Date();
  value.setDate(value.getDate() + daysFromNow);
  value.setHours(9, 0, 0, 0);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T09:00`;
}

const initialScheduledLocalTime = localDateTime(1);
const rescheduledLocalTime = localDateTime(2);
const calendarDate = initialScheduledLocalTime.slice(0, 10);

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test('shows protected week and month publication calendar views for the active brand', async ({
  page,
}) => {
  const signUp = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'W12 Calendar E2E', email, password },
  });
  expect(signUp.status()).toBe(200);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const organization = await tenants.createOrganizationWithOwner({
    ownerUserId: user.id,
    name: 'W12 Calendar org',
    slug: `w12-calendar-${randomUUID()}`,
  });
  const brand = await tenants.createBrand({
    organizationId: organization.id,
    ownerUserId: user.id,
    name: 'W12 Calendar brand',
    slug: `w12-${randomUUID().slice(0, 8)}`,
  });
  const project = await prisma.contentProject.create({
    data: {
      organizationId: organization.id,
      brandId: brand.id,
      title: 'Calendar E2E publication',
      contentType: 'SOCIAL_POST',
      status: 'APPROVED',
    },
  });
  const variant = await prisma.platformVariant.create({
    data: { contentProjectId: project.id, platform: 'VK', caption: 'Calendar E2E caption' },
  });
  const account = await prisma.socialAccount.create({
    data: {
      brandId: brand.id,
      platform: 'VK',
      externalAccountId: 'calendar-e2e-vk',
      name: 'Calendar E2E VK',
    },
  });
  const scheduled = await prisma.publication.create({
    data: {
      organizationId: organization.id,
      brandId: brand.id,
      contentProjectId: project.id,
      platformVariantId: variant.id,
      socialAccountId: account.id,
      status: 'QUEUED',
      scheduledAt: new Date(initialScheduledLocalTime),
    },
  });
  const unscheduled = await prisma.publication.create({
    data: {
      organizationId: organization.id,
      brandId: brand.id,
      contentProjectId: project.id,
      platformVariantId: variant.id,
      socialAccountId: account.id,
    },
  });

  await page.goto(
    `/login?next=/app/organizations/${organization.id}/brands/${brand.id}/calendar?view=week%26date=${calendarDate}`,
  );
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { name: 'Календарь публикаций' })).toBeVisible();
  await expect(
    page.getByLabel('Запланированные публикации').getByText('Calendar E2E publication'),
  ).toBeVisible();
  await page.getByLabel('Новое время публикации').fill(rescheduledLocalTime);
  await page.getByRole('button', { name: 'Перенести' }).click();
  await expect
    .poll(async () =>
      (
        await prisma.publication.findUniqueOrThrow({ where: { id: scheduled.id } })
      ).scheduledAt?.toISOString(),
    )
    .toBe(new Date(rescheduledLocalTime).toISOString());
  await expect(
    page.getByLabel('Черновики без времени публикации').getByText('Calendar E2E publication'),
  ).toBeVisible();
  await page.getByLabel('Время публикации', { exact: true }).fill(rescheduledLocalTime);
  await page.getByRole('button', { name: 'Запланировать' }).click();
  await expect
    .poll(
      async () =>
        (await prisma.publication.findUniqueOrThrow({ where: { id: unscheduled.id } })).status,
    )
    .toBe('QUEUED');
  await expect(page.getByText('Нет черновиков, ожидающих планирования.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Неделя' })).toBeVisible();
  await page.getByRole('link', { name: 'Месяц' }).click();
  await expect(page).toHaveURL(/view=month/);
  await expect(
    page.getByRole('heading', { name: 'Calendar E2E publication' }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Отменить публикацию' }).first().click();
  await expect
    .poll(
      async () =>
        (await prisma.publication.findUniqueOrThrow({ where: { id: scheduled.id } })).status,
    )
    .toBe('CANCELLED');
  await page.reload();
  await expect(
    page.getByLabel('Запланированные публикации').getByText('Calendar E2E publication'),
  ).toHaveCount(1);
  await prisma.publication.update({
    where: { id: scheduled.id },
    data: { status: 'OUTCOME_UNKNOWN' },
  });
  await prisma.socialAccount.update({
    where: { id: account.id },
    data: { status: 'EXPIRED' },
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Требуют внимания' })).toBeVisible();
  await expect(page.getByLabel('Проблемы публикаций')).toContainText('OUTCOME_UNKNOWN');
  await expect(page.getByText('Не создавайте повторную публикацию')).toBeVisible();
  await expect(page.getByLabel('Проблемные аккаунты')).toContainText('EXPIRED');
  await expect(page.getByRole('link', { name: 'Открыть аккаунты бренда' })).toBeVisible();
});
