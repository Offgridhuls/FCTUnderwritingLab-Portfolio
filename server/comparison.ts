import { coverageTopics } from '../shared/coverage';
import { isActionableFinding, type Branch, type Review, type Intervention } from '../shared/types';
import type { ComparisonResult, TopicSide, ComparisonOutcome } from '../shared/comparison';
import { validateCoverage } from './coverage';
export function selectReview(reviews: Review[], branch: Branch, id?: string) {
  const own = reviews
    .filter((r) => r.branchId === branch.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  return id
    ? own.find((r) => r.id === id)
    : own.find(
        (r) =>
          r.status === 'completed' && r.mode !== 'specialist' && r.revision === branch.revision,
      ) || own[0];
}
function reasons(r: Review | undefined, b: Branch, interventions: Intervention[]) {
  if (!r) return ['No review available.'];
  const result: string[] = [];
  if (r.status !== 'completed') result.push(`Review is ${r.status}.`);
  if (r.revision !== b.revision)
    result.push(
      `Outdated evidence: assessed revision ${r.revision}, current revision ${b.revision}.`,
    );
  if (r.needsRerun) result.push('Full rerun required.');
  if (r.mode === 'specialist')
    result.push('Partial specialist scope; other areas were not assessed.');
  if (r.coverageStatus === 'incomplete')
    result.push('Coverage incomplete; inspect individual topics.');
  if (!r.coverageVersion) result.push('Historical review: coverage checklist not recorded.');
  if (interventions.some((i) => i.reviewId === r.id && ['queued', 'processing'].includes(i.state)))
    result.push('Human challenge pending.');
  return result;
}
function side(
  r: Review | undefined,
  b: Branch,
  id: string,
  interventions: Intervention[],
): TopicSide {
  const c = r?.coverage?.find((c) => c.topicId === id);
  const blocked = reasons(r, b, interventions).filter(
    (x) => !x.startsWith('Coverage incomplete') && !x.startsWith('Partial specialist'),
  );
  if (!c)
    return {
      status: 'unassessed',
      explanation: 'No topic assessment recorded in this review.',
      citations: [],
      findings: [],
      limitations: [],
      reasons: [...blocked, 'Topic not assessed.'],
    };
  const linked = (c.findingIds || []).flatMap((id) => r!.findings.filter((f) => f.id === id));
  const s = c.scenario;
  const findings = s
    ? r!.findings.filter((f) => s.findingIds.includes(f.id))
    : linked.filter((f) => f.category !== 'assessment_limit');
  const limitations = s
    ? r!.findings.filter((f) => s.limitationIds.includes(f.id))
    : linked.filter((f) => f.category === 'assessment_limit');
  if (
    !s &&
    limitations.length &&
    !findings.some(isActionableFinding) &&
    ['issue', 'insufficient'].includes(c.status)
  )
    blocked.push(
      'Saved assessment does not separate the scenario outcome from verification limitations.',
    );
  return {
    status: s?.status || c.status,
    explanation: s?.explanation || c.explanation,
    citations: s?.citations || c.citations,
    findings,
    limitations,
    reasons: [...blocked, ...c.gaps],
  };
}
export function compareReviews(
  beforeBranch: Branch,
  afterBranch: Branch,
  reviews: Review[],
  interventions: Intervention[],
  leftId?: string,
  rightId?: string,
): ComparisonResult {
  // Revalidate on a copy: reading a historical review never rewrites it.
  const prepare = (r: Review | undefined) => {
    if (!r) return r;
    const copy = structuredClone(r);
    validateCoverage(copy);
    return copy;
  };
  const left = prepare(selectReview(reviews, beforeBranch, leftId)),
    right = prepare(selectReview(reviews, afterBranch, rightId));
  const topics = coverageTopics.map((t) => {
    const before = side(left, beforeBranch, t.id, interventions),
      after = side(right, afterBranch, t.id, interventions);
    if (
      left?.coverageVersion &&
      right?.coverageVersion &&
      left.coverageVersion !== right.coverageVersion
    )
      after.reasons.push('Checklist versions differ.');
    if (
      left?.coverageVersion &&
      !['demo-coverage-1', 'demo-coverage-2'].includes(left.coverageVersion)
    )
      before.reasons.push('Unsupported checklist version.');
    if (
      right?.coverageVersion &&
      !['demo-coverage-1', 'demo-coverage-2'].includes(right.coverageVersion)
    )
      after.reasons.push('Unsupported checklist version.');
    const active = (s: TopicSide) =>
      ['issue', 'insufficient'].includes(s.status) || s.findings.some(isActionableFinding);
    const old = active(before),
      current = active(after);
    let outcome: ComparisonOutcome = 'unchanged';
    if (
      before.reasons.length ||
      after.reasons.length ||
      before.status === 'unassessed' ||
      after.status === 'unassessed'
    )
      outcome = 'uncertain';
    else if (old && after.status === 'no_issue' && !current) outcome = 'addressed';
    else if (current && !old) outcome = 'new';
    else if (current) outcome = 'action';
    return {
      id: t.id,
      label: t.label,
      reviewer: t.reviewer,
      outcome,
      changed: outcome === 'uncertain' || before.status !== after.status || old !== current,
      before,
      after,
    };
  });
  const mapped = (r: Review | undefined) =>
    new Set(
      topics.flatMap((t) => {
        const s = r === left ? t.before : t.after;
        return [...s.findings, ...s.limitations].map((f) => f.id);
      }),
    );
  const unmapped = {
    before: (left?.findings || []).filter((f) => !mapped(left).has(f.id)),
    after: (right?.findings || []).filter((f) => !mapped(right).has(f.id)),
  };
  const ld = left?.snapshot.documents || [],
    rd = right?.snapshot.documents || [];
  const cited = (r: Review | undefined) =>
    new Set(
      [
        ...(r?.findings.flatMap((f) => f.citations) || []),
        ...(r?.coverage?.flatMap((c) => [...c.citations, ...(c.scenario?.citations || [])]) || []),
      ].map((c) => c.documentId),
    );
  const lc = cited(left),
    rc = cited(right);
  const values = (r: Review | undefined) =>
    r
      ? {
          ...r.snapshot.details?.values,
          closingDate: r.snapshot.closingDate,
          purchasePrice: r.snapshot.purchasePrice,
          loanAmount: r.snapshot.loanAmount,
        }
      : {};
  const lv = values(left),
    rv = values(right);
  const details = [...new Set([...Object.keys(lv), ...Object.keys(rv)])]
    .filter((k) => JSON.stringify((lv as any)[k]) !== JSON.stringify((rv as any)[k]))
    .map((field) => ({ field, before: (lv as any)[field], after: (rv as any)[field] }));
  const allReasons = [
    ...reasons(left, beforeBranch, interventions).map((x) => 'Before: ' + x),
    ...reasons(right, afterBranch, interventions).map((x) => 'After: ' + x),
  ];
  if (topics.some((t) => t.outcome === 'uncertain'))
    allReasons.push('Some topic assessments cannot be reliably compared.');
  const codes = new Set(
    [...(left?.findings || []), ...(right?.findings || [])].map((f) => f.issueCode),
  );
  return {
    left,
    right,
    beforeBranch,
    afterBranch,
    beforeReviews: reviews
      .filter((r) => r.branchId === beforeBranch.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    afterReviews: reviews
      .filter((r) => r.branchId === afterBranch.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    incomplete: !!allReasons.length,
    reasons: allReasons,
    topics,
    unmapped,
    evidence: {
      added: rd
        .filter((d) => !ld.some((x) => x.id === d.id))
        .map(({ id, title }) => ({ id, title })),
      removed: ld
        .filter((d) => !rd.some((x) => x.id === d.id))
        .map(({ id, title }) => ({ id, title })),
      newlyCited: rd
        .filter((d) => rc.has(d.id) && !lc.has(d.id))
        .map(({ id, title }) => ({ id, title })),
    },
    details,
    assumptions: {
      before: left?.snapshot.assumptions || [],
      after: right?.snapshot.assumptions || [],
    },
    changes: [...codes].map((issueCode) => {
      const before = left?.findings.find((f) => f.issueCode === issueCode),
        after = right?.findings.find((f) => f.issueCode === issueCode);
      return {
        issueCode,
        before,
        after,
        state: !before
          ? 'new'
          : !after
            ? 'not reassessed'
            : before.status === 'open' && after.status !== 'open'
              ? 'resolved'
              : before.status !== after.status ||
                  before.severity !== after.severity ||
                  before.explanation !== after.explanation
                ? 'changed'
                : 'unchanged',
      };
    }),
  };
}
