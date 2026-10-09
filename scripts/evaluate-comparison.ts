import { DatabaseSync } from 'node:sqlite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Store, uid, now } from '../server/store';
import { Workflow } from '../server/workflow';
import { CodexModel } from '../server/model';
import { compareReviews } from '../server/comparison';
import type { Review, Branch } from '../shared/types';
const db = new DatabaseSync('.data/lab.sqlite', { readOnly: true });
const rows = (kind: string) =>
  db
    .prepare('SELECT data FROM records WHERE kind=? ORDER BY rowid')
    .all(kind)
    .map((r: any) => JSON.parse(r.data));
const branches: Branch[] = rows('branch'),
  reviews: Review[] = rows('review');
db.close();
const corrected = branches.filter((b) => b.name === 'Corrected documents').at(-1)!;
const originals = [branches.find((b) => b.id === corrected?.parentId)!, corrected];
if (originals.some((b) => !b)) throw new Error('Original and corrected branch required');
const out = resolve('docs/evaluation/comparison-' + Date.now());
await mkdir(out, { recursive: true });
const store = new Store(resolve(out, 'data')),
  model = new CodexModel(),
  workflow = new Workflow(store, model),
  owner = 'comparison-evaluation';
const results: any[] = [],
  clones: Branch[] = [];
try {
  for (const sourceBranch of originals) {
    const source = reviews
      .filter((r) => r.branchId === sourceBranch.id && r.revision === sourceBranch.revision)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!source) throw new Error('Current source snapshot required');
    const snapshot = structuredClone(source.snapshot);
    snapshot.branchId = uid();
    snapshot.caseId = 'comparison-evaluation';
    snapshot.revision = 1;
    const branch = { ...sourceBranch, id: snapshot.branchId, caseId: snapshot.caseId, revision: 1 };
    clones.push(branch);
    const r: Review = {
      id: uid(),
      caseId: snapshot.caseId,
      branchId: snapshot.branchId,
      revision: 1,
      snapshot,
      mode: 'cross',
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
    store.put('case', r.caseId, owner, { id: r.caseId });
    store.put('branch', branch.id, owner, branch);
    store.put('review', r.id, owner, r);
    console.log('START ' + branch.name + ' ' + out);
    const start = Date.now();
    await workflow.run(owner, r.id);
    const final = store.get<Review>('review', r.id)!;
    results.push({ name: branch.name, wallClockMs: Date.now() - start, review: final });
    await writeFile(resolve(out, 'results.json'), JSON.stringify(results, null, 2));
    console.log('DONE ' + branch.name + ' ' + final.status);
  }
  const comparison = compareReviews(
    clones[0],
    clones[1],
    results.map((x) => x.review),
    [],
  );
  await writeFile(resolve(out, 'comparison.json'), JSON.stringify(comparison, null, 2));
} finally {
  workflow.close();
  store.close();
}
