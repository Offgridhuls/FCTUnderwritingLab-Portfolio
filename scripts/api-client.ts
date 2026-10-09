/** Minimal headless client. No React, DOM, browser storage, or game engine. */
const base = process.env.FCT_API_URL || 'http://127.0.0.1:4317/api/v1';
const accessCode = process.env.FCT_ACCESS_CODE;
if (!accessCode) throw new Error('Set FCT_ACCESS_CODE to the code printed by the server.');
let token = '';
async function request(path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.message);
  return result;
}
const session = await request('/sessions', { accessCode });
token = session.token;
const envelope = { caseId: session.caseId, branchId: session.branchId, expectedRevision: 1 };
const review = await request('/reviews', {
  ...envelope,
  commandId: crypto.randomUUID(),
  mode: 'cross',
});
let state;
do {
  await new Promise((r) => setTimeout(r, 1000));
  state = await request('/reviews/' + review.id);
} while (state.status === 'running');
if (state.status !== 'completed')
  throw new Error(`Review ${state.status}: ${state.error || state.stageName}`);
const finding = state.findings.find((f: any) => f.status === 'open');
if (!finding) throw new Error('No open finding to challenge.');
const intervention = await request('/interventions', {
  ...envelope,
  commandId: crypto.randomUUID(),
  reviewId: review.id,
  findingId: finding.id,
  kind: 'question',
  text: 'What documentary evidence is needed to address this finding?',
});
let response;
do {
  await new Promise((r) => setTimeout(r, 1000));
  response = await request('/interventions/' + intervention.id);
} while (['queued', 'processing'].includes(response.state));
console.log({
  reviewStatus: state.status,
  interventionState: response.state,
  disposition: response.disposition,
  explanation: response.response,
  error: response.error,
});
export {};
