import { test, expect } from '@playwright/test';
test('creates, switches, finalizes and reopens an independent case', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Local access code').fill('ui-test-only');
  await page.getByRole('button', { name: 'Enter the room' }).click();
  await page.getByRole('button', { name: 'New case', exact: true }).click();
  await page.getByLabel('Case name', { exact: true }).fill('Kingston test file');
  await page.getByRole('button', { name: 'Create case', exact: true }).click();
  await expect(page.locator('h1:visible')).toHaveText('Kingston test file');
  await expect(page.getByRole('button', { name: 'Start team review' })).toBeDisabled();
  await page.getByRole('button', { name: 'Investigation', exact: true }).click();
  await expect(page.locator('.case-board')).not.toContainText('Morgan Ellis');
  await page.getByRole('button', { name: /^Documents/ }).click();
  await expect(page.locator('.document-table > button')).toHaveCount(0);
  await expect(page.locator('.reveal-box')).toHaveCount(0);
  await page.getByRole('button', { name: 'Finalize case', exact: true }).click();
  await page
    .getByLabel('Finalization note / outstanding handoff')
    .fill('Test closed; evidence not yet reviewed.');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Finalize case', exact: true })
    .click();
  await expect(page.getByText(/Finalized investigation · Read-only/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add or replace PDF' })).toBeDisabled();
  await page.getByRole('button', { name: 'Reopen case', exact: true }).click();
  await page.getByLabel('Reason for reopening').fill('Evidence arrived.');
  await page.getByRole('dialog').getByRole('button', { name: 'Reopen case', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add or replace PDF' })).toBeEnabled();
  await page.getByRole('button', { name: 'All cases', exact: true }).click();
  const historyRow = page.getByRole('article', { name: 'Kingston test file', exact: true });
  await historyRow.locator('summary').click();
  await historyRow.getByRole('button', { name: 'View history' }).click();
  const history = page.getByRole('dialog', { name: 'Investigation history' });
  await expect(history.locator('.case-history-list li')).toHaveCount(3);
  await expect(history.locator('.case-history-list li').nth(0)).toContainText(
    'Investigation reopened',
  );
  await expect(history.locator('.case-history-list li').nth(0)).toContainText('Evidence arrived.');
  await expect(history.locator('.case-history-list li').nth(1)).toContainText(
    'Test closed; evidence not yet reviewed.',
  );
  await expect(history.locator('.case-history-list li').nth(2)).toContainText(
    'Investigation opened',
  );
  await expect(history.locator('time')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(history).toHaveCount(0);
  await expect(historyRow.locator('summary')).toBeFocused();
  await page
    .getByRole('article', { name: 'The Alder Lane purchase', exact: true })
    .getByRole('button', { name: 'Open case', exact: true })
    .click();
  await expect(page.locator('h1:visible')).toHaveText('The Alder Lane purchase');
  await page.getByRole('button', { name: /^Documents/ }).click();
  await expect(page.locator('.document-table > button')).toHaveCount(7);
});

test('case directory filters, list lifecycle, keyboard and responsive themes', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Local access code').fill('ui-test-only');
  await page.getByRole('button', { name: 'Enter the room' }).click();
  await expect(page.getByRole('heading', { name: 'Cases', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New case', exact: true }).click();
  await page
    .getByLabel('Case name', { exact: true })
    .fill('A long transaction name for testing the case directory and outstanding handoff');
  await page.getByRole('button', { name: 'Create case', exact: true }).click();
  await page.getByRole('button', { name: 'All cases', exact: true }).click();
  await page.getByLabel('Search cases').fill('long transaction');
  const row = page.locator('.case-row').first();
  await expect(page.locator('.case-row')).toHaveCount(1);
  await expect(row).toContainText('Property not identified');
  await row.locator('summary').focus();
  await page.keyboard.press('Enter');
  await row.getByRole('button', { name: 'Finalize case', exact: true }).click();
  await page
    .getByLabel('Finalization note / outstanding handoff')
    .fill('Awaiting evidence; investigation handed off.');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Finalize case', exact: true })
    .click();
  await expect(page.getByText('No matching cases')).toBeVisible();
  await page.getByRole('button', { name: /^Finalized \d/ }).click();
  await expect(row).toContainText('Finalized');
  await page.screenshot({ path: 'artifacts/cases-light.png', fullPage: true });
  await row.locator('summary').click();
  await row.getByRole('button', { name: 'Reopen case' }).click();
  await page.getByLabel('Reason for reopening').fill('New evidence received.');
  await page.getByRole('dialog').getByRole('button', { name: 'Reopen case', exact: true }).click();
  await page.getByRole('button', { name: /^All \d/ }).click();
  await page.getByLabel('Search cases').fill('');
  await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  await expect(page.locator('.case-row-actions > button').first()).toHaveCSS(
    'background-color',
    'rgb(29, 43, 39)',
  );
  await page.screenshot({
    path: 'artifacts/cases-dark.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/cases-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test('directory retry and navigation preserve filters and a running branch', async ({ page }) => {
  let failList = true;
  await page.route('**/api/v1/cases', async (route) => {
    if (route.request().method() === 'GET' && failList) {
      failList = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Temporary list failure' }),
      });
    } else await route.continue();
  });
  await page.goto('/');
  await page.getByLabel('Local access code').fill('ui-test-only');
  await page.getByRole('button', { name: 'Enter the room' }).click();
  await expect(page.getByRole('alert')).toContainText('Temporary list failure');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByLabel('Search cases').fill('Alder');
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  await page.getByRole('button', { name: 'Branch the Deal', exact: true }).last().click();
  await page.getByLabel('Scenario name').fill('Preserved scenario');
  await page.getByRole('button', { name: 'Create branch', exact: true }).click();
  await expect(page.locator('.case-header')).toContainText('Preserved scenario');
  await page.getByRole('button', { name: 'Start team review', exact: true }).click();
  await page.getByRole('button', { name: 'All cases', exact: true }).click();
  await expect(page.getByLabel('Search cases')).toHaveValue('Alder');
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  await expect(page.locator('.case-header')).toContainText('Preserved scenario');
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
});
