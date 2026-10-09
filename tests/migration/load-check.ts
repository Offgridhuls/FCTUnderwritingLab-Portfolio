import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dotnetExecutable } from '../../scripts/dotnet';

const port = 4325;
const base = `http://127.0.0.1:${port}/api/v1`;
const server = spawn(
  dotnetExecutable(),
  ['backend/Underwriting.FixtureHost/bin/Debug/net10.0/Underwriting.FixtureHost.dll'],
  {
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      FCT_ACCESS_CODE: 'load-test-only',
      FCT_FIXTURE_DELAY: '500',
      FCT_DOTNET_DATA_DIR: await mkdtemp(join(tmpdir(), 'fct-load-')),
    },
  },
);
async function request(path: string, token = '', body?: unknown) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await request('/cases');
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  const sessions = await Promise.all(
    Array.from(
      { length: 26 },
      async () => (await request('/sessions', '', { accessCode: 'load-test-only' })).body,
    ),
  );
  const starts = await Promise.all(
    sessions.map((session) =>
      request('/reviews', session.token, {
        caseId: session.caseId,
        branchId: session.branchId,
        expectedRevision: 1,
        commandId: crypto.randomUUID(),
        mode: 'cross',
      }),
    ),
  );
  const accepted = starts.filter((reply) => reply.status === 200).length;
  const rejected = starts.filter((reply) => reply.status === 429).length;
  assert.equal(accepted + rejected, 26);
  assert.ok(accepted >= 20 && accepted <= 22);
  assert.ok(rejected >= 4);
  const latencies = [];
  for (let sample = 0; sample < 12; sample++) {
    const started = performance.now();
    assert.equal((await request('/cases', sessions[0].token)).status, 200);
    assert.equal((await request('/events?after=0', sessions[0].token)).status, 200);
    latencies.push(performance.now() - started);
  }
  const maxReadPairMs = Math.max(...latencies);
  assert.ok(maxReadPairMs < 1000, `Case/progress reads exceeded one second: ${maxReadPairMs}`);
  for (const [index, reply] of starts.entries()) {
    if (reply.status === 429)
      assert.deepEqual(
        (await request(`/branches/${sessions[index].branchId}/reviews`, sessions[index].token))
          .body,
        [],
      );
    else
      await request(`/reviews/${reply.body.id}/cancel`, sessions[index].token, {
        caseId: sessions[index].caseId,
        branchId: sessions[index].branchId,
        expectedRevision: 1,
        commandId: crypto.randomUUID(),
      });
  }
  const report = {
    at: new Date().toISOString(),
    submitted: 26,
    accepted,
    rejected,
    maxReadPairMs: Math.round(maxReadPairMs),
    fixtureDelayMs: 500,
    note: 'Local synthetic load check. Two review workers, six model-call permits, twenty waiting slots. Cancelled after admission/read responsiveness checks; not a throughput benchmark.',
  };
  await mkdir('docs/evaluation', { recursive: true });
  await writeFile('docs/evaluation/dotnet-load.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  server.kill();
}
