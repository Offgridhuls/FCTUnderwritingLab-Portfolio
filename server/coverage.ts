import { z } from 'zod';
import { coverageTopics, COVERAGE_VERSION } from '../shared/coverage';
import { isActionableFinding, type Role, type Review, type CoverageRecord } from '../shared/types';
import { citationSchema, validateCitation } from './evidence';
export const coverageSchema = z.object({
  topicId: z.string(),
  status: z.enum(['issue', 'no_issue', 'insufficient', 'not_applicable']),
  explanation: z.string().min(1).max(1600),
  citations: z.array(citationSchema).max(8),
  findingIssueCodes: z.array(z.string()).max(12),
  auditResponse: z.string().max(1600).optional(),
  auditResolved: z.boolean().optional(),
  auditAddressed: z.boolean().optional(),
  scenario: z
    .object({
      status: z.enum(['issue', 'no_issue', 'insufficient', 'not_applicable']),
      explanation: z.string().min(1).max(1600),
      citations: z.array(citationSchema).max(8),
      findingIssueCodes: z.array(z.string()).max(12),
      limitationIssueCodes: z.array(z.string()).max(12),
    })
    .optional(),
});
export function assignedTopics(r: Review, role?: Role) {
  return coverageTopics.filter(
    (t) =>
      (r.mode !== 'specialist' || t.reviewer === r.selectedReviewer) &&
      (!role || role === 'lead' || t.reviewer === role),
  );
}
export function initializeCoverage(r: Review) {
  r.coverageVersion = COVERAGE_VERSION;
  r.coverage = assignedTopics(r).map((t) => ({
    topicId: t.id,
    reviewer: t.reviewer,
    status: 'unassessed',
    explanation: 'No assessment recorded.',
    citations: [],
    findingIds: [],
    gaps: ['Topic not assessed.'],
  }));
  r.coverageStatus = 'pending';
  r.coverageRechecked = [];
}
export function recordCoverage(r: Review, role: Role, records: z.infer<typeof coverageSchema>[]) {
  for (const topic of assignedTopics(r, role)) {
    const matches = records.filter((c) => c.topicId === topic.id);
    const previous = r.coverage!.find((c) => c.topicId === topic.id)!;
    const entry = matches[0];
    if (!entry) {
      previous.status = 'unassessed';
      previous.gaps = ['Topic not assessed.'];
      continue;
    }
    const own = r.findings.filter(
      (f) => f.reviewer === (r.mode === 'single' ? 'lead' : topic.reviewer),
    );
    const links = entry.findingIssueCodes.flatMap((code) =>
      own.filter((f) => f.issueCode === code).map((f) => f.id),
    );
    const gaps: string[] = [];
    if (matches.length !== 1) gaps.push('Duplicate coverage entries.');
    if (records.some((c) => !assignedTopics(r, role).some((t) => t.id === c.topicId)))
      gaps.push('Reviewer returned topics outside its assigned scope.');
    if (
      entry.findingIssueCodes.some((code) => own.filter((f) => f.issueCode === code).length !== 1)
    )
      gaps.push('Finding link is missing or ambiguous.');
    const next: CoverageRecord = {
      ...previous,
      status: entry.status,
      explanation: entry.explanation,
      citations: entry.citations.map((c) => validateCitation(c, r.snapshot)),
      findingIds: links,
      gaps,
      auditResponse: entry.auditResponse,
      auditResolved: entry.auditResolved,
      auditAddressed: entry.auditAddressed,
      outcomeVersion: entry.scenario ? 'scenario-1' : undefined,
      scenario: entry.scenario
        ? {
            status: entry.scenario.status,
            explanation: entry.scenario.explanation,
            citations: entry.scenario.citations.map((c) => validateCitation(c, r.snapshot)),
            findingIds: entry.scenario.findingIssueCodes.flatMap((code) =>
              own.filter((f) => f.issueCode === code).map((f) => f.id),
            ),
            limitationIds: entry.scenario.limitationIssueCodes.flatMap((code) =>
              own.filter((f) => f.issueCode === code).map((f) => f.id),
            ),
          }
        : undefined,
    };
    if (
      entry.scenario &&
      [...entry.scenario.findingIssueCodes, ...entry.scenario.limitationIssueCodes].some(
        (code) => own.filter((f) => f.issueCode === code).length !== 1,
      )
    )
      next.gaps.push('Finding link in scenario is missing or ambiguous.');
    r.coverage![r.coverage!.indexOf(previous)] = next;
  }
  validateCoverage(r);
}
export function validateCoverage(r: Review) {
  if (!r.coverageVersion) return;
  for (const c of r.coverage || []) {
    const base = c.gaps.filter(
      (g) =>
        g.startsWith('Duplicate') ||
        g.startsWith('Reviewer returned') ||
        g.startsWith('Finding link'),
    );
    if (c.status === 'unassessed') base.push('Topic not assessed.');
    if (!c.explanation.trim()) base.push('Assessment explanation missing.');
    c.citations = c.citations.map((x) => validateCitation(x, r.snapshot));
    if (c.citations.some((x) => !x.verified)) base.push('Coverage citation failed validation.');
    if (['issue', 'no_issue'].includes(c.status) && !c.citations.length)
      base.push('Documentary support is missing.');
    const linked = c.findingIds.map((id) => r.findings.find((f) => f.id === id));
    if (linked.some((f) => !f || f.reviewer !== (r.mode === 'single' ? 'lead' : c.reviewer)))
      base.push('Finding link has wrong ownership or is missing.');
    if (linked.some((f) => f?.validationWarnings.length))
      base.push('Linked finding has unverified evidence.');
    if (
      linked.some(
        (f) =>
          f &&
          [...(f.citations || []), ...(f.reviewQuestions || []).flatMap((q) => q.citations)].some(
            (x) => !validateCitation(x, r.snapshot).verified,
          ),
      )
    )
      base.push('Linked finding citation failed validation.');
    if (
      ['issue', 'insufficient'].includes(c.status) &&
      !linked.some((f) => f && isActionableFinding(f))
    )
      base.push('Unresolved topic needs an actionable finding.');
    if (
      ['no_issue', 'not_applicable'].includes(c.status) &&
      linked.some(
        (f) => f && isActionableFinding(f) && (!c.scenario || f.category !== 'assessment_limit'),
      )
    )
      base.push('Assessment conflicts with linked actionable findings.');
    if (c.scenario) {
      const s = c.scenario;
      s.citations = s.citations.map((x) => validateCitation(x, r.snapshot));
      if (
        s.citations.some((x) => !x.verified) ||
        (['issue', 'no_issue'].includes(s.status) && !s.citations.length)
      )
        base.push('Scenario evidence is missing or invalid.');
      if (!s.explanation.trim()) base.push('Scenario explanation missing.');
      const substantive = s.findingIds.map((id) => r.findings.find((f) => f.id === id));
      const limits = s.limitationIds.map((id) => r.findings.find((f) => f.id === id));
      const ids = [...s.findingIds, ...s.limitationIds];
      if (
        new Set(ids).size !== ids.length ||
        ids.some((id) => !c.findingIds.includes(id)) ||
        c.findingIds.some((id) => !ids.includes(id))
      )
        base.push('Scenario links do not partition the topic findings.');
      if (
        substantive.some((f) => !f || f.category === 'assessment_limit') ||
        limits.some((f) => !f || f.category !== 'assessment_limit')
      )
        base.push('Scenario finding categories conflict.');
      if (s.status === 'issue' && !substantive.some((f) => f && isActionableFinding(f)))
        base.push('Scenario issue needs a substantive actionable finding.');
      if (
        s.status === 'insufficient' &&
        ![...substantive, ...limits].some((f) => f && isActionableFinding(f))
      )
        base.push('Insufficient scenario evidence needs an actionable follow-up.');
      if (
        ['no_issue', 'not_applicable'].includes(s.status) &&
        substantive.some((f) => f && isActionableFinding(f))
      )
        base.push('Scenario outcome conflicts with actionable findings.');
    }
    if (c.auditQuestion && (!c.auditResponse?.trim() || !(c.auditAddressed ?? c.auditResolved)))
      base.push('Audit question remains unaddressed.');
    c.gaps = [...new Set(base)];
  }
  r.coverageStatus =
    r.coverageAuditDone && r.coverage?.every((c) => !c.gaps.length) ? 'complete' : 'incomplete';
}
export function coverageTask(r: Review, role: Role) {
  return ` OUTCOME CONTRACT: Also include scenario:{status:"issue|insufficient|no_issue|not_applicable",explanation:"assessment within supplied evidence",citations:[exact page citations],findingIssueCodes:[substantive finding codes],limitationIssueCodes:[assessment_limit finding codes]} for EVERY topic. The two lists must partition findingIssueCodes on the parent coverage record. Separate a corrected substantive issue from remaining specific human verification limitations. Discuss later corrective records explicitly. If documentary corrections address the earlier issue, record a supported no_issue scenario outcome and resolve/narrow its substantive finding; keep separately justified assessment_limit findings open. Do not invent resolution from a generic synthetic-records disclaimer or conceal a substantive defect as a limitation. Never claim real-world authentication or approval. auditAddressed:true means you ANSWERED the audit question with supported evidence or an actionable missing-evidence finding; it does NOT mean the transaction issue is resolved. Include auditResponse; do not set auditAddressed true for an unsupported assertion. Legacy auditResolved is not required. REQUIRED COVERAGE TOPICS: ${JSON.stringify(assignedTopics(r, role))}. Include coverage: [{topicId,status:"issue|no_issue|insufficient|not_applicable",explanation:"brief evidence-based assessment",citations:[{documentId,page,quote}],findingIssueCodes:["all linked finding issueCodes"],scenario:{status:"issue|insufficient|no_issue|not_applicable",explanation:"substantive assessment within supplied evidence",citations:[{documentId,page,quote}],findingIssueCodes:["substantive finding codes"],limitationIssueCodes:["assessment_limit codes"]},auditResponse:"answer if asked to recheck",auditAddressed:true}]. Account for EVERY assigned topic. No issue requires source evidence; insufficient evidence requires an actionable finding and an honest explanation of missing records, not a fabricated quotation. Not applicable requires a concrete explanation. Compare signed amendments and actual use with lender conditions; compare authorized advances with proposals and reconcile deposit treatment where applicable. Preserve conditional requirements. Title owns legal rights, survey physical occupation, mortgage lender acceptance, property municipal use. Do not treat checklist topics as predetermined defects.`;
}
