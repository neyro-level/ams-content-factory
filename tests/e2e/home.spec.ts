import { expect, test } from '@playwright/test';

test('shows the truthful AMS Content Factory foundation status', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Технический фундамент' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Рабочее пространство ещё не реализовано' }),
  ).toBeVisible();
  await expect(page.getByText('0 из 4 пользовательских модулей реализовано')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Выбрать бренд' })).toBeDisabled();
});

test('fits the workspace shell on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.locator('body').evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
