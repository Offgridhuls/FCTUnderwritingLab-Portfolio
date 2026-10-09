import { test, expect } from '@playwright/test';
test('theme persists across navigation and reload with readable dark surfaces', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Local access code').fill('ui-test-only');
  await page.getByRole('button', { name: 'Enter the room' }).click();
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  await page.getByRole('button', { name: 'Start team review' }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/dark-workspace.png', fullPage: true });
  await page.getByRole('button', { name: /^Documents/ }).click();
  await expect(page.locator('.document-table')).toHaveCSS('background-color', 'rgb(29, 43, 39)');
  await page.getByRole('button', { name: /^Team discussion/ }).click();
  await page.locator('.finding-thread > summary').first().click();
  await page.screenshot({ path: 'artifacts/dark-discussion.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dark mode', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
