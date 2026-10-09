import { test, expect } from '@playwright/test';
test('groups findings and focuses a reviewer branch', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Local access code').fill('ui-test-only');
  await page.getByRole('button', { name: 'Enter the room' }).click();
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  await page.getByRole('button', { name: 'Start team review' }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
  const mortgage = page.getByRole('region', { name: 'Mortgages & liens findings', exact: true });
  await expect(mortgage).toContainText('Payout validity');
  await expect(mortgage).not.toContainText('Representative authority');
  await page.getByLabel('Focus reviewer').selectOption('mortgage');
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await expect(page.locator('.reviewer-findings')).toHaveCount(1);
  await page
    .locator('.react-flow__node')
    .filter({ has: page.locator('.board-node.finding') })
    .filter({ hasText: 'Payout validity' })
    .click();
  await expect(page.getByRole('button', { name: 'Challenge this finding' })).toBeVisible();
  const detail = page.locator('.finding-detail');
  await expect(detail).toBeFocused();
  await expect.poll(async () => (await detail.boundingBox())!.y).toBeLessThan(360);
  await mortgage.locator('.finding-card').click();
  await expect(detail).toBeFocused();
  await expect.poll(async () => (await detail.boundingBox())!.y).toBeLessThan(360);

  await page.getByLabel('Focus reviewer').selectOption('all');
  await expect(page.locator('.react-flow__node')).toHaveCount(14);
  for (const name of ['Morgan Ellis / Jordan Vale', 'Alex Chen', 'Cedar Bank', 'Rear deck notice'])
    await expect(page.locator('.react-flow__node').filter({ hasText: name })).toBeVisible();
  await page.locator('.react-flow__node').filter({ hasText: 'Cedar Bank' }).click();
  await expect(page.getByRole('complementary', { name: 'Evidence viewer' })).toBeVisible();
  await page.getByRole('button', { name: 'Close evidence viewer' }).click();
  await page.locator('.case-board').screenshot({ path: 'artifacts/reviewer-branches.png' });
});
