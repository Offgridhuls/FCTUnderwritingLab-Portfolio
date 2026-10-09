import { test, expect, type Page } from '@playwright/test';

async function openChallenge(page: Page) {
  await page.goto('/');
  await page.getByLabel('Local access code').fill('ui-test-only');
  await page.getByRole('button', { name: 'Enter the room' }).click();
  await page.getByRole('button', { name: 'Open case', exact: true }).click();
  await page.getByRole('button', { name: 'Start team review' }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
  await page.locator('.finding-card').filter({ hasText: 'Representative authority' }).click();
  await page.getByRole('button', { name: 'Challenge this finding' }).click();
}
test('dictation appends final speech once and requires manual submission', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).SpeechRecognition = class {
      onstart: any;
      onend: any;
      onresult: any;
      onerror: any;
      constructor() {
        (window as any).speech = this;
      }
      start() {
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
      abort() {
        (window as any).aborted = true;
        this.onend?.();
      }
    };
  });
  await openChallenge(page);
  await page.getByLabel('Your question or challenge').fill('Please explain.');
  await page.getByRole('button', { name: 'Use microphone' }).click();
  await expect(page.getByText('Listening…', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit to reviewer' })).toBeDisabled();
  await page.evaluate(() => {
    const s = (window as any).speech;
    s.onresult({
      resultIndex: 0,
      results: [{ isFinal: false, 0: { transcript: 'Which document' } }],
    });
  });
  await expect(page.getByText('Hearing: Which document')).toBeVisible();
  await expect(page.getByLabel('Your question or challenge')).toHaveValue('Please explain.');
  await page.evaluate(() => {
    const s = (window as any).speech;
    const e = {
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: 'Which document establishes authority?' } }],
    };
    s.onresult(e);
    s.onresult(e);
  });
  await page.getByRole('button', { name: 'Stop dictation' }).click();
  await expect(page.getByLabel('Your question or challenge')).toHaveValue(
    'Please explain. Which document establishes authority?',
  );
  await expect(page.locator('.intervention-log')).toHaveCount(0);
  await page.getByRole('button', { name: 'Submit to reviewer' }).click();
  await expect(page.locator('.intervention-log')).toContainText(
    'Please explain. Which document establishes authority?',
  );
});
test('microphone denial preserves typing and closing stops recognition', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).SpeechRecognition = class {
      onstart: any;
      onend: any;
      onerror: any;
      constructor() {
        (window as any).speech = this;
      }
      start() {
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
      abort() {
        (window as any).aborted = true;
        this.onend?.();
      }
    };
  });
  await openChallenge(page);
  await page.getByRole('button', { name: 'Use microphone' }).click();
  await page.evaluate(() => (window as any).speech.onerror({ error: 'not-allowed' }));
  await expect(page.getByRole('alert')).toContainText('Microphone access was denied');
  await page.getByLabel('Your question or challenge').fill('I can still type.');
  await expect(page.getByRole('button', { name: 'Submit to reviewer' })).toBeEnabled();
  await page.getByRole('button', { name: 'Use microphone' }).click();
  await page.evaluate(() => {
    (window as any).aborted = false;
  });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  expect(await page.evaluate(() => (window as any).aborted)).toBe(true);
});
test('unsupported browser provides an honest dictation fallback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined });
  });
  await openChallenge(page);
  await expect(page.getByRole('button', { name: 'Use microphone' })).toBeDisabled();
  await expect(page.getByText(/Voice recognition is unavailable in this browser/)).toBeVisible();
  await page.getByLabel('Your question or challenge').fill('What evidence is missing?');
  await expect(page.getByRole('button', { name: 'Submit to reviewer' })).toBeEnabled();
});
