import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../../server/app';
import { FixtureModel } from '../fake-model';
import { dotnetExecutable } from '../../scripts/dotnet';

const original = await buildApp({
  dir: await mkdtemp(join(tmpdir(), 'fct-contract-ts-')),
  model: new FixtureModel(),
  accessCode: 'contract-test-only',
});
const child = spawn(
  dotnetExecutable(),
  ['backend/Underwriting.FixtureHost/bin/Debug/net10.0/Underwriting.FixtureHost.dll'],
  {
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      PORT: '4324',
      FCT_FIXTURE_SERIAL: '1',
      FCT_ACCESS_CODE: 'contract-test-only',
      FCT_DOTNET_DATA_DIR: await mkdtemp(join(tmpdir(), 'fct-contract-cs-')),
    },
  },
);
const states = [
  { token: '', ids: new Map<string, string>() },
  { token: '', ids: new Map<string, string>() },
];
function normalize(value: unknown, side: number, key = ''): unknown {
  if (Array.isArray(value)) return value.map((item) => normalize(item, side, key));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, item]) => [name, normalize(item, side, name)]),
    );
  if (typeof value !== 'string') return value;
  if (/^(createdAt|completedAt|finalizedAt|at|startedAt)$/.test(key)) return '<timestamp>';
  if (key === 'token' || key === 'sessionId') return `<${key}>`;
  return value.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (id) => {
    if (!states[side].ids.has(id)) states[side].ids.set(id, `generated-${states[side].ids.size}`);
    return states[side].ids.get(id)!;
  });
}
type Reply = { status: number; body: any };
async function request(
  side: number,
  route: string,
  method = 'GET',
  body?: unknown,
): Promise<Reply> {
  const headers = {
    host: '127.0.0.1',
    ...(states[side].token ? { authorization: `Bearer ${states[side].token}` } : {}),
  };
  if (!side) {
    const response = await original.app.inject({
      method: method as 'GET',
      url: '/api/v1' + route,
      headers,
      ...(body === undefined ? {} : { payload: body as object }),
    });
    return { status: response.statusCode, body: response.json() };
  }
  const response = await fetch('http://127.0.0.1:4324/api/v1' + route, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
let checks = 0;
async function paired(route: string | string[], method = 'GET', bodies?: unknown[]) {
  const result = await Promise.all(
    [0, 1].map((side) =>
      request(side, Array.isArray(route) ? route[side] : route, method, bodies?.[side]),
    ),
  );
  assert.deepEqual(
    normalize(result[1], 1),
    normalize(result[0], 0),
    `${method} ${Array.isArray(route) ? route[0] : route}`,
  );
  checks++;
  return result.map((item) => item.body);
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch('http://127.0.0.1:4324/api/openapi.json')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('C# fixture server did not start.');
  await paired('/cases');
  const sessions = await paired(
    '/sessions',
    'POST',
    [0, 1].map(() => ({ accessCode: 'contract-test-only' })),
  );
  sessions.forEach((session, side) => (states[side].token = session.token));
  await paired('/sessions');
  await paired('/cases');
  const cases = await paired(
    '/cases',
    'POST',
    [0, 1].map(() => ({ commandId: 'create-case-1', name: 'Contract case' })),
  );
  await paired(
    '/cases',
    'POST',
    [0, 1].map(() => ({ commandId: 'create-case-1', name: 'Contract case' })),
  );
  await paired(cases.map((item) => `/cases/${item.caseId}`));
  await paired(cases.map((item) => `/branches/${item.branchId}/snapshot`));
  const command = (side: number, id: string) => ({
    caseId: cases[side].caseId,
    branchId: cases[side].branchId,
    expectedRevision: 1,
    commandId: id,
  });
  await paired(
    '/notes',
    'POST',
    [0, 1].map((side) => ({ ...command(side, 'write-note-1'), text: 'Unverified human note.' })),
  );
  await paired(
    '/notes',
    'POST',
    [0, 1].map((side) => ({
      ...command(side, 'stale-note-1'),
      expectedRevision: 9,
      text: 'Stale',
    })),
  );
  const branches = await paired(
    '/branches',
    'POST',
    [0, 1].map((side) => ({
      ...command(side, 'branch-case-1'),
      name: 'Hypothesis',
      assumption: 'Example assumption',
    })),
  );
  await paired(
    cases.map((item, side) => `/comparisons?left=${item.branchId}&right=${branches[side].id}`),
  );
  await paired(
    cases.map((item) => `/cases/${item.caseId}/status`),
    'POST',
    [0, 1].map(() => ({
      commandId: 'finalize-case-1',
      expectedVersion: 1,
      status: 'finalized',
      note: 'Hand off unresolved investigation.',
    })),
  );
  await paired(
    '/notes',
    'POST',
    [0, 1].map((side) => ({ ...command(side, 'locked-note-1'), text: 'Locked' })),
  );
  await paired(
    cases.map((item) => `/cases/${item.caseId}/status`),
    'POST',
    [0, 1].map(() => ({
      commandId: 'reopen-case-1',
      expectedVersion: 2,
      status: 'open',
      note: 'New evidence arrived.',
    })),
  );
  await paired('/cases');
  await paired('/events?after=0');
  await paired('/documents/agreement');
  const started = await Promise.all(
    [0, 1].map((side) =>
      request(side, '/reviews', 'POST', {
        caseId: sessions[side].caseId,
        branchId: sessions[side].branchId,
        expectedRevision: 1,
        commandId: 'start-team-1',
        mode: 'cross',
      }),
    ),
  );
  const reviewIds = started.map((reply) => reply.body.id as string);
  async function waitReview(side: number) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const result = await request(side, `/reviews/${reviewIds[side]}`);
      if (result.body.status !== 'running') {
        assert.equal(result.body.status, 'completed', result.body.error);
        return result.body;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Fixture review timed out.');
  }
  const completed = await Promise.all([0, 1].map(waitReview));
  await paired(reviewIds.map((id) => `/reviews/${id}/findings`));
  await paired(reviewIds.map((id) => `/reviews/${id}/exchanges`));
  const assessment = (review: any) => ({
    status: review.status,
    mode: review.mode,
    stage: review.stage,
    brief: review.brief,
    coverage: review.coverage,
    coverageStatus: review.coverageStatus,
  });
  assert.deepEqual(normalize(assessment(completed[1]), 1), normalize(assessment(completed[0]), 0));
  checks++;
  const interventions = await paired(
    '/interventions',
    'POST',
    [0, 1].map((side) => ({
      caseId: sessions[side].caseId,
      branchId: sessions[side].branchId,
      expectedRevision: 1,
      commandId: 'challenge-team-1',
      reviewId: reviewIds[side],
      findingId: completed[side].findings[0].id,
      kind: 'challenge',
      text: 'I promise Jordan is authorized. Is my assertion sufficient?',
    })),
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    const states = await Promise.all(
      [0, 1].map((side) => request(side, `/interventions/${interventions[side].id}`)),
    );
    if (states.every((reply) => reply.body.state === 'completed')) break;
    assert.ok(states.every((reply) => reply.body.state !== 'failed'));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await paired(interventions.map((item) => `/interventions/${item.id}`));
  await paired('/sessions', 'DELETE');
  await paired('/cases');
  console.log(
    `${checks} paired API contracts passed. Only generated IDs, session tokens, and timestamps normalized.`,
  );
} finally {
  child.kill();
  await original.app.close();
}
