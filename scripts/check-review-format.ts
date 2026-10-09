import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.js';
import { Workflow, reviewSchema } from '../server/workflow.js';
import { CodexModel } from '../server/model.js';
import { coverageTask } from '../server/coverage.js';
import { validateFinding } from '../server/evidence.js';
import type { Review } from '../shared/types.js';
const source = new DatabaseSync('.data/lab.sqlite', { readOnly: true });
const row = source
  .prepare("SELECT data FROM records WHERE kind='review' AND id=?")
  .get(process.argv[2]) as { data: string };
source.close();
if (!row) throw new Error('Saved review not found');
const store = new Store(mkdtempSync(join(tmpdir(), 'fct-format-check-')));
const model = new CodexModel();
const workflow = new Workflow(store, model);
const original = JSON.parse(row.data) as Review;
try {
  await Promise.all(
    ['ownership', 'property'].map(async (role) => {
      const r = structuredClone(original);
      r.id += '-' + role;
      r.status = 'running';
      r.activities = [];
      r.usage = [];
      store.put('case', r.caseId, 'check', { id: r.caseId });
      store.put('review', r.id, 'check', r);
      try {
        const data = await (workflow as any).ask(
          'check',
          r,
          role,
          `Independently review only your assigned area. Return findings, summary and coverage. Do not force findings. ${coverageTask(r, role as any)}`,
          reviewSchema,
        );
        const warnings = data.findings.flatMap(
          (f: any) =>
            validateFinding(
              { ...f, id: 'probe', reviewer: role, validationWarnings: [] },
              r.snapshot,
            ).validationWarnings,
        );
        console.log(
          JSON.stringify({
            role,
            status: 'passed structure',
            attempts: r.activities?.[0].attempt,
            findings: data.findings.length,
            citationWarnings: warnings,
          }),
        );
      } catch (e: any) {
        console.log(JSON.stringify({ role, status: 'failed', error: e.message }));
        process.exitCode = 1;
      }
    }),
  );
} finally {
  workflow.close();
  store.db.close();
}
