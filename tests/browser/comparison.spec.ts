import { test, expect } from '@playwright/test';
test('compares explicit branches and reviews, opens historical findings and source pages', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.getByLabel('Local access code').fill('ui-test-only');
  await page.getByRole('button', { name: 'Enter the room' }).click();
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  const first = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/reviews') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Start team review' }).click();
  const original = await (await first).json();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Branch the Deal', exact: true }).last().click();
  await page.getByLabel('Scenario name').fill('Comparison branch');
  await page.getByRole('button', { name: 'Create branch' }).click();
  await page.getByRole('button', { name: 'Start team review' }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Compare branches', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Branch comparison', exact: true });
  await expect(panel.getByLabel('Before branch', { exact: true })).toHaveValue(original.branchId);
  await expect(panel).toContainText('No substantive topic status changes');
  await expect(panel.getByRole('heading', { name: 'Comparison at a glance' })).toBeVisible();
  await expect(panel.locator('.comparison-topic-toggle').first()).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await panel.getByLabel('Topic visibility').selectOption('all');
  await expect(panel.locator('.comparison-topic')).toHaveCount(19);
  await panel.getByLabel('Comparison reviewer').selectOption('identity');
  await expect(panel.locator('.comparison-topic')).toHaveCount(2);
  await expect(panel.locator('.comparison-visible')).toContainText('of 19 topics');
  await panel.getByLabel('Comparison reviewer').selectOption('');
  await panel.locator('.comparison-count.outcome-action').click();
  await expect(panel.locator('.comparison-count.outcome-action')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(panel.locator('.comparison-outcome-group')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Clear outcome filter' }).click();
  await panel.getByText('Choose reviews', { exact: true }).click();
  await panel.getByLabel('Before review', { exact: true }).selectOption(original.id);
  await expect(panel.locator('.comparison-topic').first()).toContainText('Still needs action');
  await panel.locator('.comparison-topic-toggle').first().click();
  await page.waitForResponse((r) => r.url().includes('/api/v1/comparisons?'));
  await expect(panel.locator('.comparison-topic-toggle').first()).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await panel.screenshot({ path: 'artifacts/comparison-desktop-light.png' });
  await panel.locator('.topic-side').first().getByRole('button', { name: /p\.1/ }).first().click();
  await expect(page.getByRole('complementary', { name: 'Evidence viewer' })).toBeVisible();
  await page.getByRole('button', { name: 'Close evidence viewer' }).click();
  await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.screenshot({ path: 'artifacts/comparison-mobile-dark.png' });
  await panel
    .locator('.comparison-topic')
    .first()
    .screenshot({ path: 'artifacts/comparison-topic-mobile-dark.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await panel
    .locator('.topic-side')
    .first()
    .getByRole('button', { name: /View finding/ })
    .first()
    .click();
  await expect(page.locator('.finding-detail')).toBeFocused();
  await expect(page.locator('#history')).toHaveValue(original.id);
  await page.getByRole('button', { name: 'Compare branches', exact: true }).click();
  await expect(panel.getByLabel('Before branch', { exact: true })).toHaveValue(original.branchId);
  await panel.getByLabel('After branch', { exact: true }).selectOption(original.branchId);
  await expect(panel.getByText('Select two different branches.')).toBeVisible();
  const options = await panel
    .getByLabel('After branch', { exact: true })
    .locator('option')
    .evaluateAll((items) => items.map((x) => (x as HTMLOptionElement).value));
  const child = options.find((x) => x && x !== original.branchId)!;
  await page.route(
    '**/api/v1/comparisons?**',
    (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Comparison temporarily unavailable' }),
      }),
    { times: 1 },
  );
  await panel.getByLabel('After branch', { exact: true }).selectOption(child);
  await expect(panel.getByRole('alert')).toContainText('Comparison temporarily unavailable');
  await panel.getByRole('button', { name: 'Retry comparison' }).click();
  await expect(panel).toContainText('No substantive topic status changes');
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve)),
    requested = new Promise<void>((resolve) => (started = resolve));
  await page.route('**/api/v1/comparisons?**', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    if (route.request().url().includes('beforeReviewId=')) {
      started();
      await gate;
      data.reasons = ['STALE RESPONSE'];
    }
    await route.fulfill({ response, json: data });
  });
  await panel.getByText('Choose reviews', { exact: true }).click();
  await panel.getByLabel('Before review', { exact: true }).selectOption(original.id);
  await requested;
  await panel.getByLabel('Before review', { exact: true }).selectOption('');
  await expect(panel).toContainText('No substantive topic status changes');
  release();
  await expect(panel.getByText('STALE RESPONSE')).toHaveCount(0);
  await page.unroute('**/api/v1/comparisons?**');
  await page.route('**/api/v1/comparisons?**', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const followup = {
      ...data.topics[0].after.findings[0],
      title: 'Verify corrective record if required',
      action: 'Obtain independent confirmation if required.',
      requiresHumanReview: true,
      category: 'assessment_limit',
    };
    data.topics[0].outcome = 'addressed';
    data.topics[0].changed = true;
    data.topics[0].after.status = 'no_issue';
    data.topics[0].after.findings = [];
    data.topics[0].after.limitations = [followup];
    data.topics[1].outcome = 'uncertain';
    data.topics[1].after.reasons = ['Saved assessment lacks supported evidence.'];
    data.unmapped.after = [followup];
    data.incomplete = true;
    data.reasons = ['One topic needs a supported assessment.'];
    await route.fulfill({ response, json: data });
  });
  await panel.getByLabel('Before review', { exact: true }).selectOption(original.id);
  await expect(panel.getByText('Human follow-up remains')).toBeVisible();
  await panel.getByLabel('Topic visibility').selectOption('open');
  await expect(panel.locator('.comparison-topic.outcome-uncertain')).toBeVisible();
  const addressed = panel.locator('.comparison-topic.outcome-addressed');
  await expect(addressed.locator('button').first()).toHaveAttribute('aria-expanded', 'false');
  await addressed.locator('button').first().focus();
  await page.keyboard.press('Enter');
  await expect(addressed.locator('.comparison-next')).toContainText('if required');
  await expect(panel.getByText(/Findings not mapped to a topic/)).toBeVisible();
  await expect(panel.locator('.comparison-visible')).toContainText('of 19 topics');
});
