import { expect, test } from '@playwright/test';

test('opens the AMS Content Factory foundation screen', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Основа операционной системы готова' }),
  ).toBeVisible();
});
