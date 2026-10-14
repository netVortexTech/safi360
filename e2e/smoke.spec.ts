import { expect, test } from '@playwright/test';

test.describe('experience shells', () => {
  test('ops portal asks for sign-in before anything else', async ({ page }) => {
    await page.goto('/ops');
    await expect(page).toHaveURL(/\/ops\/login$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');
    await expect(page.getByLabel(/phone number/i)).toBeVisible();
  });

  test('deep links inside ops are protected too', async ({ page }) => {
    await page.goto('/ops/services');
    await expect(page).toHaveURL(/\/ops\/login$/);
    await page.goto('/ops/staff');
    await expect(page).toHaveURL(/\/ops\/login$/);
  });

  test('customer portal is Swahili by default', async ({ page }) => {
    await page.goto('/usafi-bora');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Weka oda ya usafi');
  });

  test('customer portal switches to English via ?lang=en', async ({ page }) => {
    await page.goto('/usafi-bora?lang=en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Book a cleaning');
  });

  test('field app renders', async ({ page }) => {
    await page.goto('/field');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('unknown nested routes show a not-found state', async ({ page }) => {
    await page.goto('/ops/does-not-exist');
    await expect(page.getByRole('alert')).toContainText(/not found|haupo/i);
  });
});
