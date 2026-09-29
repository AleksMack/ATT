import { test as setup, expect } from '@playwright/test';
import { AUTH_FILE } from '../../playwright.config';

const { USER_LOGIN, USER_PASSWORD, USER_OTP } = process.env;

setup('authenticate', async ({ page }) => {
  // Fail with a clear message instead of typing "undefined" into the form
  const missing = Object.entries({ USER_LOGIN, USER_PASSWORD, USER_OTP })
    .filter(([, value]) => !value)
    .map(([key]) => key);
  expect(missing, `Missing keys in .env: ${missing.join(', ')}`).toEqual([]);

  await page.goto('/');

  // Step 1: login and password
  await page.getByRole('textbox', { name: 'Login' }).fill(USER_LOGIN!);
  await page.getByRole('textbox', { name: 'Password' }).fill(USER_PASSWORD!);
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 2: verification method. The first click is sometimes ignored while
  // the screen is still switching, so retry until the OTP field shows up.
  const otpField = page.getByRole('textbox', { name: 'OTP password' });
  await expect(async () => {
    await page.getByRole('button', { name: 'Use OTP from the app' }).click();
    await expect(otpField).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  // Step 3: OTP code
  await otpField.fill(USER_OTP!);
  await page.getByRole('button', { name: 'Login' }).click();

  // Main page is loaded: dashboard URL and the main menu is visible
  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('button', { name: /Трейдинг/ })).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});
