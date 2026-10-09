import { compareReviews } from './comparison.js';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import staticFiles from '@fastify/static';
import { z } from 'zod';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Store, uid, now } from './store.js';
import { CodexModel, type Model } from './model.js';
import { Workflow } from './workflow.js';
import { extractDetails, inferDocumentKind } from './details.js';
import { seedDocuments, specs, RULES_VERSION } from './seed.js';
import { extractPdf, citationSchema, validateCitation, checks } from './evidence.js';
import { roles, roleNames } from '../shared/types.js';
import type {
  Branch,
  CaseRecord,
  EvidenceDocument,
  Snapshot,
  Review,
  Intervention,
  Note,
} from '../shared/types.js';
const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const fail = (code: number, message: string): never => {
  throw Object.assign(new Error(message), { statusCode: code });
};
const command = z.object({
  caseId: z.string(),
  branchId: z.string(),
  expectedRevision: z.number().int().positive(),
  commandId: z.string().min(8).max(100),
});
const envelope = {
  type: 'object',
  required: ['caseId', 'branchId', 'expectedRevision', 'commandId'],
  properties: {
    caseId: { type: 'string' },
    branchId: { type: 'string' },
    expectedRevision: { type: 'integer', minimum: 1 },
    commandId: { type: 'string', minLength: 8 },
  },
  additionalProperties: true,
};
export async function buildApp(options: { dir?: string; model?: Model; accessCode?: string } = {}) {
  const store = new Store(options.dir);
  const app = Fastify({ logger: false, bodyLimit: 11 * 1024 * 1024 });
  const accessCode =
    options.accessCode || process.env.FCT_ACCESS_CODE || randomBytes(5).toString('hex');
  const docs = await seedDocuments(join(store.dir, 'seed'));
  const workflow = new Workflow(store, options.model || new CodexModel());
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 12 } });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'The Underwriting Room API',
        version: '1.0.0',
        description:
          'Local synthetic investigation workspace. Command IDs provide safe retries; expectedRevision is mandatory for case commands. All case resources are session-isolated. Cookie or Bearer session token accepted.',
      },
      servers: [{ url: 'http://127.0.0.1:4317' }],
      components: {
        securitySchemes: {
          session: { type: 'apiKey', in: 'cookie', name: 'fct_session' },
          bearer: { type: 'http', scheme: 'bearer' },
        },
      },
    },
  });
  await app.register(swaggerUI, { routePrefix: '/api/docs' });
  const failures = new Map<string, { count: number; at: number }>();
  app.addHook('onRequest', async (req, reply) => {
    const host = (req.headers.host || '').split(':')[0];
    if (!['localhost', '127.0.0.1'].includes(host))
      return reply.code(403).send({ message: 'Localhost access only' });
    const origin = req.headers.origin;
    if (origin) {
      let u;
      try {
        u = new URL(origin);
      } catch {
        return reply.code(403).send({ message: 'Invalid origin' });
      }
      if (
        !['localhost', '127.0.0.1'].includes(u.hostname) ||
        ![String(process.env.PORT || 4317), '5173'].includes(u.port)
      )
        return reply.code(403).send({ message: 'Foreign origin denied' });
    }
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cache-Control', 'no-store');
    if (
      !req.url.startsWith('/api/v1') ||
      (req.url.split('?')[0] === '/api/v1/sessions' && req.method === 'POST')
    )
      return;
    const token = req.cookies.fct_session || req.headers.authorization?.replace(/^Bearer /, '');
    const sid = token ? hash(token) : '';
    const session = store.get<{ expires: number }>('session', sid, sid);
    if (!session || session.expires < Date.now())
      return reply
        .code(401)
        .send({ message: 'Enter your local access code to start a private session.' });
    (req as any).owner = sid;
  });
  app.setErrorHandler((e: any, _req, reply) =>
    reply.code(e instanceof z.ZodError ? 400 : e.statusCode || 500).send({
      message:
        e instanceof z.ZodError
          ? e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
          : e.message,
    }),
  );
  const owner = (r: any) => r.owner as string;
  function getBranch(sid: string, id: string) {
    return store.get<Branch>('branch', id, sid) || fail(404, 'Branch not found');
  }
  function snapshot(sid: string, b: Branch): Snapshot {
    return {
      details: b.details,
      caseName: store.get<CaseRecord>('case', b.caseId, sid)?.name,
      address: b.details?.confirmed
        ? b.details.values.address || ''
        : store.get<CaseRecord>('case', b.caseId, sid)?.address,
      caseId: b.caseId,
      branchId: b.id,
      revision: b.revision,
      closingDate: b.closingDate,
      purchasePrice: b.purchasePrice,
      loanAmount: b.loanAmount,
      assumptions: b.assumptions,
      documents: b.documentIds
        .map((id) => store.get<EvidenceDocument>('document', id, sid)!)
        .filter(Boolean),
      rulesVersion: RULES_VERSION,
    };
  }
  function initial(sid: string) {
    const cid = uid(),
      bid = uid();
    const c: CaseRecord = {
      id: cid,
      sessionId: sid,
      name: 'The Alder Lane purchase',
      address: '18 Alder Lane, Kingston, Ontario',
      branchIds: [bid],
      createdAt: now(),
    };
    const b: Branch = {
      id: bid,
      caseId: cid,
      name: 'Original deal',
      revision: 1,
      parentId: null,
      closingDate: '2026-10-15',
      purchasePrice: 700000,
      loanAmount: 500000,
      assumptions: [],
      documentIds: specs.filter((s) => !s.reveal).map((s) => s.id),
      createdAt: now(),
    };
    store.put('case', cid, sid, c);
    store.put('branch', bid, sid, b);
    for (const d of docs) store.put('document', d.id + ':' + sid, sid, { ...d, id: d.id });
    // Document record keys are session-scoped while public IDs remain readable.
    return { caseId: cid, branchId: bid };
  }
  // Scoped lookup wrapper keeps synthetic IDs identical across isolated sessions.
  const rawGet = store.get.bind(store);
  store.get = function <T>(kind: string, id: string, sid?: string): T | undefined {
    return rawGet<T>(kind, kind === 'document' && sid ? id + ':' + sid : id, sid);
  };
  function workspace(sid: string, bid: string) {
    const b = getBranch(sid, bid);
    const s = snapshot(sid, b);
    return {
      case: store.get<CaseRecord>('case', b.caseId, sid)!,
      branch: b,
      snapshot: s,
      checks: checks(s),
      branches: store.list<Branch>('branch', sid).filter((x) => x.caseId === b.caseId),
      reviews: store.list<Review>('review', sid).filter((x) => x.branchId === bid),
      interventions: store
        .list<Intervention>('intervention', sid)
        .filter((x) => x.branchId === bid),
      notes: store.list<Note>('note', sid).filter((x) => x.branchId === bid),
      reveals: (store.get<CaseRecord>('case', b.caseId, sid)?.template === 'blank' ? [] : specs)
        .filter((x) => x.reveal && !b.documentIds.includes(x.id))
        .map((x) => ({ id: x.id, title: x.title })),
      lastEventId: store.lastEvent(sid),
    };
  }
  function mutate<T>(req: any, kind: string, fn: (b: Branch, p: any) => T, body = req.body) {
    const p = command.parse(body);
    const sid = owner(req);
    return store.command(sid, p.commandId, hash(JSON.stringify({ kind, body })), () => {
      const b = getBranch(sid, p.branchId);
      if (b.caseId !== p.caseId) fail(404, 'Case and branch do not match');
      if (store.get<CaseRecord>('case', b.caseId, sid)?.status === 'finalized')
        fail(409, 'Case is finalized. Reopen it before making changes.');
      if (b.revision !== p.expectedRevision)
        fail(
          409,
          `Stale case revision. Expected ${p.expectedRevision}; current is ${b.revision}. Refresh before editing.`,
        );
      return fn(b, body);
    });
  }
  function changed(sid: string, b: Branch) {
    b.revision++;
    if (store.get<CaseRecord>('case', b.caseId, sid)?.template === 'blank') {
      if (b.details)
        store.put('details-history', uid(), sid, {
          branchId: b.id,
          details: structuredClone(b.details),
          at: now(),
        });
      b.details = extractDetails(snapshot(sid, b).documents, b.revision);
    }
    store.put('branch', b.id, sid, b);
    store.emit(sid, {
      caseId: b.caseId,
      branchId: b.id,
      revision: b.revision,
      type: 'case.changed',
      data: { requiresFullReview: true },
    });
    return b;
  }
  function reviewFor(sid: string, id: string, b: Branch) {
    const r = store.get<Review>('review', id, sid) || fail(404, 'Review not found');
    if (r.branchId !== b.id) fail(400, 'Review belongs to a different branch');
    return r;
  }
  function route(
    method: any,
    url: string,
    summary: string,
    handler: any,
    bodySchema?: any,
    querySchema?: any,
  ) {
    app.route({
      method,
      url: '/api/v1' + url,
      schema: {
        summary,
        tags: [url.split('/')[1]],
        security: [{ session: [] }, { bearer: [] }],
        ...(bodySchema ? { body: bodySchema } : {}),
        ...(querySchema ? { querystring: querySchema } : {}),
      },
      handler,
    });
  }
  route(
    'POST',
    '/sessions',
    'Start an isolated session using the local access code',
    async (req: any, reply: any) => {
      const ip = req.ip;
      const old = failures.get(ip);
      if (old && old.count >= 8 && Date.now() - old.at < 60000)
        fail(429, 'Too many attempts. Try again in one minute.');
      const input = z.object({ accessCode: z.string().max(200) }).parse(req.body);
      const a = Buffer.from(hash(input.accessCode)),
        b = Buffer.from(hash(accessCode));
      if (!timingSafeEqual(a, b)) {
        failures.set(ip, { count: (old?.count || 0) + 1, at: Date.now() });
        fail(401, 'Access code is incorrect');
      }
      failures.delete(ip);
      const token = randomBytes(32).toString('hex'),
        sid = hash(token);
      store.put('session', sid, sid, { expires: Date.now() + 24 * 3600000 });
      const ids = initial(sid);
      reply.setCookie('fct_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 86400,
      });
      return { ...ids, token };
    },
    { type: 'object', required: ['accessCode'], properties: { accessCode: { type: 'string' } } },
  );
  route('GET', '/sessions', 'Get the current isolated session', async (req: any) => ({
    cases: store.list<CaseRecord>('case', owner(req)),
    model: 'gpt-5.6-terra',
    rulesVersion: RULES_VERSION,
  }));
  route(
    'DELETE',
    '/sessions',
    'Delete session data and private uploaded files',
    async (req: any, reply: any) => {
      const sid = owner(req);
      for (const r of store.list<Review>('review', sid)) {
        if (['running', 'paused'].includes(r.status)) {
          r.status = 'cancelled';
          store.put('review', r.id, sid, r);
        }
      }
      store.removeSession(sid);
      await rm(join(store.dir, 'uploads', sid), { recursive: true, force: true });
      reply.clearCookie('fct_session', { path: '/' });
      return { deleted: true };
    },
  );
  route('POST', '/sessions/reset', 'Reset the current synthetic workspace', async (req: any) => {
    const sid = owner(req);
    store.removeSession(sid);
    await rm(join(store.dir, 'uploads', sid), { recursive: true, force: true });
    store.put('session', sid, sid, { expires: Date.now() + 24 * 3600000 });
    return initial(sid);
  });
  route('GET', '/cases', 'List cases in this session', async (req: any) =>
    store.list<CaseRecord>('case', owner(req)).map((c) => {
      const primary = store.get<Branch>('branch', c.branchIds[0], owner(req));
      return {
        ...c,
        displayAddress:
          (primary?.details?.confirmed ? primary.details.values.address : '') || c.address || '',
      };
    }),
  );
  route(
    'POST',
    '/cases',
    'Create an independent case',
    async (req: any) => {
      const sid = owner(req);
      const input = z
        .object({
          commandId: z.string().min(8).max(100),
          name: z.string().trim().min(1).max(160),
          address: z.string().trim().max(300).default(''),
          closingDate: z.string().date().optional(),
          purchasePrice: z.number().positive().max(1000000000).optional(),
          loanAmount: z.number().nonnegative().max(1000000000).optional(),
        })
        .parse(req.body);
      return store.command(
        sid,
        input.commandId,
        hash(JSON.stringify({ createCase: input })),
        () => {
          const cid = uid(),
            bid = uid();
          const c: CaseRecord = {
            id: cid,
            sessionId: sid,
            name: input.name,
            address: input.address,
            template: 'blank',
            status: 'open',
            version: 1,
            branchIds: [bid],
            createdAt: now(),
          };
          const b: Branch = {
            id: bid,
            caseId: cid,
            name: 'Original deal',
            revision: 1,
            parentId: null,
            closingDate: input.closingDate || '',
            purchasePrice: input.purchasePrice || 0,
            loanAmount: input.loanAmount || 0,
            details: extractDetails([], 1),
            assumptions: [],
            documentIds: [],
            createdAt: now(),
          };
          store.put('case', cid, sid, c);
          store.put('branch', bid, sid, b);
          return { case: c, caseId: cid, branchId: bid };
        },
      );
    },
    {
      type: 'object',
      required: ['commandId', 'name'],
      properties: {
        commandId: { type: 'string' },
        name: { type: 'string' },
        address: { type: 'string' },
        closingDate: { type: 'string', format: 'date' },
        purchasePrice: { type: 'number' },
        loanAmount: { type: 'number' },
      },
    },
  );
  route(
    'POST',
    '/cases/:caseId/status',
    'Finalize or reopen an investigation without issuing coverage',
    async (req: any) => {
      const sid = owner(req);
      const input = z
        .object({
          commandId: z.string().min(8).max(100),
          expectedVersion: z.number().int().positive(),
          status: z.enum(['open', 'finalized']),
          note: z.string().trim().min(1).max(3000),
        })
        .parse(req.body);
      return store.command(
        sid,
        input.commandId,
        hash(JSON.stringify({ caseId: req.params.caseId, ...input })),
        () => {
          const c =
            store.get<CaseRecord>('case', req.params.caseId, sid) || fail(404, 'Case not found');
          if ((c.version || 1) !== input.expectedVersion)
            fail(409, 'Case changed. Refresh before updating its status.');
          if (
            store
              .list<Review>('review', sid)
              .some((r) => r.caseId === c.id && ['running', 'paused'].includes(r.status)) ||
            store
              .list<Intervention>('intervention', sid)
              .some((i) => i.caseId === c.id && ['queued', 'processing'].includes(i.state))
          )
            fail(
              409,
              'Finish or cancel active reviews and wait for interventions before changing case status.',
            );
          if ((c.status || 'open') === input.status) fail(409, 'Case already has that status.');
          c.status = input.status;
          c.version = (c.version || 1) + 1;
          (c.lifecycle ??= []).push({
            action: input.status === 'finalized' ? 'finalized' : 'reopened',
            at: now(),
            note: input.note,
          });
          if (input.status === 'finalized') {
            c.finalizedAt = now();
            c.finalizationNote = input.note;
          }
          store.put('case', c.id, sid, c);
          for (const bid of c.branchIds) {
            const b = getBranch(sid, bid);
            store.emit(sid, {
              caseId: c.id,
              branchId: bid,
              revision: b.revision,
              type: 'case.status',
              data: { status: c.status },
            });
          }
          return c;
        },
      );
    },
    {
      type: 'object',
      required: ['commandId', 'expectedVersion', 'status', 'note'],
      properties: {
        commandId: { type: 'string' },
        expectedVersion: { type: 'integer' },
        status: { enum: ['open', 'finalized'] },
        note: { type: 'string' },
      },
    },
  );
  route(
    'GET',
    '/branches/:branchId/details/history',
    'Read preserved detail extraction and confirmation history',
    async (req: any) => {
      getBranch(owner(req), req.params.branchId);
      return store
        .list<any>('details-history', owner(req))
        .filter((h) => h.branchId === req.params.branchId);
    },
  );
  route('GET', '/cases/:caseId', 'Get a case and its branches', async (req: any) => ({
    case: store.get('case', req.params.caseId, owner(req)) || fail(404, 'Case not found'),
    branches: store
      .list<Branch>('branch', owner(req))
      .filter((b) => b.caseId === req.params.caseId),
  }));
  route(
    'POST',
    '/branches/:branchId/details',
    'Confirm extracted details or record user corrections',
    async (req: any) => {
      if (req.params.branchId !== req.body.branchId) fail(400, 'Branch mismatch');
      return mutate(req, 'confirm-details', (b, p) => {
        if (!b.details || !b.documentIds.length)
          fail(400, 'Upload documents to extract details first.');
        if (
          store
            .list<Review>('review', owner(req))
            .some((r) => r.branchId === b.id && ['running', 'paused'].includes(r.status)) ||
          store
            .list<Intervention>('intervention', owner(req))
            .some((i) => i.branchId === b.id && ['queued', 'processing'].includes(i.state))
        )
          fail(409, 'Finish active work before changing case details.');
        const values = z
          .object({
            seller: z.string().trim().max(300),
            buyer: z.string().trim().max(300),
            address: z.string().trim().max(300),
            parcel: z.string().trim().max(300),
            closingDate: z.union([z.literal(''), z.string().date()]),
            purchasePrice: z.string().regex(/^(?:|[0-9]+(?:\.[0-9]{1,2})?)$/),
            loanAmount: z.string().regex(/^(?:|[0-9]+(?:\.[0-9]{1,2})?)$/),
          })
          .parse(p.values);
        for (const field of ['purchasePrice', 'loanAmount'] as const)
          if (
            Number(values[field]) > 1000000000 ||
            (field === 'purchasePrice' && values[field] !== '' && Number(values[field]) <= 0)
          )
            fail(400, 'Invalid amount');
        const origins: NonNullable<Branch['details']>['origins'] = {};
        for (const [field, value] of Object.entries(values))
          origins[field as keyof typeof values] = !value
            ? 'unknown'
            : b.details!.candidates[field as keyof typeof values]?.some((c) => c.value === value)
              ? 'document'
              : 'user';
        store.put('details-history', uid(), owner(req), {
          branchId: b.id,
          details: structuredClone(b.details),
          at: now(),
        });
        b.revision++;
        b.details = { ...b.details!, revision: b.revision, values, origins, confirmed: true };
        b.closingDate = values.closingDate;
        b.purchasePrice = Number(values.purchasePrice);
        b.loanAmount = Number(values.loanAmount);
        store.put('branch', b.id, owner(req), b);
        store.emit(owner(req), {
          caseId: b.caseId,
          branchId: b.id,
          revision: b.revision,
          type: 'case.changed',
          data: { requiresFullReview: true },
        });
        return b;
      });
    },
    {
      ...envelope,
      properties: {
        ...envelope.properties,
        values: { type: 'object', additionalProperties: { type: 'string' } },
      },
    },
  );
  route(
    'GET',
    '/branches/:branchId/snapshot',
    'Get current snapshot, review history and event cursor',
    async (req: any) => workspace(owner(req), req.params.branchId),
  );
  route('GET', '/branches/:branchId/reviews', 'List reviews for a branch', async (req: any) => {
    getBranch(owner(req), req.params.branchId);
    return store
      .list<Review>('review', owner(req))
      .filter((r) => r.branchId === req.params.branchId);
  });
  route(
    'POST',
    '/branches',
    'Branch the deal without modifying original evidence or results',
    async (req: any) =>
      mutate(req, 'branch', (b, p) => {
        const input = z
          .object({
            name: z.string().min(1).max(80),
            closingDate: z.string().date().optional(),
            assumption: z.string().max(2000).optional(),
          })
          .parse(p);
        const sid = owner(req);
        const next: Branch = {
          ...structuredClone(b),
          id: uid(),
          parentId: b.id,
          name: input.name,
          revision: 1,
          createdAt: now(),
          closingDate: input.closingDate || b.closingDate,
          assumptions: [...b.assumptions, ...(input.assumption ? [input.assumption] : [])],
        };
        if (b.details) next.details = extractDetails(snapshot(sid, b).documents, 1);
        if (input.closingDate && input.closingDate !== b.closingDate)
          next.assumptions.push(
            `Hypothetical closing date: ${input.closingDate}. Lender agreement is not verified.`,
          );
        store.put('branch', next.id, sid, next);
        const c = store.get<CaseRecord>('case', b.caseId, sid)!;
        c.branchIds.push(next.id);
        store.put('case', c.id, sid, c);
        return next;
      }),
    {
      ...envelope,
      properties: {
        ...envelope.properties,
        name: { type: 'string' },
        closingDate: { type: 'string', format: 'date' },
        assumption: { type: 'string' },
      },
    },
  );
  route(
    'PATCH',
    '/branches/:branchId',
    'Change branch assumptions; invalidates assessment',
    async (req: any) => {
      if (req.params.branchId !== req.body.branchId) fail(400, 'Branch mismatch');
      return mutate(req, 'edit-branch', (b, p) => {
        const data = z
          .object({
            closingDate: z.string().date().optional(),
            assumptions: z.array(z.string().max(2000)).max(10).optional(),
          })
          .parse(p);
        if (!b.parentId) fail(400, 'Use Branch the Deal to change hypothetical facts.');
        Object.assign(b, data);
        return changed(owner(req), b);
      });
    },
    envelope,
  );
  route(
    'POST',
    '/documents/reveal',
    'Add prepared evidence and require a full review',
    async (req: any) =>
      mutate(req, 'reveal', (b, p) => {
        if (store.get<CaseRecord>('case', b.caseId, owner(req))?.template === 'blank')
          fail(400, 'Prepared reveals belong only to the demo case.');
        if (!specs.some((s) => s.id === p.documentId && s.reveal))
          fail(400, 'Unknown evidence reveal');
        if (!b.documentIds.includes(p.documentId)) b.documentIds.push(p.documentId);
        return changed(owner(req), b);
      }),
    { ...envelope, properties: { ...envelope.properties, documentId: { type: 'string' } } },
  );
  route(
    'POST',
    '/documents',
    'Upload or replace a text PDF; old snapshots retain the original',
    async (req: any) => {
      const part = await req.file();
      if (!part) fail(400, 'Attach one PDF');
      const buffer = await part.toBuffer();
      if (part.file.truncated) fail(413, 'PDF exceeds 10 MB');
      const fields = Object.fromEntries(
        Object.entries(part.fields)
          .filter(([k]) => k !== part.fieldname)
          .map(([k, v]: any) => [k, v.value]),
      );
      const body = {
        ...fields,
        expectedRevision: Number(fields.expectedRevision),
        digest: hash(buffer),
      };
      const extracted = await extractPdf(buffer);
      const sid = owner(req);
      const id = uid();
      const dir = join(store.dir, 'uploads', sid);
      await mkdir(dir, { recursive: true });
      const file = join(dir, id + '.pdf');
      await writeFile(file, buffer);
      let result: any;
      try {
        result = mutate(
          req,
          'upload',
          (b, p) => {
            if (p.replaces && !b.documentIds.includes(p.replaces))
              fail(400, 'Replacement document is not active');
            const active = b.documentIds.filter((x) => x !== p.replaces);
            const pages =
              active.reduce(
                (n, x) => n + (store.get<EvidenceDocument>('document', x, sid)?.pages.length || 0),
                0,
              ) + extracted.pages.length;
            if (pages > 100) fail(400, 'Active case exceeds 100 pages');
            const d: EvidenceDocument = {
              id,
              title: String(p.title || part.filename).slice(0, 160),
              kind: p.replaces
                ? store.get<EvidenceDocument>('document', p.replaces, sid)?.kind || 'uploaded'
                : z
                    .enum([
                      'uploaded',
                      'agreement',
                      'title',
                      'lender',
                      'payout',
                      'payout-update',
                      'identity',
                      'authority-request',
                      'municipal',
                      'survey',
                    ])
                    .default('uploaded')
                    .parse(
                      p.kind ||
                        inferDocumentKind(String(p.title || part.filename), extracted.pages),
                    ),
              ...extracted,
              file,
              createdAt: now(),
            };
            store.put('document', id + ':' + sid, sid, d);
            b.documentIds = [...active, id];
            changed(sid, b);
            return { document: d, branch: b };
          },
          body,
        );
      } catch (e) {
        await rm(file, { force: true });
        throw e;
      }
      if (result.document.id !== id) await rm(file, { force: true });
      return result;
    },
  );
  route('GET', '/documents/:documentId', 'Get document pages and warnings', async (req: any) => {
    const d =
      store.get<EvidenceDocument>('document', req.params.documentId, owner(req)) ||
      fail(404, 'Document not found');
    const { file, ...publicDoc } = d;
    return publicDoc;
  });
  route(
    'GET',
    '/documents/:documentId/file',
    'Read a private PDF',
    async (req: any, reply: any) => {
      const d =
        store.get<EvidenceDocument>('document', req.params.documentId, owner(req)) ||
        fail(404, 'Document not found');
      reply.type('application/pdf').header('Content-Disposition', 'inline');
      return readFile(d.file);
    },
  );
  route(
    'POST',
    '/reviews',
    'Start an immutable-snapshot review',
    async (req: any) => {
      const r = mutate(req, 'review', (b, p) => {
        if (!b.documentIds.length) fail(400, 'Upload evidence before starting a review.');
        if (b.details && !b.details.confirmed)
          fail(409, 'Review and confirm extracted case details before starting a review.');
        const mode = z
          .enum(['single', 'independent', 'cross', 'specialist'])
          .default('cross')
          .parse(p.mode);
        const selectedReviewer =
          mode === 'specialist' ? z.enum(roles).parse(p.selectedReviewer) : undefined;
        if (mode !== 'specialist' && p.selectedReviewer !== undefined)
          fail(400, 'selectedReviewer requires specialist mode.');
        if (
          store
            .list<Intervention>('intervention', owner(req))
            .some((i) => i.branchId === b.id && ['queued', 'processing'].includes(i.state))
        )
          fail(409, 'Wait for the intervention to finish before starting another review.');
        if (
          store
            .list<Review>('review', owner(req))
            .some((r) => r.branchId === b.id && ['running', 'paused'].includes(r.status))
        )
          fail(409, 'Finish or cancel the active review first.');
        const r: Review = {
          id: uid(),
          caseId: b.caseId,
          branchId: b.id,
          revision: b.revision,
          snapshot: snapshot(owner(req), b),
          mode,
          selectedReviewer,
          status: 'running',
          stage: 0,
          stageName: 'Starting',
          pauseRequested: false,
          findings: [],
          exchanges: [],
          brief: '',
          needsRerun: false,
          statusPolicyVersion: 2,
          createdAt: now(),
          usage: [],
        };
        if (p.rebuildBriefFrom !== undefined) {
          const sourceId = z.string().parse(p.rebuildBriefFrom);
          const source = store.get<Review>('review', sourceId, owner(req));
          if (
            !source ||
            source.branchId !== b.id ||
            source.revision !== b.revision ||
            source.status !== 'completed' ||
            source.needsRerun
          )
            fail(409, 'A completed current review is required to rebuild its lead brief.');
          for (const key of [
            'coverageVersion',
            'coverage',
            'coverageStatus',
            'coverageAuditDone',
            'coverageRechecked',
            'coverageHistory',
          ] as const) {
            if (source![key] !== undefined) (r as any)[key] = structuredClone(source![key]);
          }
          r.mode = source!.mode;
          r.selectedReviewer = source!.selectedReviewer;
          r.snapshot = structuredClone(source!.snapshot);
          r.findings = structuredClone(source!.findings);
          r.exchanges = structuredClone(source!.exchanges.filter((e) => e.kind !== 'lead'));
          r.activities = structuredClone(
            source!.activities?.filter((a) => a.reviewer !== 'lead') || [],
          );
          r.stage = 3;
        }
        store.put('review', r.id, owner(req), r);
        return r;
      });
      const current = store.get<Review>('review', r.id, owner(req))!;
      if (current.status === 'running') setTimeout(() => void workflow.run(owner(req), r.id), 0);
      return current;
    },
    {
      ...envelope,
      properties: {
        ...envelope.properties,
        rebuildBriefFrom: {
          type: 'string',
          description:
            'Rebuild only the lead brief from this completed current review, preserving its scope and evidence.',
        },
        mode: { enum: ['single', 'independent', 'cross', 'specialist'] },
        selectedReviewer: {
          type: 'string',
          enum: [...roles],
          description:
            'Required for specialist mode. Only this specialist runs, followed by a scoped lead brief.',
        },
      },
    },
  );
  route(
    'GET',
    '/reviews/:reviewId',
    'Get review state, findings and brief',
    async (req: any) =>
      store.get('review', req.params.reviewId, owner(req)) || fail(404, 'Review not found'),
  );
  route(
    'GET',
    '/reviews/:reviewId/history',
    'Get preserved pre-intervention review versions',
    async (req: any) => {
      if (!store.get('review', req.params.reviewId, owner(req))) fail(404, 'Review not found');
      return store
        .list<any>('review-history', owner(req))
        .filter((x) => x.reviewId === req.params.reviewId);
    },
  );
  for (const action of ['pause', 'resume', 'cancel'])
    route(
      'POST',
      `/reviews/:reviewId/${action}`,
      `${action} review at a stage boundary`,
      async (req: any) => {
        const r = mutate(req, action, (b) => {
          const r = reviewFor(owner(req), req.params.reviewId, b);
          if (action !== 'cancel' && r.revision !== b.revision)
            fail(409, 'Review uses an old case revision. Start a fresh review.');
          if (action === 'pause') {
            if (r.status !== 'running') fail(409, 'Only a running review can pause');
            r.pauseRequested = true;
          }
          if (action === 'resume') {
            if (r.status !== 'paused') fail(409, 'Review is not paused');
            if (
              store
                .list<Intervention>('intervention', owner(req))
                .some((i) => i.reviewId === r.id && ['queued', 'processing'].includes(i.state))
            )
              fail(409, 'Wait for the intervention to finish');
            r.pauseRequested = false;
            r.status = 'running';
          }
          if (action === 'cancel') {
            r.status = 'cancelled';
            for (const i of store.list<Intervention>('intervention', owner(req))) {
              if (i.reviewId === r.id && ['queued', 'processing'].includes(i.state)) {
                i.state = 'failed';
                i.error = 'The review was cancelled.';
                store.put('intervention', i.id, owner(req), i);
                workflow.event(
                  owner(req),
                  r,
                  'intervention.failed',
                  { intervention: i },
                  { findingId: i.findingId },
                );
              }
            }
          }
          store.put('review', r.id, owner(req), r);
          workflow.event(owner(req), r, `review.${action}`);
          return r;
        });
        if (
          action === 'resume' &&
          store.get<Review>('review', r.id, owner(req))?.status === 'running'
        )
          setTimeout(() => void workflow.run(owner(req), r.id), 0);
        return store.get('review', r.id, owner(req));
      },
      envelope,
    );
  route(
    'GET',
    '/reviews/:reviewId/findings',
    'List cited findings',
    async (req: any) =>
      (
        store.get<Review>('review', req.params.reviewId, owner(req)) ||
        fail(404, 'Review not found')
      ).findings,
  );
  route(
    'GET',
    '/reviews/:reviewId/exchanges',
    'List completed public reviewer messages',
    async (req: any) =>
      (
        store.get<Review>('review', req.params.reviewId, owner(req)) ||
        fail(404, 'Review not found')
      ).exchanges,
  );
  route(
    'POST',
    '/interventions',
    'Ask or challenge a finding with optional documentary evidence',
    async (req: any) => {
      const i = mutate(req, 'intervention', (b, p) => {
        const data = z
          .object({
            reviewId: z.string(),
            findingId: z.string(),
            kind: z.enum(['question', 'challenge', 'evidence', 'hypothetical']),
            text: z.string().min(3).max(2000),
            citation: citationSchema.optional(),
          })
          .parse(p);
        if (data.kind === 'hypothetical')
          fail(
            422,
            'Hypothetical changes must create a branch through POST /branches. They are not verified evidence.',
          );
        const r = reviewFor(owner(req), data.reviewId, b);
        if (
          store
            .list<Review>('review', owner(req))
            .filter((x) => x.branchId === b.id)
            .at(-1)?.id !== r.id
        )
          fail(
            409,
            'Select the latest review. Historical reviews remain preserved for inspection.',
          );
        if (
          store
            .list<Intervention>('intervention', owner(req))
            .some((i) => i.reviewId !== r.id && ['queued', 'processing'].includes(i.state))
        )
          fail(
            409,
            'Another review has an intervention queued or processing. Wait for it to finish.',
          );
        if (r.revision !== b.revision) fail(409, 'Evidence changed. Run a full review first.');
        if (!['running', 'paused', 'completed'].includes(r.status))
          fail(409, 'Cannot intervene on an incomplete or cancelled review; start a fresh review.');
        if (!r.findings.some((f) => f.id === data.findingId))
          fail(404, 'Finding not available yet');
        if (data.citation && !validateCitation(data.citation, r.snapshot).verified)
          fail(400, 'Evidence reference does not match this snapshot');
        const i: Intervention = {
          ...data,
          id: uid(),
          caseId: b.caseId,
          branchId: b.id,
          revision: b.revision,
          state: 'queued',
          createdAt: now(),
        };
        store.put('intervention', i.id, owner(req), i);
        workflow.event(
          owner(req),
          r,
          'intervention.queued',
          { intervention: i },
          { findingId: i.findingId },
        );
        return i;
      });
      const r = store.get<Review>('review', i.reviewId, owner(req))!;
      if (r.status !== 'running') setTimeout(() => void workflow.drain(owner(req), r.id), 0);
      return store.get('intervention', i.id, owner(req));
    },
    {
      ...envelope,
      properties: {
        ...envelope.properties,
        reviewId: { type: 'string' },
        findingId: { type: 'string' },
        kind: { enum: ['question', 'challenge', 'evidence', 'hypothetical'] },
        text: { type: 'string' },
        citation: {
          type: 'object',
          properties: {
            documentId: { type: 'string' },
            page: { type: 'integer' },
            quote: { type: 'string' },
          },
          required: ['documentId', 'page', 'quote'],
        },
      },
    },
  );
  route(
    'GET',
    '/interventions/:id',
    'Poll intervention state',
    async (req: any) =>
      store.get('intervention', req.params.id, owner(req)) || fail(404, 'Intervention not found'),
  );
  route(
    'POST',
    '/notes',
    'Save a human note separate from verified evidence',
    async (req: any) =>
      mutate(req, 'note', (b, p) => {
        const text = z.string().min(1).max(10000).parse(p.text);
        const note: Note = { id: uid(), branchId: b.id, text, createdAt: now() };
        store.put('note', note.id, owner(req), note);
        return note;
      }),
    { ...envelope, properties: { ...envelope.properties, text: { type: 'string' } } },
  );
  route(
    'GET',
    '/comparisons',
    'Compare selected branch reviews by specialist coverage topic; legacy changes retained',
    async (req: any) => {
      const q = z
        .object({
          left: z.string(),
          right: z.string(),
          beforeReviewId: z.string().optional(),
          afterReviewId: z.string().optional(),
        })
        .parse(req.query);
      const left = getBranch(owner(req), q.left),
        right = getBranch(owner(req), q.right);
      if (left.caseId !== right.caseId) fail(400, 'Branches belong to different cases');
      if (left.id === right.id) fail(400, 'Select two different branches');
      const reviews = store.list<Review>('review', owner(req));
      for (const [id, branch] of [
        [q.beforeReviewId, left],
        [q.afterReviewId, right],
      ] as const)
        if (id && !reviews.some((r) => r.id === id && r.branchId === branch.id))
          fail(404, 'Review not found in selected branch');
      return compareReviews(
        left,
        right,
        reviews,
        store.list<Intervention>('intervention', owner(req)),
        q.beforeReviewId,
        q.afterReviewId,
      );
    },
    undefined,
    {
      type: 'object',
      required: ['left', 'right'],
      properties: {
        left: { type: 'string' },
        right: { type: 'string' },
        beforeReviewId: { type: 'string' },
        afterReviewId: { type: 'string' },
      },
    },
  );
  route(
    'GET',
    '/branches/:branchId/export',
    'Export a Markdown investigation brief',
    async (req: any, reply: any) => {
      const w = workspace(owner(req), req.params.branchId);
      const r = w.reviews.at(-1);
      let md = `# The Underwriting Room\n\nFictional Ontario transaction. Demonstration rules ${RULES_VERSION}; not FCT policy, legal advice, identity authentication or a coverage decision.\n\nCase: ${w.case.name}. Status: ${w.case.status || 'open'}.\n${w.case.finalizationNote ? 'Last finalization note: ' + w.case.finalizationNote : ''}\n\n## ${w.branch.name}\n\nCase revision: ${w.branch.revision}. Closing: ${w.branch.closingDate}.\nReview: ${r?.status || 'not started'}; assessed revision: ${r?.revision || 'none'}. ${r?.revision !== w.branch.revision || r?.needsRerun ? 'CURRENT ASSESSMENT REQUIRED.' : ''}\n${r?.error ? 'Incomplete work: ' + r.error : ''}\n\n${r?.brief || 'No completed lead brief.'}\n\n## Evidence\n`;
      if (r?.mode === 'specialist')
        md =
          `> Partial scope: ${roleNames[r.selectedReviewer!]} only. Other specialist areas not assessed. No peer cross-review.\n\n` +
          md;
      if (r?.coverageVersion)
        md += `\n## Review coverage (${r.coverageStatus})\n${(r.coverage || []).map((c) => `- ${roleNames[c.reviewer]} / ${c.topicId}: ${c.status}. ${c.explanation}${c.gaps.length ? ' GAPS: ' + c.gaps.join('; ') : ''}`).join('\n')}\n`;
      else md += '\nCoverage checklist not recorded.\n';
      for (const f of r?.findings || [])
        md += `\n### ${f.title} (${f.status})\nReviewer: ${roleNames[f.reviewer]}\nCategory: ${f.category === 'assessment_limit' ? 'Not assessed (not a confirmed defect)' : f.category === 'missing_document' ? 'Missing document' : 'Issue'}\n${f.explanation}\n${f.missingDocument ? 'Missing: ' + f.missingDocument + '\n' : ''}${f.impact ? 'Why it matters: ' + f.impact + '\n' : ''}Next step: ${f.action || f.nextCheck}\n${f.citations.map((c) => `- ${c.documentId}, p.${c.page}: "${c.quote}" [${c.verified ? 'quotation matched' : 'INVALID CITATION'}]`).join('\n')}\n`;
      md += `\n## Human notes (unverified)\n${w.notes.map((n) => '- ' + n.text).join('\n')}\n\n## Branch assumptions (hypothetical)\n${w.branch.assumptions.map((a) => '- ' + a).join('\n')}\n\n## Team discussion\n${(r?.exchanges || []).map((e) => `- ${e.reviewer} / ${e.kind}${e.disposition ? ' / ' + e.disposition : ''}${e.unresolved ? ' / UNRESOLVED' : ''}: ${e.text}`).join('\n')}\n`;
      reply
        .type('text/markdown')
        .header('Content-Disposition', 'attachment; filename="underwriting-brief.md"');
      return md;
    },
  );
  route('GET', '/events', 'Poll persistent events after an event ID', async (req: any) => {
    const after = Number(req.query.after || 0);
    if (!Number.isSafeInteger(after) || after < 0) fail(400, 'Invalid event cursor');
    return { events: store.eventList(owner(req), after), lastEventId: store.lastEvent(owner(req)) };
  });
  route(
    'GET',
    '/events/stream',
    'Subscribe to SSE; reconnect with Last-Event-ID or after',
    async (req: any, reply: any) => {
      const sid = owner(req),
        after = Number(req.headers['last-event-id'] || req.query.after || 0);
      if (!Number.isSafeInteger(after) || after < 0) fail(400, 'Invalid event cursor');
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      reply.raw.write(': connected\n\n');
      let cursor = after;
      const send = (e: any) => {
        if (e.id > cursor) {
          cursor = e.id;
          reply.raw.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`);
        }
      };
      store.events.on(sid, send);
      let page = store.eventList(sid, cursor);
      while (page.length) {
        page.forEach(send);
        page = store.eventList(sid, cursor);
      }
      const timer = setInterval(() => reply.raw.write(': heartbeat\n\n'), 15000);
      reply.raw.on('close', () => {
        clearInterval(timer);
        store.events.off(sid, send);
      });
    },
  );
  app.get('/api/openapi.json', async () => app.swagger());
  if (existsSync(resolve('dist/index.html'))) {
    // Resolve assets at request time so rebuilding does not leave stale routes.
    await app.register(staticFiles, {
      root: resolve('dist'),
      wildcard: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) res.header('Cache-Control', 'no-store');
      },
    });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api') || req.url.startsWith('/assets/')
        ? reply.code(404).send({ message: 'Endpoint not found' })
        : reply.sendFile('index.html'),
    );
  }
  app.addHook('onClose', async () => {
    workflow.close();
    store.close();
  });
  return { app, store, workflow, accessCode };
}
