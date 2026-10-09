import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.js';
import { Workflow } from '../server/workflow.js';
import { CodexModel } from '../server/model.js';
import type { Review } from '../shared/types.js';
const db = new DatabaseSync('.data/lab.sqlite', { readOnly: true });
const row = db
  .prepare("SELECT data FROM records WHERE kind='review' AND id=?")
  .get(process.argv[2]) as { data: string };
if (!row) throw new Error('Review not found');
const review = JSON.parse(row.data) as Review;
const store = new Store(mkdtempSync(join(tmpdir(), 'fct-cross-check-')));
for (const [kind, id] of [
  ['case', review.caseId],
  ['branch', review.branchId],
]) {
  const saved = db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(kind, id) as {
    data: string;
  };
  store.put(kind, id, 'check', JSON.parse(saved.data));
}
db.close();
const workflow = new Workflow(store, new CodexModel());
review.status = 'running';
review.stage = 1;
review.error = undefined;
review.activities = [];
review.exchanges = review.exchanges.filter(
  (e) => !['challenge', 'response', 'lead'].includes(e.kind),
);
store.put('review', review.id, 'check', review);
try {
  await workflow.run('check', review.id);
  const result = store.get<Review>('review', review.id)!;
  console.log(
    JSON.stringify(
      {
        status: result.status,
        error: result.error,
        brief: !!result.brief,
        coverageStatus: result.coverageStatus,
        activities: result.activities?.map((a) => ({
          reviewer: a.reviewer,
          stage: a.stage,
          state: a.state,
          attempt: a.attempt,
        })),
      },
      null,
      2,
    ),
  );
  if (result.status !== 'completed') process.exitCode = 1;
} finally {
  workflow.close();
  store.db.close();
}
