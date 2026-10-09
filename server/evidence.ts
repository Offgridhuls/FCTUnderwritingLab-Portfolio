import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { z } from 'zod';
import type { Citation, Snapshot, Finding } from '../shared/types.js';
export const citationSchema = z.object({
  documentId: z.string(),
  page: z.number().int().positive(),
  quote: z.string().min(8).max(1200),
});
export const findingSchema = z.object({
  requiresHumanReview: z.boolean().optional(),
  category: z.enum(['issue', 'missing_document', 'assessment_limit']).optional(),
  missingDocument: z.string().max(140).optional(),
  impact: z.string().max(280).optional(),
  action: z.string().max(280).optional(),
  issueCode: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  severity: z.enum(['attention', 'clarify', 'clear']),
  status: z.enum(['open', 'resolved', 'withdrawn']),
  explanation: z.string().max(2500),
  nextCheck: z.string().max(1200),
  known: z
    .union([z.string(), z.array(z.string().min(1)).min(1).max(8)])
    .transform((v) => (Array.isArray(v) ? v.join('\n') : v))
    .pipe(z.string().min(1).max(1500))
    .optional(),
  uncertain: z
    .union([z.string(), z.array(z.string().min(1)).min(1).max(8)])
    .transform((v) => (Array.isArray(v) ? v.join('\n') : v))
    .pipe(z.string().min(1).max(1500))
    .optional(),
  changeEvidence: z
    .union([z.string(), z.array(z.string().min(1)).min(1).max(8)])
    .transform((v) => (Array.isArray(v) ? v.join('\n') : v))
    .pipe(z.string().min(1).max(1500))
    .optional(),
  reviewQuestions: z
    .array(
      z.object({
        question: z.string().min(1).max(350),
        answer: z.string().min(1).max(1000),
        citations: z.array(citationSchema).min(1).max(4),
      }),
    )
    .max(3)
    .optional(),
  citations: z.array(citationSchema).max(8),
});
const normalize = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();
export function validateCitation(c: Citation, s: Snapshot): Citation {
  const doc = s.documents.find((d) => d.id === c.documentId);
  return {
    ...c,
    verified:
      !!doc &&
      !!doc.pages[c.page - 1] &&
      normalize(doc.pages[c.page - 1]).includes(normalize(c.quote)),
  };
}
export function validateFinding(f: Finding, s: Snapshot): Finding {
  const citations = f.citations.map((c) => validateCitation(c, s));
  const reviewQuestions = f.reviewQuestions?.map((q) => ({
    ...q,
    citations: q.citations.map((c) => validateCitation(c, s)),
  }));
  return {
    ...f,
    ...(f.requiresHumanReview
      ? {
          status: 'open' as const,
          severity: f.severity === 'clear' ? ('attention' as const) : f.severity,
        }
      : {}),
    citations,
    reviewQuestions,
    validationWarnings: [
      ...(reviewQuestions || []).flatMap((q) =>
        q.citations
          .filter((c) => !c.verified)
          .map((c) => `Review question has an invalid citation: ${c.documentId} p.${c.page}.`),
      ),
      ...(!citations.length ? ['No documentary citation supplied. Finding is unverified.'] : []),
      ...citations
        .filter((c) => !c.verified)
        .map(
          (c) =>
            `Invalid quotation or page: ${c.documentId} p.${c.page}. Do not rely on this finding.`,
        ),
    ],
  };
}
export async function extractPdf(buffer: Uint8Array) {
  if (buffer.length > 10 * 1024 * 1024)
    throw Object.assign(new Error('PDF exceeds 10 MB'), { statusCode: 413 });
  let task;
  try {
    task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
    const pdf = await task.promise;
    if (pdf.numPages > 20) throw new Error('PDF exceeds 20 pages');
    const pages: string[] = [];
    const warnings: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const text = await page.getTextContent();
      const content = text.items.map((i: any) => i.str || '').join(' ');
      pages.push(content);
      if (content.trim().length < 20)
        warnings.push(`Page ${n} is unreadable or has no usable text. OCR is not supported.`);
    }
    for (const [index, text] of pages.entries())
      if (
        /ignore (?:all |any )?(?:prior|previous|above) instructions|system prompt|call (?:a |the )?shell|delete (?:the |all )?(?:case|files)|do not cite evidence/i.test(
          text,
        )
      )
        warnings.push(
          `Page ${index + 1} contains instruction-like text. It is untrusted document content and must not control the review.`,
        );
    return { pages, warnings };
  } catch (e: any) {
    throw Object.assign(
      new Error(
        e.name === 'PasswordException'
          ? 'Encrypted PDFs are not supported.'
          : `Cannot ingest PDF: ${e.message}`,
      ),
      { statusCode: 400 },
    );
  } finally {
    await task?.destroy();
  }
}
export function checks(s: Snapshot) {
  const payouts = s.documents.filter((d) => d.kind === 'payout' || d.kind === 'payout-update');
  const active = payouts.find((d) => d.kind === 'payout-update') || payouts[0];
  const text = active?.pages.join(' ') || '';
  const rawDate = text.match(/Valid through:\s*(\d{4}-\d{2}-\d{2})/)?.[1];
  const validThrough =
    rawDate && z.string().date().safeParse(rawDate).success ? rawDate : undefined;
  return {
    closingDate: s.closingDate || null,
    payoutDocumentId: active?.id || null,
    payoutValidThrough: validThrough || null,
    payoutExpiresBeforeClosing: validThrough && s.closingDate ? validThrough < s.closingDate : null,
    purchasePrice: s.details && !s.details.values.purchasePrice ? null : s.purchasePrice,
    loanAmount: s.details && !s.details.values.loanAmount ? null : s.loanAmount,
    loanExceedsPurchase:
      s.details && (!s.details.values.purchasePrice || !s.details.values.loanAmount)
        ? null
        : s.loanAmount > s.purchasePrice,
    unreadablePages: s.documents.flatMap((d) => d.warnings),
    assumptions: s.assumptions,
  };
}
