import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://bravounleashed.com/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
});
test('home, offline journal, edit, and restart work at phone sizes', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Book your first session' })).toBeVisible();
  await page.getByRole('tab', { name: 'Journal', exact: true }).click();
  await page.getByRole('button', { name: 'Log a practice session' }).click();
  await page.getByLabel('Dog’s name', { exact: true }).fill('Gunner');
  await page.getByRole('radio', { name: 'Recall', exact: true }).click();
  await page.getByLabel('Practice time in minutes').fill('15');
  await page.getByLabel('Practice notes').fill('Calm recall practice in the field.');
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByText('Calm recall practice in the field.')).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Journal', exact: true }).click();
  await expect(page.getByText('Calm recall practice in the field.')).toBeVisible();
  await page.getByRole('button', { name: 'Edit Gunner entry' }).click();
  await page.getByLabel('Practice notes').fill('Better focus today.');
  await page.getByRole('button', { name: 'Save practice', exact: true }).click();
  await expect(page.getByText('Better focus today.')).toBeVisible();
  await page.getByRole('button', { name: 'Delete Gunner entry' }).click();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page.getByText('Better focus today.')).toBeVisible();
  await page.getByRole('button', { name: 'Delete Gunner entry' }).click();
  await page.getByRole('button', { name: 'Delete entry', exact: true }).click();
  await expect(page.getByText('Every rep counts.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Every rep counts.')).toBeVisible();
  await page.getByRole('tab', { name: 'My Bravo', exact: true }).click();
  await page.getByRole('button', { name: 'Open my account', exact: true }).click();
  await expect(page.getByText('bravounleashed.com', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close portal', exact: true }).last().click();
  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Book your first session' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('current service overrides appear and closed programs stay hidden', async ({ page }) => {
  await page.route('https://bravounleashed.com/api/config', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ connected: true, services: [
    { id: 'training', name: 'Professional training', description: 'Private mobile training.', cents: 24500, interval: 'month', enabled: true },
    { id: 'online', name: 'Online training', description: 'Lessons', cents: 7500, interval: 'month', enabled: false },
  ] }) }));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Training', exact: true }).click();
  await expect(page.getByText('$245 / month', { exact: true })).toBeVisible();
  await expect(page.getByText('Online training', { exact: true })).toHaveCount(0);
});
