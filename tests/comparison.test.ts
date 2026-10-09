import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compareReviews, selectReview } from '../server/comparison';
import { coverageTopics } from '../shared/coverage';
import type { Review, Branch, Finding } from '../shared/types';
const citation = { documentId: 'd', page: 1, quote: 'Exact documentary evidence.' };
const b = (id: string) =>
  ({
    id,
    caseId: 'case',
    revision: 1,
    name: id,
    createdAt: '2026-01-01',
    assumptions: [],
    parentId: null,
    closingDate: '2026-10-15',
    purchasePrice: 700000,
    loanAmount: 500000,
    documentIds: [],
  }) as Branch;
function r(branch: string): Review {
  return {
    id: branch + 'review',
    branchId: branch,
    caseId: 'case',
    revision: 1,
    createdAt: '2026-01-01',
    mode: 'cross',
    status: 'completed',
    needsRerun: false,
    coverageVersion: 'demo-coverage-1',
    coverageAuditDone: true,
    coverageStatus: 'complete',
    findings: [],
    snapshot: {
      documents: [{ id: 'd', title: 'evidence', pages: [citation.quote] }],
      assumptions: [],
      revision: 1,
    },
    coverage: coverageTopics.map((t) => ({
      topicId: t.id,
      reviewer: t.reviewer,
      status: 'no_issue',
      explanation: 'Supported assessment.',
      citations: [citation],
      findingIds: [],
      gaps: [],
    })),
  } as unknown as Review;
}
function issue(r: Review, code = 'PAYOUT', id = 'f') {
  const f = {
    id,
    issueCode: code,
    reviewer: 'mortgage',
    status: 'open',
    severity: 'attention',
    category: 'issue',
    requiresHumanReview: true,
    explanation: 'Issue',
    title: 'Issue title',
    nextCheck: 'Obtain evidence',
    citations: [citation],
    validationWarnings: [],
  } as Finding;
  r.findings.push(f);
  const c = r.coverage!.find((c) => c.topicId === 'payout_conditions')!;
  c.status = 'issue';
  c.findingIds.push(id);
  return f;
}
const compare = (a: Review, c: Review) => compareReviews(b('before'), b('after'), [a, c], []);
const topic = (x: ReturnType<typeof compare>, id = 'payout_conditions') =>
  x.topics.find((t) => t.id === id)!;
