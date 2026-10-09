import { test, expect } from '@playwright/test';
test('lead summary appears above findings, links its sources and works in both themes on mobile', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Local access code').fill('ui-test-only');
  await page.getByRole('button', { name: 'Enter the room' }).click();
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  const summary = page.getByRole('region', { name: 'Lead reviewer summary', exact: true });
  await expect(summary).toContainText('Start a team review');
  await page.getByRole('button', { name: 'Start team review', exact: true }).click();
  await expect(summary).toContainText('Three documentary issues require follow-up');
  await expect(
    summary.getByRole('heading', { name: 'Investigation brief', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        !!(
          document
            .querySelector('.lead-summary')!
            .compareDocumentPosition(document.querySelector('.findings-section')!) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
    ),
  ).toBe(true);
  await expect(summary.locator('.lead-summary-sources .citations button')).toHaveCount(1);
  await summary.locator('.lead-summary-sources .citations button').click();
  await expect(page.getByRole('complementary', { name: 'Evidence viewer' })).toContainText(
    'Page 1 of 1',
  );
  await page.getByRole('button', { name: 'Close evidence viewer' }).click();
  await expect(summary.locator('.lead-action-card')).toHaveCount(3);
  await expect(summary).toContainText('Team review complete.');
  await summary.screenshot({ path: 'artifacts/lead-summary-light.png' });
  await page.getByRole('button', { name: 'Brief & notes', exact: true }).click();
  await expect(summary).toContainText('Three documentary issues');
  const card = summary.getByRole('article', { name: 'Representative authority', exact: true });
  await card.getByRole('button', { name: 'View finding', exact: true }).click();
  await expect(page.locator('.finding-detail')).toContainText('Representative authority');
  await expect(page.locator('.finding-detail')).toBeFocused();
  await page.getByRole('button', { name: 'Brief & notes', exact: true }).click();
  await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  await expect(summary).toHaveCSS('background-color', 'rgb(29, 43, 39)');
  await page.setViewportSize({ width: 390, height: 844 });
  await summary.screenshot({ path: 'artifacts/lead-summary-mobile-dark.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
