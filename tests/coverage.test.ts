import { it, expect } from 'vitest';
import { initializeCoverage, recordCoverage, validateCoverage } from '../server/coverage';
import type { Review } from '../shared/types';
function review() {
  const r = {
    mode: 'specialist',
    selectedReviewer: 'mortgage',
    findings: [
      {
        id: 'f',
        issueCode: 'PAYOUT',
        reviewer: 'mortgage',
        requiresHumanReview: true,
        status: 'open',
        validationWarnings: [],
      },
    ],
    snapshot: { documents: [{ id: 'd', pages: ['Exact supplied evidence.'] }], assumptions: [] },
  } as unknown as Review;
  initializeCoverage(r);
  r.coverageAuditDone = true;
  return r;
}
const record = {
  topicId: 'payout_conditions',
  status: 'issue' as const,
  explanation: 'Payout unresolved',
  citations: [{ documentId: 'd', page: 1, quote: 'Exact supplied evidence.' }],
  findingIssueCodes: ['PAYOUT'],
};
it('validates links, ownership, duplicate coverage and citations', () => {
  const r = review();
  recordCoverage(r, 'mortgage', [record]);
  expect(r.coverage![0].gaps).toEqual([]);
  recordCoverage(r, 'mortgage', [record, record]);
  expect(r.coverage![0].gaps).toContain('Duplicate coverage entries.');
  recordCoverage(r, 'mortgage', [{ ...record, citations: [{ ...record.citations[0], page: 9 }] }]);
  expect(r.coverage![0].gaps).toContain('Coverage citation failed validation.');
  recordCoverage(r, 'mortgage', [{ ...record, findingIssueCodes: ['MISSING'] }]);
  expect(r.coverage![0].gaps).toContain('Finding link is missing or ambiguous.');
});
it('distinguishes supported no issue, not applicable and inadequate evidence', () => {
  const r = review();
  recordCoverage(r, 'mortgage', [{ ...record, status: 'no_issue', findingIssueCodes: [] }]);
  expect(r.coverage![0].gaps).toEqual([]);
  recordCoverage(r, 'mortgage', [
    {
      ...record,
      status: 'not_applicable',
      findingIssueCodes: [],
      citations: [],
      explanation: 'No existing mortgage is described in this variant.',
    },
  ]);
  expect(r.coverage![0].gaps).toEqual([]);
  recordCoverage(r, 'mortgage', [{ ...record, status: 'insufficient', citations: [] }]);
  expect(r.coverage![0].gaps).toEqual([]);
  recordCoverage(r, 'mortgage', [
    { ...record, status: 'insufficient', citations: [], findingIssueCodes: [] },
  ]);
  expect(r.coverage![0].gaps).toContain('Unresolved topic needs an actionable finding.');
});
it('revalidates links after cross-review withdrawals and retains unanswered audit questions', () => {
  const r = review();
  recordCoverage(r, 'mortgage', [record]);
  r.findings[0].requiresHumanReview = false;
  r.findings[0].status = 'withdrawn';
  validateCoverage(r);
  expect(r.coverage![0].gaps.length).toBeGreaterThan(0);
  r.coverage![0].auditQuestion = 'Compare lender consent';
  validateCoverage(r);
  expect(r.coverage![0].gaps).toContain('Audit question remains unaddressed.');
});
it('an evidenced answer can address an audit while the transaction remains unresolved', () => {
  const r = review();
  r.coverage![0].auditQuestion = 'Has lender approval been supplied?';
  recordCoverage(r, 'mortgage', [
    {
      ...record,
      status: 'insufficient',
      citations: [],
      auditAddressed: true,
      auditResolved: false,
      auditResponse: 'Approval is absent; retain the actionable request.',
    },
  ]);
  expect(r.coverage![0].gaps).toEqual([]);
  expect(r.findings[0].status).toBe('open');
  recordCoverage(r, 'mortgage', [
    {
      ...record,
      status: 'insufficient',
      citations: [],
      findingIssueCodes: [],
      auditAddressed: true,
      auditResponse: 'Trust me.',
    },
  ]);
  expect(r.coverage![0].gaps).toContain('Unresolved topic needs an actionable finding.');
});
it('maps and validates the scenario/limitation partition without inferring clearance', () => {
  const r = review();
  r.findings[0].category = 'assessment_limit';
  recordCoverage(r, 'mortgage', [
    {
      ...record,
      scenario: {
        status: 'no_issue',
        explanation: 'Specific matter addressed by supplied evidence.',
        citations: record.citations,
        findingIssueCodes: [],
        limitationIssueCodes: ['PAYOUT'],
      },
    },
  ]);
  expect(r.coverage![0].scenario?.limitationIds).toEqual(['f']);
  expect(r.coverage![0].gaps).toEqual([]);
  r.coverage![0].status = 'no_issue';
  validateCoverage(r);
  expect(r.coverage![0].gaps).toEqual([]);
  r.coverage![0].scenario!.status = 'insufficient';
  validateCoverage(r);
  expect(r.coverage![0].gaps).toEqual([]);
  recordCoverage(r, 'mortgage', [
    {
      ...record,
      scenario: {
        status: 'no_issue',
        explanation: 'Claim.',
        citations: record.citations,
        findingIssueCodes: [],
        limitationIssueCodes: ['MISSING'],
      },
    },
  ]);
  expect(r.coverage![0].gaps.length).toBeGreaterThan(0);
});
