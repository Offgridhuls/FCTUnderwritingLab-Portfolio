import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { buildApp } from '../server/app';
import { FixtureModel } from './fake-model';
import { extractPdf, validateCitation, checks } from '../server/evidence';
import type { Review, Workspace } from '../shared/types';
describe('API-only client / shared web and future VR workflow', () => {
  let lab: Awaited<ReturnType<typeof buildApp>>, model: FixtureModel, dir: string, s: any;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fct-lab-'));
    model = new FixtureModel();
    lab = await buildApp({ dir, model, accessCode: 'test-code' });
    await lab.app.ready();
    s = (
      await lab.app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: { accessCode: 'test-code' },
      })
    ).json();
  });
  afterEach(async () => {
    await wait(() =>
      [...lab.store.all<Review>('review')].every((x) => x.value.status !== 'running'),
    ).catch(() => {});
    await lab.app.close();
    await rm(dir, { recursive: true, force: true });
  });
  const request = async (
    path: string,
    payload?: any,
    method: any = payload ? 'POST' : 'GET',
    token = s?.token,
  ) => {
    const res = await lab.app.inject({
      method,
      url: '/api/v1' + path,
      headers: { authorization: 'Bearer ' + token },
      payload,
    });
    return {
      status: res.statusCode,
      data: res.headers['content-type']?.includes('json') ? res.json() : res.body,
    };
  };
  const cmd = (extra: any = {}) => ({
    caseId: s.caseId,
    branchId: s.branchId,
    expectedRevision: 1,
    commandId: crypto.randomUUID(),
    ...extra,
  });
  const workspace = async () =>
    (await request(`/branches/${s.branchId}/snapshot`)).data as Workspace;
  const run = async () => {
    const r = await request('/reviews', cmd({ mode: 'cross' }));
    await wait(() => lab.store.get<Review>('review', r.data.id)?.status !== 'running');
    return (await request('/reviews/' + r.data.id)).data as Review;
  };
  it('compares selected branch reviews with ownership and membership validation', async () => {
    const original = await run();
    const branched = (await request('/branches', cmd({ name: 'Compared branch' }))).data;
    const response = await request(
      `/comparisons?left=${s.branchId}&right=${branched.id}&beforeReviewId=${original.id}`,
    );
    expect(response.status).toBe(200);
    expect(response.data.left.id).toBe(original.id);
    expect(response.data.topics).toHaveLength(19);
    expect(response.data.incomplete).toBe(true);
    expect(response.data.changes).toBeDefined();
    expect(
      (
        await request(
          `/comparisons?left=${s.branchId}&right=${branched.id}&afterReviewId=${original.id}`,
        )
      ).status,
    ).toBe(404);
    expect((await request(`/comparisons?left=${s.branchId}&right=${s.branchId}`)).status).toBe(400);
    const other = (
      await lab.app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: { accessCode: 'test-code' },
      })
    ).json();
    expect(
      (
        await request(
          `/comparisons?left=${s.branchId}&right=${branched.id}`,
          undefined,
          'GET',
          other.token,
        )
      ).status,
    ).toBe(404);
  });
  it('creates isolated cases and finalizes/reopens without deleting evidence', async () => {
    const original = await workspace();
    const body = {
      commandId: crypto.randomUUID(),
      name: 'Independent case',
      address: '42 Test Road',
      closingDate: '2026-11-10',
      purchasePrice: 900000,
      loanAmount: 600000,
    };
    const created = await request('/cases', body);
    expect(created.status).toBe(200);
    expect((await request('/cases', body)).data.caseId).toBe(created.data.caseId);
    const fresh = (await request(`/branches/${created.data.branchId}/snapshot`)).data as Workspace;
    expect(fresh.snapshot.documents).toHaveLength(0);
    expect(fresh.reveals).toHaveLength(0);
    expect(fresh.snapshot.address).toBe('42 Test Road');
    expect((await workspace()).snapshot.documents).toEqual(original.snapshot.documents);
    const close = {
      commandId: crypto.randomUUID(),
      expectedVersion: 1,
      status: 'finalized',
      note: 'Closed with outstanding review; handed off.',
    };
    const path = `/cases/${s.caseId}/status`;
    expect((await request(path, close)).data.status).toBe('finalized');
    expect((await request(path, close)).data.version).toBe(2);
    expect((await request('/notes', cmd({ text: 'blocked' }))).status).toBe(409);
    expect((await request('/reviews', cmd())).status).toBe(409);
    expect((await workspace()).snapshot.documents).toEqual(original.snapshot.documents);
    expect(
      (await request(path, { ...close, commandId: crypto.randomUUID(), status: 'open' })).status,
    ).toBe(409);
    expect(
      (
        await request(path, {
          ...close,
          commandId: crypto.randomUUID(),
          expectedVersion: 2,
          status: 'open',
        })
      ).data.lifecycle,
    ).toHaveLength(2);
    expect((await request('/notes', cmd({ text: 'allowed again' }))).status).toBe(200);
    const other = (
      await lab.app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: { accessCode: 'test-code' },
      })
    ).json();
    expect(
      (await request(path, { ...close, commandId: crypto.randomUUID() }, 'POST', other.token))
        .status,
    ).toBe(404);
  });
  it('rejects finalization while a review is active', async () => {
    model.delay = 50;
    await request('/reviews', cmd());
    expect(
      (
        await request(`/cases/${s.caseId}/status`, {
          commandId: crypto.randomUUID(),
          expectedVersion: 1,
          status: 'finalized',
          note: 'Closing',
        })
      ).status,
    ).toBe(409);
  });
  it('requires confirmation, retains corrections and rejects stale detail edits', async () => {
    const created = (
      await request('/cases', { commandId: crypto.randomUUID(), name: 'Upload first' })
    ).data;
    const { extractDetails } = await import('../server/details');
    const b = lab.store.get<any>('branch', created.branchId)!;
    const doc = {
      id: 'extracted',
      kind: 'agreement',
      title: 'Agreement',
      pages: [
        'Seller: Morgan Ellis. Buyer: Alex Chen. Purchase price: CAD 700,000. Proposed closing: 2026-10-15.',
      ],
      file: 'unused',
      warnings: [],
      createdAt: new Date().toISOString(),
    };
    const originalCase = lab.store.get<any>('case', created.caseId)!;
    lab.store.put('document', 'extracted:' + originalCase.sessionId, originalCase.sessionId, doc);
    b.documentIds = ['extracted'];
    b.revision = 2;
    b.details = extractDetails([doc], 2);
    lab.store.put('branch', b.id, originalCase.sessionId, b);
    const envelope = {
      caseId: created.caseId,
      branchId: b.id,
      expectedRevision: 2,
      commandId: crypto.randomUUID(),
    };
    expect((await request('/reviews', envelope)).status).toBe(409);
    const values = {
      seller: 'Corrected Seller',
      buyer: 'Alex Chen',
      address: '',
      parcel: '',
      purchasePrice: '700000',
      loanAmount: '',
      closingDate: '2026-10-15',
    };
    const body = { ...envelope, commandId: crypto.randomUUID(), values };
    const confirmed = await request(`/branches/${b.id}/details`, body);
    expect(confirmed.data.details.origins.seller).toBe('user');
    expect(confirmed.data.details.origins.buyer).toBe('document');
    expect(confirmed.data.details.origins.loanAmount).toBe('unknown');
    expect((await request(`/branches/${b.id}/details`, body)).data.revision).toBe(3);
    expect(
      (await request(`/branches/${b.id}/details`, { ...body, commandId: crypto.randomUUID() }))
        .status,
    ).toBe(409);
    const w = (await request(`/branches/${b.id}/snapshot`)).data;
    expect(checks(w.snapshot).loanExceedsPurchase).toBe(null);
    expect((await request(`/branches/${b.id}/details/history`)).data).toHaveLength(1);
    expect(w.branch.details.candidates.seller[0].value).toBe('Morgan Ellis');
    expect(
      (await request('/cases')).data.find((c: any) => c.id === created.caseId).displayAddress,
    ).toBe('');
    const stored = lab.store.get<any>('branch', b.id)!;
    stored.details.values.address = '123 Confirmed Street';
    lab.store.put('branch', b.id, originalCase.sessionId, stored);
    const alternate = structuredClone(stored);
    alternate.id = 'alternate-address';
    alternate.details.values.address = '999 Hypothetical Road';
    lab.store.put('branch', alternate.id, originalCase.sessionId, alternate);
    originalCase.branchIds.push(alternate.id);
    lab.store.put('case', originalCase.id, originalCase.sessionId, originalCase);
    expect(
      (await request('/cases')).data.find((c: any) => c.id === created.caseId).displayAddress,
    ).toBe('123 Confirmed Street');
  });
  it('detects planted issues; does not accuse explained name discrepancy; cites actual pages', async () => {
    const r = await run();
    expect(r.status).toBe('completed');
    expect(
      r.findings
        .filter((f) => f.status === 'open')
        .map((f) => f.issueCode)
        .sort(),
    ).toEqual(['AUTHORITY', 'MUNICIPAL', 'PAYOUT']);
    expect(r.findings.find((f) => f.issueCode === 'NAME_RECONCILIATION')?.status).toBe('resolved');
    expect(r.findings.every((f) => f.citations.every((c) => c.verified))).toBe(true);
    expect(r.exchanges.some((e) => e.kind === 'challenge')).toBe(true);
    for (const f of r.findings) {
      const c = f.citations[0];
      const d = (await request('/documents/' + c.documentId)).data;
      expect(d.pages[c.page - 1]).toContain(c.quote);
    }
  });
  it('runs only the selected specialist plus scoped lead and preserves prior reviews', async () => {
    const original = await run();
    model.calls = [];
    const body = cmd({ mode: 'specialist', selectedReviewer: 'mortgage' });
    const started = await request('/reviews', body);
    const duplicate = await request('/reviews', body);
    expect(duplicate.data.id).toBe(started.data.id);
    await wait(() => lab.store.get<Review>('review', started.data.id)?.status === 'completed');
    const r = (await request('/reviews/' + started.data.id)).data as Review;
    expect(r.selectedReviewer).toBe('mortgage');
    expect(model.calls).toHaveLength(3);
    expect(model.calls[0]).toMatch(/^ROLE: mortgage\n/);
    expect(model.calls[1]).toMatch(/^ROLE: lead\n/);
    expect(model.calls[1]).toContain('COVERAGE AUDIT:');
    expect(model.calls[2]).toContain('PARTIAL SCOPE');
    expect(r.findings.map((f) => f.issueCode)).toEqual(['PAYOUT']);
    expect(r.exchanges.some((e) => e.kind === 'challenge')).toBe(false);
    expect(r.brief).toContain('Other specialist areas not assessed');
    expect((await request('/reviews/' + original.id)).data).toEqual(original);
    expect((await request(`/branches/${s.branchId}/export`)).data).toContain('Partial scope');
    const finding = r.findings[0];
    const intervention = await request(
      '/interventions',
      cmd({
        reviewId: r.id,
        findingId: finding.id,
        kind: 'question',
        text: 'Is this valid on closing?',
      }),
    );
    await wait(
      () => lab.store.get<any>('intervention', intervention.data.id)?.state === 'completed',
    );
    expect(model.calls.at(-2)).toMatch(/^ROLE: mortgage\n/);
    expect(model.calls.at(-1)).toContain('PARTIAL SCOPE');
  });
  it.each([false, true])(
    'retries an invalid revised citation once; persistent failure=%s',
    async (persistent) => {
      const original = model.complete.bind(model);
      let correctedCalls = 0;
      let revised: any;
      model.complete = async (prompt) => {
        const result = await original(prompt);
        const data = JSON.parse(result.text);
        if (prompt.includes('complete set of peer challenges')) {
          revised = JSON.parse(prompt.split('Findings: ')[1].split('. Challenges:')[0])[0];
          data.responses[0].disposition = 'narrow';
          data.responses[0].revisedFinding = {
            ...revised,
            citations: revised.citations.map((c: any) => ({ ...c, page: 99 })),
          };
        } else if (prompt.includes('CORRECTION REQUIRED:')) {
          correctedCalls++;
          data.disposition = 'narrow';
          data.revisedFinding = {
            ...revised,
            citations: revised.citations.map((c: any) => ({
              ...c,
              page: persistent ? 99 : c.page,
            })),
          };
        }
        return { ...result, text: JSON.stringify(data) };
      };
      const r = await run();
      expect(correctedCalls).toBe(1);
      expect(r.status).toBe(persistent ? 'failed' : 'completed');
      if (persistent) {
        expect(r.error).toContain('p.99');
        expect(r.error).toContain('Original finding retained');
        expect(r.findings.find((f) => f.id === revised.id)?.citations).toEqual(revised.citations);
        expect(r.exchanges.some((e) => e.kind === 'response')).toBe(false);
      } else {
        expect(r.exchanges.some((e) => e.kind === 'response' && e.disposition === 'narrow')).toBe(
          true,
        );
        expect(r.brief).not.toBe('');
      }
    },
  );
  it('validates replacement withdrawal evidence instead of rejecting old citation warnings', async () => {
    const r = await run();
    const f = r.findings[0];
    f.citations = [];
    f.validationWarnings = ['No documentary citation supplied. Finding is unverified.'];
    const storedCase = lab.store.get<any>('case', r.caseId)!;
    lab.store.put('review', r.id, storedCase.sessionId, r);
    const original = model.complete.bind(model);
    model.complete = async (prompt) => {
      const result = await original(prompt);
      if (!prompt.includes('Respond once to this human')) return result;
      const data = JSON.parse(result.text);
      data.disposition = 'withdraw';
      data.revisedFinding = null;
      return { ...result, text: JSON.stringify(data) };
    };
    const i = (
      await request(
        '/interventions',
        cmd({
          reviewId: r.id,
          findingId: f.id,
          kind: 'question',
          text: 'Please reassess using the supplied evidence.',
        }),
      )
    ).data;
    await wait(() =>
      ['completed', 'failed'].includes(lab.store.get<any>('intervention', i.id)?.state),
    );
    expect(lab.store.get<any>('intervention', i.id)?.state).toBe('completed');
    const updated = (await request('/reviews/' + r.id)).data as Review;
    const withdrawn = updated.findings.find((x) => x.id === f.id)!;
    expect(withdrawn.status).toBe('withdrawn');
    expect(withdrawn.validationWarnings).toEqual([]);
    expect(withdrawn.citations.every((c) => c.verified)).toBe(true);
  });
  it.each([false, true])(
    'performs one specialist coverage recheck and preserves persistent gaps=%s',
    async (persistent) => {
      const original = model.complete.bind(model);
      model.complete = async (prompt) => {
        const result = await original(prompt);
        const data = JSON.parse(result.text);
        if (prompt.startsWith('ROLE: mortgage') && prompt.includes('Independently review')) {
          if (!prompt.includes('SPECIALIST RECHECK') || persistent)
            data.coverage = data.coverage.filter((c: any) => c.topicId !== 'lender_occupancy');
          else {
            const finding = {
              ...data.findings[0],
              issueCode: 'LIEN_OCCUPANCY',
              title: 'Lender occupancy conflict',
            };
            data.findings.push(finding);
            data.coverage.find((c: any) => c.topicId === 'lender_occupancy').findingIssueCodes = [
              'LIEN_OCCUPANCY',
            ];
          }
        }
        return { ...result, text: JSON.stringify(data) };
      };
      const r = await run();
      expect(r.status).toBe('completed');
      expect(r.coverageRechecked).toEqual(['mortgage']);
      expect(model.calls.filter((p) => p.includes('SPECIALIST RECHECK'))).toHaveLength(1);
      expect(r.coverageHistory?.[0].findings.some((f) => f.issueCode === 'PAYOUT')).toBe(true);
      expect(r.coverageStatus).toBe(persistent ? 'incomplete' : 'complete');
      expect(r.coverage?.find((c) => c.topicId === 'lender_occupancy')?.gaps.length === 0).toBe(
        !persistent,
      );
      if (!persistent)
        expect(
          model.calls.find(
            (p) => p.includes('Cross-review other') && p.startsWith('ROLE: ownership'),
          ),
        ).toContain('Lender occupancy conflict');
      expect(model.calls.at(-1)).toContain('COVERAGE STATUS: ' + r.coverageStatus);
    },
  );
  it('routes evidence-based audit omissions to the owning specialist', async () => {
    const original = model.complete.bind(model);
    model.complete = async (prompt) => {
      const result = await original(prompt);
      const data = JSON.parse(result.text);
      if (prompt.includes('COVERAGE AUDIT:'))
        data.questions = [
          {
            topicId: 'funds_reconciliation',
            text: 'Recheck authorized advance against the proposed funds ledger.',
            citations: [],
          },
        ];
      return { ...result, text: JSON.stringify(data) };
    };
    const r = await run();
    expect(r.coverageRechecked).toEqual(['mortgage']);
    expect(r.exchanges.find((e) => e.kind === 'coverage-check')?.target).toBe('mortgage');
    expect(
      r.exchanges.some((e) => e.kind === 'coverage-recheck' && e.reviewer === 'mortgage'),
    ).toBe(true);
    expect(
      r.coverage?.find((c) => c.topicId === 'funds_reconciliation')?.auditResponse,
    ).toBeTruthy();
  });
  it.each(['interrupted', 'duplicate', 'citation'])(
    'retains originals when a recheck is %s',
    async (failure) => {
      const original = model.complete.bind(model);
      model.complete = async (prompt) => {
        if (prompt.includes('SPECIALIST RECHECK') && failure === 'interrupted')
          throw new Error('Recheck connection interrupted');
        const result = await original(prompt);
        const data = JSON.parse(result.text);
        if (prompt.startsWith('ROLE: mortgage') && prompt.includes('Independently review'))
          data.coverage = [];
        if (prompt.includes('SPECIALIST RECHECK') && failure === 'duplicate')
          data.findings.push(data.findings[0]);
        if (prompt.includes('SPECIALIST RECHECK') && failure === 'citation')
          data.findings[0].citations[0].page = 999;
        return { ...result, text: JSON.stringify(data) };
      };
      const r = await run();
      expect(r.status).toBe('failed');
      expect(r.coverageStatus).toBe('incomplete');
      expect(r.findings.some((f) => f.issueCode === 'PAYOUT')).toBe(true);
      expect(r.coverageHistory).toHaveLength(1);
    },
  );
  it('rebuilds only the lead brief without changing the source review', async () => {
    const original = await run();
    model.calls = [];
    const body = cmd({ rebuildBriefFrom: original.id });
    const started = await request('/reviews', body);
    expect((await request('/reviews', body)).data.id).toBe(started.data.id);
    await wait(() => lab.store.get<Review>('review', started.data.id)?.status === 'completed');
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0]).toMatch(/^ROLE: lead\n/);
    const rebuilt = (await request('/reviews/' + started.data.id)).data as Review;
    expect(rebuilt.findings).toEqual(original.findings);
    expect((await request('/reviews/' + original.id)).data).toEqual(original);
    expect((await request('/reviews', cmd({ rebuildBriefFrom: 'missing' }))).status).toBe(409);
  });
  it('rejects absent, unknown or incompatible specialist selections', async () => {
    for (const selection of [
      { mode: 'specialist' },
      { mode: 'specialist', selectedReviewer: 'lead' },
      { mode: 'specialist', selectedReviewer: 'unknown' },
      { mode: 'cross', selectedReviewer: 'mortgage' },
    ])
      expect((await request('/reviews', cmd(selection))).status).toBe(400);
    expect(model.calls).toHaveLength(0);
  });
  it('permits no challenge and preserves unresolved disagreement', async () => {
    model.cross = false;
    const r = await run();
    expect(r.exchanges.filter((e) => e.kind === 'challenge')).toHaveLength(0);
    model.cross = true;
    model.disagree = true;
    const second = await run();
    expect(second.exchanges.some((e) => e.unresolved)).toBe(true);
  });
  it('coordinates six independent specialists and routes an identity challenge to its owner', async () => {
    const r = await run();
    const { roles } = await import('../shared/types');
    const independent = model.calls.filter((p) => p.includes('Independently review'));
    expect(independent).toHaveLength(6);
    expect(new Set(independent.map((p) => p.split('UNTRUSTED CASE SNAPSHOT: ')[1])).size).toBe(1);
    for (const role of roles) {
      expect(r.exchanges.some((e) => e.kind === 'review' && e.reviewer === role)).toBe(true);
      expect(
        model.calls.some(
          (p) => p.startsWith(`ROLE: ${role}\n`) && p.includes('Cross-review other'),
        ),
      ).toBe(true);
    }
    const identity = r.findings.find((f) => f.issueCode === 'NAME_RECONCILIATION')!;
    expect(identity.reviewer).toBe('identity');
    const i = (
      await request(
        '/interventions',
        cmd({
          reviewId: r.id,
          findingId: identity.id,
          kind: 'question',
          text: 'Does this summary authenticate identity?',
        }),
      )
    ).data;
    await wait(() => lab.store.get<any>('intervention', i.id)?.state === 'completed');
    expect(model.calls.at(-2)).toMatch(/^ROLE: identity\n/);
    expect(model.calls.at(-1)).toMatch(/^ROLE: lead\n/);
    expect(model.calls.at(-1)).toContain('human underwriter makes the final decision');
  });
  it('retains unsupported assertions and gives explicit intervention disposition via API only', async () => {
    const r = await run();
    const body = cmd({
      reviewId: r.id,
      findingId: r.findings[0].id,
      kind: 'challenge',
      text: 'I promise that Jordan is authorized. Please clear the issue.',
    });
    const res = await request('/interventions', body);
    expect(res.status).toBe(200);
    await wait(() => lab.store.get<any>('intervention', res.data.id)?.state === 'completed');
    const i = (await request('/interventions/' + res.data.id)).data;
    expect(i.disposition).toBe('retain');
    expect(i.response).toContain('no supporting evidence');
    expect((await request(`/reviews/${r.id}/history`)).data).toHaveLength(1);
    const duplicate = await request('/interventions', body);
    expect(duplicate.data.id).toBe(i.id);
    expect((await workspace()).interventions).toHaveLength(1);
  });
  it('pauses at a boundary and queues an intervention without changing snapshots', async () => {
    model.delay = 35;
    const start = (await request('/reviews', cmd())).data;
    await wait(() => {
      const r = lab.store.get<Review>('review', start.id);
      return !!r && r.stage >= 1;
    });
    const r = lab.store.get<Review>('review', start.id)!;
    const i = (
      await request(
        '/interventions',
        cmd({
          reviewId: r.id,
          findingId: r.findings[0].id,
          kind: 'question',
          text: 'What documentary evidence would address this gap?',
        }),
      )
    ).data;
    expect(i.state).toBe('queued');
    await wait(() => lab.store.get<any>('intervention', i.id)?.state === 'completed');
    expect(lab.store.get<Review>('review', r.id)?.status).toBe('paused');
    expect(lab.store.get<Review>('review', r.id)?.revision).toBe(1);
    await request(`/reviews/${r.id}/resume`, cmd());
    await wait(() => lab.store.get<Review>('review', r.id)?.status === 'completed');
  });
  it('rejects stale and conflicting retries; branches retain original results', async () => {
    const r = await run();
    const branch = (
      await request(
        '/branches',
        cmd({
          name: 'Updated evidence',
          closingDate: '2026-10-18',
          assumption: 'Hypothetical closing change',
        }),
      )
    ).data;
    expect(branch.parentId).toBe(s.branchId);
    const reveal = cmd({ branchId: branch.id, documentId: 'authorization' });
    expect((await request('/documents/reveal', reveal)).status).toBe(200);
    expect((await request('/documents/reveal', reveal)).status).toBe(200);
    expect(
      (await request('/documents/reveal', { ...reveal, documentId: 'municipal-clear' })).status,
    ).toBe(409);
    expect((await request('/reviews', cmd({ branchId: branch.id }))).status).toBe(409);
    const original = await workspace();
    expect(original.branch.revision).toBe(1);
    expect(original.reviews[0].findings).toEqual(r.findings);
    expect(original.snapshot.documents.some((d) => d.id === 'authorization')).toBe(false);
    const hypo = await request(
      '/interventions',
      cmd({
        reviewId: r.id,
        findingId: r.findings[0].id,
        kind: 'hypothetical',
        text: 'Assume authority exists',
      }),
    );
    expect(hypo.status).toBe(422);
  });
  it('isolates sessions and rejects foreign origins and incorrect evidence references', async () => {
    const other = (
      await lab.app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: { accessCode: 'test-code' },
      })
    ).json();
    expect(
      (await request('/branches/' + s.branchId + '/snapshot', undefined, 'GET', other.token))
        .status,
    ).toBe(404);
    expect(
      (
        await lab.app.inject({
          method: 'POST',
          url: '/api/v1/sessions',
          headers: { origin: 'https://evil.example' },
          payload: { accessCode: 'test-code' },
        })
      ).statusCode,
    ).toBe(403);
    const r = await run();
    expect(
      (
        await request(
          '/interventions',
          cmd({
            reviewId: r.id,
            findingId: r.findings[0].id,
            kind: 'evidence',
            text: 'See this document',
            citation: { documentId: 'authorization', page: 3, quote: 'not in the snapshot' },
          }),
        )
      ).status,
    ).toBe(400);
  });
  it('keeps partial work on model errors and flags invalid citations', async () => {
    model.failure = 'Usage limit reached';
    const r = await run();
    expect(r.status).toBe('failed');
    expect(r.error).toContain('Usage limit');
    model.failure = '';
    model.cross = false;
    model.invalid = true;
    const invalid = await run();
    expect(invalid.findings.every((f) => f.validationWarnings.length > 0)).toBe(true);
  });
  it.each(['syntax', 'shape'])(
    'retries only the affected specialist after a %s error',
    async (kind) => {
      const original = model.complete.bind(model);
      let attempts = 0;
      model.complete = async (prompt) => {
        const result = await original(prompt);
        if (
          prompt.startsWith('ROLE: identity\n') &&
          prompt.includes('Independently review') &&
          ++attempts === 1
        ) {
          if (kind === 'syntax') return { ...result, text: '{"findings": [' };
          const parsed = JSON.parse(result.text);
          parsed.findings[0].known = [{ text: 'Wrong field type' }];
          return { ...result, text: JSON.stringify(parsed) };
        }
        return result;
      };
      const r = await run();
      expect(r.status).toBe('completed');
      expect(attempts).toBe(2);
      expect(r.activities?.find((a) => a.reviewer === 'identity' && a.stage === 0)?.attempt).toBe(
        2,
      );
      expect(r.findings.filter((f) => f.issueCode === 'NAME_RECONCILIATION')).toHaveLength(1);
      expect(
        model.calls.filter(
          (p) => p.startsWith('ROLE: ownership\n') && p.includes('Independently review'),
        ),
      ).toHaveLength(1);
      const retried = model.calls.find((p) => p.includes('FORMAT RETRY:'))!;
      if (kind === 'shape') expect(retried).toContain('findings.0.known: Expected string');
      expect(retried.split('UNTRUSTED CASE SNAPSHOT: ')[1]).toBe(
        model.calls[0].split('UNTRUSTED CASE SNAPSHOT: ')[1],
      );
      expect(
        lab.store
          .eventList(lab.store.all<Review>('review')[0].owner, 0)
          .some((e) => e.type === 'reviewer.retrying'),
      ).toBe(true);
    },
  );
  it('bounds malformed-response retries and preserves completed peers without fabricating a brief', async () => {
    const original = model.complete.bind(model);
    model.complete = async (prompt) => {
      const result = await original(prompt);
      return prompt.startsWith('ROLE: identity\n') ? { ...result, text: 'not JSON' } : result;
    };
    const r = await run();
    expect(r.status).toBe('failed');
    expect(r.error).toContain('Identity returned invalid JSON after 3 attempts');
    expect(model.calls.filter((p) => p.startsWith('ROLE: identity\n'))).toHaveLength(3);
    expect(r.findings.map((f) => f.issueCode).sort()).toEqual(['AUTHORITY', 'MUNICIPAL', 'PAYOUT']);
    expect(r.brief).toBe('');
    expect(r.usage).toHaveLength(8);
  });
  it('persists actionable field diagnostics when structural retries are exhausted', async () => {
    const original = model.complete.bind(model);
    model.complete = async (prompt) => {
      const result = await original(prompt);
      if (!prompt.startsWith('ROLE: identity\n')) return result;
      const parsed = JSON.parse(result.text);
      parsed.findings[0].action = 'x'.repeat(281);
      return { ...result, text: JSON.stringify(parsed) };
    };
    const r = await run();
    expect(r.status).toBe('failed');
    expect(r.error).toContain('findings.0.action');
    expect(r.error).toContain('280');
    expect(r.error).not.toContain('x'.repeat(281));
    expect(r.brief).toBe('');
  });
  it.each([false, true])(
    'validates lead citations before reporting completion (persistent=%s)',
    async (persistent) => {
      const original = model.complete.bind(model);
      let attempts = 0;
      model.complete = async (prompt) => {
        const result = await original(prompt);
        if (!prompt.includes('Produce a concise Markdown investigation brief')) return result;
        attempts++;
        if (!persistent && attempts > 1) return result;
        const data = JSON.parse(result.text);
        data.citations[0].page = 999;
        return { ...result, text: JSON.stringify(data) };
      };
      const r = await run();
      expect(attempts).toBe(persistent ? 3 : 2);
      expect(r.status).toBe(persistent ? 'failed' : 'completed');
      expect(r.activities?.at(-1)?.state).toBe(persistent ? 'failed' : 'completed');
      if (persistent) {
        expect(r.brief).toBe('');
        expect(r.error).toContain('p.999');
      } else expect(r.brief).not.toBe('');
    },
  );
  it.each([false, true])(
    'preserves original findings until recheck evidence validates (persistent=%s)',
    async (persistent) => {
      const original = model.complete.bind(model);
      let attempts = 0;
      model.complete = async (prompt) => {
        const result = await original(prompt);
        const data = JSON.parse(result.text);
        if (prompt.includes('COVERAGE AUDIT:')) {
          data.questions = [{ topicId: 'authority', text: 'Recheck authority.', citations: [] }];
        }
        if (prompt.startsWith('ROLE: ownership\n') && prompt.includes('SPECIALIST RECHECK')) {
          attempts++;
          if (persistent || attempts === 1) data.findings[0].citations[0].page = 999;
        }
        return { ...result, text: JSON.stringify(data) };
      };
      const r = await run();
      expect(attempts).toBe(persistent ? 3 : 2);
      expect(r.status).toBe(persistent ? 'failed' : 'completed');
      expect(r.findings.find((f) => f.issueCode === 'AUTHORITY')?.citations[0].page).not.toBe(999);
      const recheck = r.activities?.find(
        (a) => a.reviewer === 'ownership' && a.label.includes('recheck'),
      );
      if (persistent) {
        expect(r.activities?.at(-1)?.state).toBe('failed');
        expect(r.error).toContain('p.999');
      } else expect(recheck?.state).toBe('completed');
    },
  );
  it.each([false, true])(
    'repairs cross-review references without publishing invalid challenges (persistent=%s)',
    async (persistent) => {
      const original = model.complete.bind(model);
      let attempts = 0;
      model.complete = async (prompt) => {
        const result = await original(prompt);
        if (!prompt.includes('Cross-review other')) return result;
        const data = JSON.parse(result.text);
        if (prompt.startsWith('ROLE: ownership\n')) {
          attempts++;
          if (persistent || attempts === 1) data.challenges[0].citations[0].page = 999;
        }
        if (prompt.startsWith('ROLE: identity\n')) {
          const peers = JSON.parse(
            prompt.split("Cross-review other reviewers' findings: ")[1].split('. Raise 0 to 2')[0],
          );
          const target = peers.find((f: any) => f.reviewer === 'mortgage');
          data.challenges = [
            {
              target: 'mortgage',
              findingId: target.id,
              text: 'Check payout evidence.',
              citations: target.citations,
            },
          ];
        }
        return { ...result, text: JSON.stringify(data) };
      };
      const r = await run();
      expect(attempts).toBe(persistent ? 3 : 2);
      expect(r.status).toBe(persistent ? 'failed' : 'completed');
      expect(r.activities?.find((a) => a.reviewer === 'ownership' && a.stage === 1)?.state).toBe(
        persistent ? 'failed' : 'completed',
      );
      expect(r.exchanges.some((e) => e.kind === 'challenge' && e.reviewer === 'identity')).toBe(
        true,
      );
      expect(
        r.exchanges
          .filter((e) => e.kind === 'challenge')
          .flatMap((e) => e.citations)
          .some((c) => c.page === 999),
      ).toBe(false);
      if (persistent) {
        expect(r.error).toContain('p.999');
        expect(r.brief).toBe('');
      }
    },
  );
  it('persists event cursors and marks work interrupted after restart', async () => {
    const r = await run();
    const events = (await request('/events')).data.events;
    expect(events.length).toBeGreaterThan(5);
    const last = events.at(-1).id;
    expect((await request('/events?after=' + last)).data.events).toEqual([]);
    r.status = 'running';
    const owner = lab.store.all('session')[0].owner;
    lab.store.put('review', r.id, owner, r);
    await lab.app.close();
    lab = await buildApp({ dir, model, accessCode: 'test-code' });
    await lab.app.ready();
    expect(lab.store.get<Review>('review', r.id)?.status).toBe('interrupted');
    expect((await request('/events?after=' + last)).data.events[0].type).toBe('review.interrupted');
  });
  it('rejects malformed/oversized PDFs, flags image-only pages, extracts seed text', async () => {
    await expect(extractPdf(new Uint8Array([1, 2, 3]))).rejects.toThrow('Cannot ingest PDF');
    await expect(extractPdf(new Uint8Array(10 * 1024 * 1024 + 1))).rejects.toThrow('10 MB');
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const blank = await extractPdf(await pdf.save());
    expect(blank.warnings).toHaveLength(1);
    for (let i = 0; i < 20; i++) pdf.addPage();
    await expect(extractPdf(await pdf.save())).rejects.toThrow('20 pages');
    const w = await workspace();
    const source = w.snapshot.documents[0];
    const extracted = await extractPdf(await readFile(source.file));
    expect(extracted.pages[0]).toContain('Alex Chen');
    expect(checks(w.snapshot).payoutExpiresBeforeClosing).toBe(true);
    expect(
      validateCitation({ documentId: 'agreement', page: 20, quote: 'Alex Chen' }, w.snapshot)
        .verified,
    ).toBe(false);
  });
  it('exports a human-readable brief and documents API commands', async () => {
    await run();
    const md = await request(`/branches/${s.branchId}/export`);
    expect(md.data).toContain('not FCT policy');
    expect(md.data).toContain('quotation matched');
    const spec = (await lab.app.inject('/api/openapi.json')).json();
    expect(spec.paths['/api/v1/interventions'].post.requestBody).toBeTruthy();
  });
  it('does not execute duplicate reviews and can cancel after a document revision changes', async () => {
    model.delay = 80;
    const body = cmd();
    const a = await request('/reviews', body);
    const b = await request('/reviews', body);
    expect(a.data.id).toBe(b.data.id);
    expect((await workspace()).reviews).toHaveLength(1);
    await request('/documents/reveal', cmd({ documentId: 'authorization' }));
    const cancelled = await request(`/reviews/${a.data.id}/cancel`, cmd({ expectedRevision: 2 }));
    expect(cancelled.status).toBe(200);
    expect(cancelled.data.status).toBe('cancelled');
  });
  it('fails queued interventions if the branch revision changes before the boundary', async () => {
    model.delay = 80;
    const start = (await request('/reviews', cmd())).data;
    await wait(() => !!lab.store.get<Review>('review', start.id)?.findings.length);
    const r = lab.store.get<Review>('review', start.id)!;
    const i = (
      await request(
        '/interventions',
        cmd({
          reviewId: r.id,
          findingId: r.findings[0].id,
          kind: 'question',
          text: 'Does the current evidence address authority?',
        }),
      )
    ).data;
    await request('/documents/reveal', cmd({ documentId: 'authorization' }));
    await wait(() => lab.store.get<any>('intervention', i.id)?.state === 'failed');
    expect(lab.store.get<any>('intervention', i.id).error).toContain('revision changed');
    expect(
      lab.store
        .get<Review>('review', r.id)
        ?.snapshot.documents.some((d) => d.id === 'authorization'),
    ).toBe(false);
  });
  it('rejects encrypted PDFs explicitly', async () => {
    await expect(
      extractPdf(await readFile(new URL('./fixtures/encrypted.pdf', import.meta.url))),
    ).rejects.toThrow('Encrypted PDFs');
  });
  it('replaces a PDF without changing reviewed evidence and safely retries uploads', async () => {
    const r = await run();
    const w = await workspace();
    const buffer = await readFile(w.snapshot.documents.find((d) => d.id === 'identity')!.file);
    const body = cmd({ replaces: 'payout' });
    const send = async (fields: any, bytes: Buffer) => {
      const boundary = 'fct-test-boundary';
      let head = '';
      for (const [k, v] of Object.entries(fields))
        head += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
      head += `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="replacement.pdf"\r\nContent-Type: application/pdf\r\n\r\n`;
      const payload = Buffer.concat([
        Buffer.from(head),
        bytes,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const response = await lab.app.inject({
        method: 'POST',
        url: '/api/v1/documents',
        headers: {
          authorization: 'Bearer ' + s.token,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      return { status: response.statusCode, data: response.json() };
    };
    const first = await send(body, buffer);
    expect(first.status).toBe(200);
    const retry = await send(body, buffer);
    expect(retry.data.document.id).toBe(first.data.document.id);
    expect((await workspace()).branch.revision).toBe(2);
    expect(
      (await request('/reviews/' + r.id)).data.snapshot.documents.find(
        (d: any) => d.id === 'payout',
      ).pages[0],
    ).toContain('2026-10-12');
    expect((await workspace()).snapshot.documents.some((d) => d.id === 'payout')).toBe(false);
    const pdf = await PDFDocument.create();
    for (let i = 0; i < 20; i++) pdf.addPage();
    const bytes = Buffer.from(await pdf.save());
    for (let i = 0; i < 4; i++) {
      const added = await send(cmd({ expectedRevision: 2 + i }), bytes);
      expect(added.status).toBe(200);
    }
    expect((await send(cmd({ expectedRevision: 6 }), bytes)).data.message).toContain('100 pages');
  });
  it('retains the last brief as incomplete when the lead update fails', async () => {
    const r = await run();
    const original = model.complete.bind(model);
    model.complete = async (prompt) => {
      if (prompt.includes('Produce a concise Markdown')) throw new Error('Transport disconnected');
      return original(prompt);
    };
    const i = (
      await request(
        '/interventions',
        cmd({
          reviewId: r.id,
          findingId: r.findings[0].id,
          kind: 'question',
          text: 'Can you explain the evidence gap?',
        }),
      )
    ).data;
    await wait(() => lab.store.get<any>('intervention', i.id)?.state === 'failed');
    const updated = (await request('/reviews/' + r.id)).data;
    expect(updated.needsRerun).toBe(true);
    expect(updated.error).toContain('lead update incomplete');
  });
  it('keeps peer follow-up separate from reruns required by a human intervention', async () => {
    const original = model.complete.bind(model);
    model.complete = async (prompt) => {
      const result = await original(prompt);
      if (!prompt.includes('Respond once')) return result;
      const data = JSON.parse(result.text);
      if (data.responses)
        data.responses.forEach((r: any) => {
          r.crossDomainImpact = true;
          r.unresolved = true;
        });
      else {
        data.crossDomainImpact = true;
        data.unresolved = true;
      }
      return { ...result, text: JSON.stringify(data) };
    };
    const r = await run();
    expect(r.status).toBe('completed');
    expect(r.needsRerun).toBe(false);
    expect(r.crossSpecialtyFollowup).toBe(true);
    expect(r.exchanges.some((e) => e.kind === 'response' && e.unresolved)).toBe(true);
    const i = (
      await request(
        '/interventions',
        cmd({
          reviewId: r.id,
          findingId: r.findings[0].id,
          kind: 'question',
          text: 'Does this change another specialist assessment?',
        }),
      )
    ).data;
    await wait(() => lab.store.get<any>('intervention', i.id)?.state === 'completed');
    expect((await request('/reviews/' + r.id)).data.needsRerun).toBe(true);
  });
  it('persists per-reviewer progress and validates public review question citations', async () => {
    model.delay = 60;
    const start = (await request('/reviews', cmd())).data;
    await wait(
      () =>
        lab.store.get<Review>('review', start.id)?.activities?.filter((a) => a.state === 'running')
          .length === 6,
    );
    const active = (await workspace()).reviews[0];
    expect(active.activities?.map((a) => a.reviewer).sort()).toEqual([
      'fraud',
      'identity',
      'mortgage',
      'ownership',
      'property',
      'survey',
    ]);
    await wait(() => lab.store.get<Review>('review', start.id)?.status === 'completed');
    const result = (await request('/reviews/' + start.id)).data as Review;
    expect(result.activities?.every((a) => a.state === 'completed' && a.completedAt)).toBe(true);
    expect(result.findings.every((f) => f.known && f.uncertain && f.changeEvidence)).toBe(true);
    expect(
      result.findings.every((f) =>
        f.reviewQuestions?.every((q) => q.citations.every((c) => c.verified)),
      ),
    ).toBe(true);
    const broken = structuredClone(result.findings[0]);
    broken.reviewQuestions![0].citations[0].page = 99;
    const { validateFinding, findingSchema } = await import('../server/evidence');
    expect(
      findingSchema.parse({
        ...result.findings[0],
        known: ['First observation.', 'Second observation.'],
      }).known,
    ).toBe('First observation.\nSecond observation.');
    expect(validateFinding(broken, result.snapshot).validationWarnings.join(' ')).toContain(
      'Review question has an invalid citation',
    );
  });
  it('serializes interventions and preserves cancellation during a response', async () => {
    const r = await run();
    model.delay = 80;
    const i = (
      await request(
        '/interventions',
        cmd({
          reviewId: r.id,
          findingId: r.findings[0].id,
          kind: 'question',
          text: 'Please explain the documentary gap.',
        }),
      )
    ).data;
    expect((await request('/reviews', cmd())).status).toBe(409);
    await wait(() => lab.store.get<any>('intervention', i.id)?.state === 'processing');
    await request(`/reviews/${r.id}/cancel`, cmd());
    await new Promise((resolve) => setTimeout(resolve, 130));
    expect(lab.store.get<Review>('review', r.id)?.status).toBe('cancelled');
    expect(lab.store.get<any>('intervention', i.id)?.state).toBe('failed');
  });
});
async function wait(test: () => boolean) {
  const until = Date.now() + 12000;
  while (!test()) {
    if (Date.now() > until) throw new Error('Timed out waiting for workflow');
    await new Promise((r) => setTimeout(r, 15));
  }
}
