import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
test('name-only case extracts multiple uploads, requires confirmation and preserves edits during polling', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Local access code').fill('ui-test-only');
  await page.getByRole('button', { name: 'Enter the room' }).click();
  await page.getByRole('button', { name: 'New case', exact: true }).click();
  await page.getByLabel('Case name', { exact: true }).fill('Document intake');
  await page.getByRole('button', { name: 'Create case', exact: true }).click();
  await expect(page.locator('h1:visible')).toHaveText('Document intake');
  await page.getByRole('button', { name: 'Add or replace PDF' }).click();
  const files = [];
  for (const [name, lines] of [
    [
      'agreement.pdf',
      [
        'Seller: Morgan Ellis. Buyer: Alex Chen.',
        'Property: 18 Alder Lane. Purchase price: CAD 700,000.',
        'Proposed closing: 2026-10-15.',
      ],
    ],
    ['amendment.pdf', ['Closing date: 2026-10-22. Unsigned proposal.']],
  ] as [string, string[]][]) {
    const pdf = await PDFDocument.create();
    const p = pdf.addPage();
    lines.forEach((text, i) => p.drawText(text, { x: 40, y: 720 - i * 30, size: 12 }));
    files.push({ name, mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
  }
  await page.getByLabel('PDF files', { exact: true }).setInputFiles(files);
  await expect(page.getByText('2 PDFs selected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Upload all/ }).click();
  const details = page.getByRole('region', { name: 'Case details', exact: true });
  await expect(details.getByLabel('Seller', { exact: true })).toHaveValue('Morgan Ellis');
  await expect(details.getByLabel('Closing date', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Start team review' })).toBeDisabled();
  await details.getByLabel('Seller', { exact: true }).fill('Corrected Seller');
  await details.getByLabel('Closing date', { exact: true }).fill('2026-10-15');
  await details
    .getByRole('button', { name: 'Confirm details (blanks remain unknown)', exact: true })
    .click();
  await expect(details).toContainText('Working details confirmed');
  await expect(details.getByLabel('Seller', { exact: true })).toHaveCount(0);
  await details.getByRole('button', { name: 'Edit details', exact: true }).click();
  await expect(details).toContainText('user correction (unverified)');
  await details.getByLabel('Seller', { exact: true }).fill('Discard this change');
  await details.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start team review' })).toBeEnabled();
  await page.reload();
  await page
    .getByRole('article', { name: 'Document intake', exact: true })
    .getByRole('button', { name: 'Open case', exact: true })
    .click();
  await expect(details).toContainText('Working details confirmed');
  await details.getByRole('button', { name: 'Edit details', exact: true }).click();
  await expect(details.getByLabel('Seller', { exact: true })).toHaveValue('Corrected Seller');
  await page.route(
    '**/api/v1/branches/*/details',
    (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Case revision changed. Refresh before saving.' }),
      }),
    { times: 1 },
  );
  await details.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(details.getByRole('alert')).toContainText('Case revision changed');
  await expect(details.getByLabel('Seller', { exact: true })).toHaveValue('Corrected Seller');
  await details.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(details).toContainText('Working details confirmed');
  await details.getByRole('button', { name: 'Edit details', exact: true }).click();
  await details.getByRole('button', { name: 'Source for Seller 1', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Evidence viewer' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/document-intake.png', fullPage: true });
  await page.getByRole('button', { name: 'Close evidence viewer' }).click();
  await details.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: /^Evidence library/ }).click();
  await page.getByRole('button', { name: 'Add or replace PDF' }).click();
  await page.getByLabel('PDF files', { exact: true }).setInputFiles([files[0]]);
  await page.getByRole('button', { name: /^Upload all/ }).click();
  await expect(
    details.getByRole('button', { name: 'Confirm details (blanks remain unknown)', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start team review' })).toBeDisabled();
});
