import { test, expect } from '@playwright/test';
test('shows topic coverage, linked findings and historical absence honestly', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Local access code').fill('ui-test-only');
  await page.getByRole('button', { name: 'Enter the room' }).click();
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  await page.getByRole('button', { name: 'Start team review' }).click();
  const coverage = page.getByRole('region', { name: 'Review coverage', exact: true });
  await expect(coverage).toContainText('Assigned topics accounted for');
  await expect(coverage.locator('details')).toHaveCount(19);
  const funds = coverage
    .locator('details')
    .filter({ hasText: 'Authorized financing, deposit treatment and funds reconciliation' });
  await funds.locator('summary').click();
  await expect(funds).toContainText('Fixture assessment');
  await funds.getByRole('button', { name: 'View finding: Payout validity' }).click();
  await expect(page.locator('.finding-detail')).toBeFocused();
  await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await coverage.screenshot({ path: 'artifacts/coverage-mobile-dark.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  let historical = false;
  await page.route('**/api/v1/branches/*/snapshot', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    for (const r of data.reviews) {
      if (!historical) {
        r.coverageStatus = 'incomplete';
        r.coverage[0].gaps = ['Topic not assessed.'];
        continue;
      }
      delete r.coverageVersion;
      delete r.coverage;
      delete r.coverageStatus;
    }
    await route.fulfill({ response, json: data });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  await expect(page.getByText('Completed · Coverage incomplete', { exact: true })).toBeVisible();
  await expect(coverage).toContainText('Topic not assessed.');
  historical = true;
  await page.reload();
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  await expect(page.getByText('Coverage checklist not recorded for this review.')).toBeVisible();
});
