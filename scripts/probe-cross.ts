import { CodexModel } from '../server/model';
import { Store, uid, now } from '../server/store';
import { Workflow } from '../server/workflow';
import { seedDocuments, RULES_VERSION } from '../server/seed';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type { Review, Snapshot } from '../shared/types';
const dir = resolve('.data/cross-review-probe', String(Date.now()));
const store = new Store(dir);
const model = new CodexModel();
const flow = new Workflow(store, model);
const documents = (await seedDocuments(join(dir, 'documents'))).filter(
  (d) => !['authorization', 'payout-updated', 'municipal-clear'].includes(d.id),
);
const snapshot: Snapshot = {
  caseId: uid(),
  branchId: uid(),
  revision: 1,
  closingDate: '2026-10-15',
  purchasePrice: 700000,
  loanAmount: 500000,
  assumptions: [],
  documents,
  rulesVersion: RULES_VERSION,
};
store.put('case', snapshot.caseId, 'probe', { id: snapshot.caseId });
store.put('branch', snapshot.branchId, 'probe', {
  ...snapshot,
  documentIds: documents.map((d) => d.id),
});
const r: Review = {
  id: uid(),
  caseId: snapshot.caseId,
  branchId: snapshot.branchId,
  revision: 1,
  snapshot,
  mode: 'cross',
  status: 'running',
  stage: 1,
  stageName: 'Cross-review',
  pauseRequested: false,
  findings: [
    {
      id: uid(),
      issueCode: 'PAYOUT',
      reviewer: 'mortgage',
      title: 'Payout supplied',
      severity: 'clear',
      status: 'resolved',
      explanation: 'A payout statement was supplied, so no further mortgage check is required.',
      nextCheck: 'None.',
      citations: [
        {
          documentId: 'payout',
          page: 1,
          quote: 'Payout amount: CAD 381,250.00. Valid through: 2026-10-12.',
          verified: true,
        },
      ],
      validationWarnings: [],
    },
  ],
  exchanges: [],
  brief: '',
  needsRerun: false,
  createdAt: now(),
  usage: [],
};
store.put('review', r.id, 'probe', r);
try {
  await flow.run('probe', r.id);
  const out = store.get<Review>('review', r.id)!;
  await mkdir('docs/evaluation', { recursive: true });
  await writeFile(
    'docs/evaluation/cross-review-recovery.json',
    JSON.stringify(
      {
        test: 'Deliberately injected incomplete payout finding; tests whether a live peer catches a missed date comparison. This is a test fixture, not a naturally produced independent review.',
        live: true,
        review: out,
      },
      null,
      2,
    ),
  );
  console.log({
    status: out.status,
    error: out.error,
    challenges: out.exchanges.filter((e) => e.kind === 'challenge'),
    responses: out.exchanges.filter((e) => e.kind === 'response'),
    final: out.findings.map((f) => ({ code: f.issueCode, status: f.status })),
  });
} finally {
  flow.close();
  store.close();
}
