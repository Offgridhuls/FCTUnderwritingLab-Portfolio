import { test, expect } from '@playwright/test';
test('selects one reviewer and displays its limited scope', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Local access code').fill('ui-test-only');
  await page.getByRole('button', { name: 'Enter the room' }).click();
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run Lead reviewer', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Run Mortgages & liens', exact: true }).click();
  await expect(page.getByText('Specialist review complete', { exact: true })).toBeVisible();
  await expect(page.locator('.notice').filter({ hasText: 'Partial scope:' })).toContainText(
    'Mortgages & liens only',
  );
  await expect(
    page.locator('.specialist-progress').getByText('Not assessed', { exact: true }),
  ).toHaveCount(5);
  await expect(page.locator('.finding-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Brief & notes', exact: true }).click();
  await expect(page.getByText(/Other specialist areas not assessed/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run Lead reviewer', exact: true })).toBeEnabled();
  await page.locator('.review-progress').screenshot({ path: 'artifacts/reviewer-run-buttons.png' });
  await expect(page.getByRole('button', { name: 'Run full review' })).toBeEnabled();
});
