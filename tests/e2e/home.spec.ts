import { expect, test } from '@playwright/test';

test('opens the accessible AMS Content Factory workspace shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Операционная система контента' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Нет активного бренда' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Выбрать бренд' })).toBeDisabled();
});

test('fits the workspace shell on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.locator('body').evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
