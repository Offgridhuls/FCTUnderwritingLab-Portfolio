import { DatabaseSync } from 'node:sqlite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Store, uid, now } from '../server/store';
import { Workflow } from '../server/workflow';
import { CodexModel } from '../server/model';
import type { Review } from '../shared/types';
const db = new DatabaseSync('.data/lab.sqlite', { readOnly: true });
const source = (
  db.prepare("SELECT data FROM records WHERE kind='review' ORDER BY rowid DESC").all() as {
    data: string;
  }[]
)
  .map((x) => JSON.parse(x.data) as Review)
  .find(
    (r) =>
      r.snapshot.documents.some((d) => d.title === '03-lender.pdf') &&
      r.snapshot.documents.some((d) => d.title === '08-supplement.pdf'),
  )!;
db.close();
if (!source) throw new Error('Complex snapshot not found');
const outDir = resolve('docs/evaluation/coverage-' + Date.now());
await mkdir(outDir, { recursive: true });
const store = new Store(resolve(outDir, 'data'));
const model = new CodexModel();
const flow = new Workflow(store, model);
const owner = 'coverage-evaluation';
const results: any[] = [];
try {
  for (const variant of [
    'complex-original',
    'lender-approved-and-ledger-reconciled',
    'lender-records-absent',
  ]) {
    const snapshot = structuredClone(source.snapshot);
    snapshot.caseId = uid();
    snapshot.branchId = uid();
    snapshot.revision = 1;
    if (variant === 'lender-approved-and-ledger-reconciled') {
      const lender = snapshot.documents.find((d) => d.title === '03-lender.pdf')!;
      lender.pages[0] = lender.pages[0].replace(
        'The approved application describes a single dwelling occupied by the borrower on completion, vacant possession, and no retained tenants.',
        'The original application described owner occupancy; the later lender approval on page 2 supersedes that occupancy condition.',
      );
      lender.pages[1] =
        'SYNTHETIC EVALUATION VARIANT. Summit signed replacement instructions: We have reviewed the executed tenancy amendment and buyer intended-use statement. We approve retention of the basement tenant through June 30, 2027 and temporary rental of the main floor for six months before buyer occupation. Advance remains CAD 500,000. Counsel reconciled statement: price CAD 700,000, costs CAD 5,000, total CAD 705,000; deposit CAD 35,000 credited once against purchase price; additional buyer funds CAD 170,000; authorized lender advance CAD 500,000. Total available CAD 705,000. The CAD 515,000 broker proposal is withdrawn and will not be used. This approval addresses financing only, not municipal compliance or existing debt releases.';
    }
    if (variant === 'lender-records-absent')
      snapshot.documents = snapshot.documents.filter((d) => d.title !== '03-lender.pdf');
    const mode = variant === 'complex-original' ? 'cross' : 'specialist';
    const review: Review = {
      id: uid(),
      caseId: snapshot.caseId,
      branchId: snapshot.branchId,
      revision: 1,
      snapshot,
      mode,
      ...(mode === 'specialist' ? { selectedReviewer: 'mortgage' as const } : {}),
      status: 'running',
      stage: 0,
      stageName: 'Starting',
      pauseRequested: false,
      findings: [],
      exchanges: [],
      brief: '',
      needsRerun: false,
      createdAt: now(),
      usage: [],
    };
    store.put('case', review.caseId, owner, { id: review.caseId });
    store.put('branch', review.branchId, owner, { id: review.branchId, revision: 1 });
    store.put('review', review.id, owner, review);
    console.log('START ' + variant + ' ' + outDir);
    const startedAt = Date.now();
    await flow.run(owner, review.id);
    const result = store.get<Review>('review', review.id)!;
    const citations = result.findings.flatMap((f) => f.citations);
    results.push({
      variant,
      status: result.status,
      error: result.error,
      coverageStatus: result.coverageStatus,
      durationMs: result.durationMs,
      wallClockMs: Date.now() - startedAt,
      usage: result.usage,
      citationMatches: citations.filter((c) => c.verified).length,
      citationCount: citations.length,
      unverifiedFindings: result.findings.filter((f) => f.validationWarnings.length).length,
      review: result,
    });
    await writeFile(
      resolve(outDir, 'results.json'),
      JSON.stringify({ live: true, generatedAt: now(), results }, null, 2),
    );
    console.log('DONE ' + variant + ' ' + result.status + ' ' + result.coverageStatus);
  }
} finally {
  flow.close();
  store.close();
}
