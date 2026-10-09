import { test, expect } from '@playwright/test';
test('shows stage progress, actionable findings and cited reviewer questions', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Local access code').fill('ui-test-only');
  await page.getByRole('button', { name: 'Enter the room' }).click();
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Review progress' })).toBeVisible();
  await page.getByRole('button', { name: 'Start team review' }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
  await expect(page.locator('.stage-track li').filter({ hasText: 'Completed' })).toHaveCount(4);
  await expect(page.locator('.specialist-progress article')).toHaveCount(7);
  await page.locator('.finding-card').filter({ hasText: 'Representative authority' }).click();
  const detail = page.locator('.finding-detail');
  for (const name of [
    'What we know',
    'What remains uncertain',
    'What evidence would change this assessment',
    'Reviewer questions & answers',
  ])
    await expect(detail.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(detail.locator('.review-questions')).toContainText(
    'Does the supplied evidence address this issue?',
  );
  await detail.locator('.review-questions .citations button').first().click();
  await expect(page.getByRole('complementary', { name: 'Evidence viewer' })).toContainText(
    'Page 1 of 1',
  );
  await page.reload();
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  await expect(page.locator('.stage-track li').filter({ hasText: 'Completed' })).toHaveCount(4);
});
