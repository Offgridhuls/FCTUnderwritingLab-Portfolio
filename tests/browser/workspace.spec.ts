import { test, expect } from '@playwright/test';
test('web workspace runs the shared review and intervention API', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('Local access code').fill('ui-test-only');
  await page.getByRole('button', { name: 'Enter the room' }).click();
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The Alder Lane purchase' })).toBeVisible();
  await page.getByRole('button', { name: 'Start team review' }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'List view' }).click();
  await page.getByRole('button', { name: 'Agreement of Purchase and Sale 1 page' }).click();
  await expect(page.getByRole('complementary', { name: 'Evidence viewer' })).toBeVisible();
  await expect
    .poll(() => page.locator('canvas').evaluate((c: any) => c.width))
    .toBeGreaterThan(500);
  await page.getByRole('button', { name: 'Close evidence viewer' }).click();
  await page.locator('.finding-card').filter({ hasText: 'Representative authority' }).click();
  await page.getByRole('button', { name: 'Challenge this finding' }).click();
  await page
    .getByLabel('Your question or challenge')
    .fill('I promise Jordan is authorized. Does that resolve this?');
  await page.getByRole('button', { name: 'Submit to reviewer' }).click();
  await expect(page.locator('.intervention-log')).toContainText('completed');
  await expect(page.locator('.intervention-log')).toContainText('retain');
  await page.getByRole('button', { name: 'Branch the Deal', exact: true }).last().click();
  await page.getByLabel('Scenario name').fill('Evidence arrived');
  await page.getByRole('button', { name: 'Create branch' }).click();
  await page
    .getByRole('button', { name: 'Seller Representative Authorization', exact: false })
    .click();
  await page
    .locator('.document-table')
    .getByRole('button', { name: /Seller Representative Authorization/ })
    .click();
  await page.getByRole('button', { name: 'Next page' }).click();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('Page 3 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'Brief & notes', exact: true }).click();
  await page.getByLabel('Human note').fill('Ask about the scope of representative authority.');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.locator('.saved-note')).toContainText('scope');
  expect(errors).toEqual([]);
});
test('keyboard and mobile access to case evidence', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Local access code').fill('ui-test-only');
  await page.getByLabel('Local access code').press('Enter');
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The Alder Lane purchase' })).toBeVisible();
  await page.getByRole('button', { name: 'Documents 7', exact: true }).click();
  await page.getByLabel('Search documents').fill('Name');
  await expect(page.locator('.document-table button')).toHaveCount(1);
  await page.locator('.document-table button').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Evidence viewer' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
});

test('polling keeps the workspace usable when the event stream disconnects', async ({ page }) => {
  await page.route('**/api/v1/events/stream*', (route) => route.abort());
  await page.goto('/');
  await page.getByLabel('Local access code').fill('ui-test-only');
  await page.getByRole('button', { name: 'Enter the room' }).click();
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  await page.getByRole('button', { name: 'Start team review' }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.finding-card')).toHaveCount(4);
});
