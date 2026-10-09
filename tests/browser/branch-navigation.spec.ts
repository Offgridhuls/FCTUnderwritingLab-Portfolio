import { test, expect } from '@playwright/test';

test('branch navigation cannot submit evidence against the previous workspace', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Local access code').fill('ui-test-only');
  await page.getByRole('button', { name: 'Enter the room' }).click();
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  const cases = await (await page.request.get('/api/v1/cases')).json();
  const originalId = cases[0].branchIds[0];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/v1/branches/*/snapshot', async (route) => {
    if (!route.request().url().includes(originalId)) await gate;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Branch the Deal', exact: true }).last().click();
  await page.getByLabel('Scenario name').fill('Delayed branch');
  await page.getByRole('button', { name: 'Create branch' }).click();
  await expect(page.getByText('Opening the case…')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Seller Representative Authorization' }),
  ).toHaveCount(0);
  release();
  await expect(page.getByRole('heading', { name: 'Evidence library', exact: true })).toBeVisible();
  const revealed = page.waitForResponse((response) => response.url().endsWith('/documents/reveal'));
  await page
    .getByRole('button', { name: 'Seller Representative Authorization', exact: true })
    .click();
  const response = await revealed;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON().branchId).not.toBe(originalId);
  await expect(page.locator('.document-table button')).toHaveCount(8);
  const original = await (await page.request.get(`/api/v1/branches/${originalId}/snapshot`)).json();
  expect(original.snapshot.documents).toHaveLength(7);
});
