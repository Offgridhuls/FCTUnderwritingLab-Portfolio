import { test, expect } from '@playwright/test';

test('organizes evidence checks, peer discussion and human answers by reviewer and finding', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Local access code').fill('ui-test-only');
  await page.getByRole('button', { name: 'Enter the room' }).click();
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  await page.getByRole('button', { name: 'Start team review' }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
  await page.locator('.finding-card').filter({ hasText: 'Representative authority' }).click();
  await expect(page.getByRole('region', { name: 'Next action' })).toContainText(
    'Missing: Seller representative authorization',
  );
  await page.getByRole('button', { name: 'Challenge this finding' }).click();
  await page.getByLabel('Your question or challenge').fill('Which authorization do I need?');
  await page.getByRole('button', { name: 'Submit to reviewer' }).click();
  await expect(page.locator('.intervention-log')).toContainText('completed');
  await page.getByRole('button', { name: /^Team discussion/ }).click();
  const owner = page.getByRole('region', { name: 'Title & authority', exact: true });
  await owner.locator('.finding-thread > summary').click();
  await expect(owner).toContainText('Question · Title & authority');
  await expect(owner).toContainText('Answer · Title & authority');
  await expect(owner).toContainText('Question from you · completed');
  await expect(owner).toContainText('Answer from Title & authority');
  await expect(owner).toContainText('Outcome: Retained');
  const consultation = page.getByRole('region', { name: 'Reviewer consultations' });
  await expect(consultation).toContainText('Team consultations');
  await expect(
    consultation.getByRole('region', { name: 'Question from Title & authority' }),
  ).toContainText('Asks Mortgages & liens');
  await expect(
    consultation.getByRole('region', { name: 'Answer from Mortgages & liens' }),
  ).toContainText('Replies to Title & authority');
  await expect(consultation).toContainText('Finding retained');
  await expect(consultation).not.toContainText('Which authorization do I need?');
  await consultation.locator('.citations button').first().click();
  await expect(page.getByRole('complementary', { name: 'Evidence viewer' })).toContainText(
    'Page 1 of 1',
  );
  await page.getByRole('button', { name: 'Close evidence viewer' }).click();
  await page.screenshot({ path: 'artifacts/grouped-discussion.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await consultation.scrollIntoViewIfNeeded();
  await expect(
    consultation.getByRole('region', { name: 'Answer from Mortgages & liens' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await consultation.screenshot({ path: 'artifacts/consultations-mobile.png' });
});