it('matches renamed and combined findings by topic, ignoring wording changes', () => {
  const a = r('before'),
    c = r('after');
  issue(a, 'OLD');
  issue(c, 'NEW');
  c.coverage![7].explanation = 'Reworded';
  expect(topic(compare(a, c)).outcome).toBe('action');
  expect(topic(compare(a, c)).changed).toBe(false);
  const link = c.coverage!.find((x) => x.topicId === 'parcel_release')!;
  link.status = 'issue';
  link.findingIds = ['f'];
  const result = compare(a, c);
  expect(topic(result, 'parcel_release').outcome).toBe('new');
  expect(result.unmapped.after).toEqual([]);
});
it('requires supported resolution; omission and invalid evidence never clear', () => {
  const a = r('before'),
    c = r('after');
  issue(a);
  expect(topic(compare(a, c)).outcome).toBe('addressed');
  c.coverage = c.coverage!.filter((x) => x.topicId !== 'payout_conditions');
  expect(topic(compare(a, c)).outcome).toBe('uncertain');
  const d = r('after');
  d.coverage!.find((x) => x.topicId === 'payout_conditions')!.citations[0] = {
    ...citation,
    page: 9,
  };
  expect(topic(compare(a, d)).outcome).toBe('uncertain');
});
it('separates explicit scenario resolution from an actionable verification limitation', () => {
  const a = r('before'),
    c = r('after');
  issue(a);
  const limit = issue(c);
  limit.category = 'assessment_limit';
  expect(topic(compare(a, c)).outcome).toBe('uncertain');
  const x = c.coverage!.find((x) => x.topicId === 'payout_conditions')!;
  x.outcomeVersion = 'scenario-1';
  x.scenario = {
    status: 'no_issue',
    explanation: 'Later supplied release addresses payout.',
    citations: [citation],
    findingIds: [],
    limitationIds: ['f'],
  };
  const result = topic(compare(a, c));
  expect(result.outcome).toBe('addressed');
  expect(result.after.limitations).toHaveLength(1);
  limit.category = 'issue';
  expect(topic(compare(a, c)).outcome).toBe('uncertain');
});
it('keeps applicability changes explicit without calling them resolutions', () => {
  const a = r('before'),
    c = r('after');
  issue(a);
  c.coverage!.find((x) => x.topicId === 'payout_conditions')!.status = 'not_applicable';
  const t = topic(compare(a, c));
  expect(t.changed).toBe(true);
  expect(t.outcome).not.toBe('addressed');
});
it('local gaps do not block other topics; historical, stale and incompatible records are explicit', () => {
  const a = r('before'),
    c = r('after');
  issue(a);
  c.coverage![0].status = 'unassessed';
  expect(topic(compare(a, c)).outcome).toBe('addressed');
  c.revision = 0;
  expect(topic(compare(a, c)).outcome).toBe('uncertain');
  c.revision = 1;
  c.coverageVersion = 'unknown';
  expect(topic(compare(a, c)).outcome).toBe('uncertain');
  delete c.coverageVersion;
  delete c.coverage;
  expect(compare(a, c).reasons.join(' ')).toContain('Historical');
});
it('selects current completed full scope by creation time, not insertion order', () => {
  const old = r('before'),
    fresh = { ...old, id: 'fresh', createdAt: '2026-02-01' },
    partial = { ...old, id: 'partial', mode: 'specialist', createdAt: '2026-03-01' } as Review;
  expect(selectReview([fresh, partial, old], b('before'))?.id).toBe('fresh');
  expect(selectReview([fresh, old], { ...b('before'), revision: 2 })?.id).toBe('fresh');
  expect(selectReview([fresh, partial, old], b('before'), 'partial')?.id).toBe('partial');
});
it('preserves originals, unmapped findings and document/detail changes', () => {
  const a = r('before'),
    c = r('after');
  const un = issue(c);
  c.coverage!.find((x) => x.topicId === 'payout_conditions')!.findingIds = [];
  c.snapshot.documents.push({ id: 'added', title: 'Correction', pages: ['later'] } as any);
  c.snapshot.purchasePrice = 700000;
  const saved = JSON.stringify([a, c]);
  const result = compare(a, c);
  expect(JSON.stringify([a, c])).toBe(saved);
  expect(result.unmapped.after[0].id).toBe(un.id);
  expect(result.evidence.added[0].id).toBe('added');
  expect(result.details[0].field).toBe('purchasePrice');
});
it('pending intervention blocks reliable transitions, specialist scope stays local', () => {
  const a = r('before'),
    c = r('after');
  issue(a);
  const result = compareReviews(
    b('before'),
    b('after'),
    [a, c],
    [{ reviewId: c.id, state: 'queued' } as any],
  );
  expect(topic(result).outcome).toBe('uncertain');
  c.mode = 'specialist';
  c.selectedReviewer = 'mortgage';
  c.coverage = c.coverage!.filter((x) => x.reviewer === 'mortgage');
  expect(topic(compare(a, c)).outcome).toBe('addressed');
  expect(topic(compare(a, c), 'authority').outcome).toBe('uncertain');
});
it('groups saved original/corrected results without inventing missing historical scenario outcomes', () => {
  const fixture = JSON.parse(readFileSync('tests/fixtures/saved-branch-comparison.json', 'utf8'));
  const saved = JSON.stringify(fixture);
  const result = compareReviews(fixture.branches[0], fixture.branches[1], fixture.reviews, []);
  expect(topic(result).outcome).toBe('uncertain');
  expect(topic(result).after.status).toBe('no_issue');
  expect(topic(result).after.reasons).toContain('Full rerun required.');
  const access = topic(result, 'access_rights');
  expect(access.before.findings[0].issueCode).not.toBe(access.after.findings[0].issueCode);
  expect(access.after.status).toBe('no_issue');
  expect(topic(result, 'authority').outcome).toBe('uncertain');
  expect(JSON.stringify(fixture)).toBe(saved);
});
