import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.FCT_EVALUATION_URL || 'http://127.0.0.1:4317/api/v1';
const accessCode = process.env.FCT_ACCESS_CODE;
if (!accessCode) throw new Error('Set FCT_ACCESS_CODE to the separately running C# server code.');
let token = '';
async function request(path: string, body?: unknown) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || `HTTP ${response.status}`);
  return result;
}
const session = await request('/sessions', { accessCode });
token = session.token;
const command = (branchId: string, revision: number) => ({ caseId: session.caseId, branchId, expectedRevision: revision, commandId: crypto.randomUUID() });
let corrected = await request('/branches', { ...command(session.branchId, 1), name: 'Corrected evaluation evidence' });
for (const documentId of ['authorization', 'payout-updated', 'municipal-clear'])
  corrected = await request('/documents/reveal', { ...command(corrected.id, corrected.revision), documentId });
const started = await Promise.all([
  request('/reviews', { ...command(session.branchId, 1), mode: 'cross' }),
  request('/reviews', { ...command(corrected.id, corrected.revision), mode: 'cross' }),
]);
const reports = [];
for (const [index, initial] of started.entries()) {
  const deadline = Date.now() + 20 * 60_000;
  let review = initial;
  while (review.status === 'running' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    review = await request(`/reviews/${initial.id}`);
  }
  const report = {
    evidence: index ? 'corrected' : 'original', status: review.status, error: review.error,
    coverageStatus: review.coverageStatus, durationMs: review.durationMs,
    gaps: review.coverage?.filter((topic: any) => topic.gaps.length).map((topic: any) => ({ topicId: topic.topicId, gaps: topic.gaps })),
    findings: review.findings.map((finding: any) => ({ issueCode: finding.issueCode, title: finding.title, reviewer: finding.reviewer,
      status: finding.status, requiresHumanReview: finding.requiresHumanReview, category: finding.category, validationWarnings: finding.validationWarnings })),
    invalidCitations: review.findings.flatMap((finding: any) => [...finding.citations, ...finding.reviewQuestions.flatMap((question: any) => question.citations)]).filter((citation: any) => citation.verified !== true).length,
    usage: review.usage,
  };
  reports.push(report);
  await mkdir('docs/evaluation', { recursive: true });
  await writeFile('docs/evaluation/dotnet-live.json', JSON.stringify({ model: 'gpt-5.6-terra', at: new Date().toISOString(), reports }, null, 2));
  console.log(`${report.evidence}: ${report.status}; coverage ${report.coverageStatus || 'not recorded'}; ${report.findings.length} findings; ${report.invalidCitations} invalid citations${report.error ? '; ' + report.error : ''}`);
}
if (reports.some(report => report.status !== 'completed')) process.exitCode = 1;
