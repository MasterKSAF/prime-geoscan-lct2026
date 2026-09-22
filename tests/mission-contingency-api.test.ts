import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { sha256 } from '../lib/planner/mission-schema.ts';
import type { MissionContingencyCertificate } from '../lib/planner/mission-contingency.ts';

async function loadPost() {
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      return nextResolve(
        specifier.startsWith('@/')
          ? new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href
          : specifier,
        context,
      );
    },
  });
  try {
    return (await import('../app/api/planner/missions/contingency/route.ts'))
      .POST;
  } finally {
    hook.deregister();
  }
}
const POST = await loadPost();
const url = 'http://localhost/api/planner/missions/contingency';
const jsonHeaders = { 'Content-Type': 'application/json' };
const fixture = (async () => {
  const document = SHOWCASE_SCENARIOS.find(
    (x) => x.id === 'repeat-sorties',
  )!.create();
  const candidate = (await solveMissionDocument(document)).candidates[0];
  assert.equal(candidate.status, 'feasible_model');
  return { document, candidate };
})();
const request = (body: string, headers = jsonHeaders) =>
  new Request(url, { method: 'POST', headers, body });

void test('contingency API: valid certificate is input/plan bound, complete and explicitly model-only', async () => {
  const source = await fixture,
    saved = JSON.stringify(source);
  const response = await POST(request(saved));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  const c = (await response.json()) as MissionContingencyCertificate;
  assert.equal(c.status, 'certified_model');
  assert.equal(c.protocol, 'controlled-abort-interval-v1');
  assert.equal(c.inputHash, await sha256(source.document));
  assert.equal(c.candidateHash, await sha256(source.candidate));
  assert.ok(c.anchorCount > 0);
  assert.equal(c.anchorCount, c.checkedAnchors);
  assert.equal(c.checkedAnchors, c.certifiedAnchors);
  assert.equal(
    c.certifiedAnchors,
    c.independentAnchors + c.plannedCorridorAnchors,
  );
  assert.equal(c.budgetExceeded, false);
  assert.ok(
    c.assumptions.some(
      (line) => line.includes('ветер') && line.includes('БВС исправен'),
    ),
  );
  assert.ok(
    c.assumptions.some(
      (line) => line.includes('не является') && line.includes('разрешением'),
    ),
  );
  assert.equal(JSON.stringify(source), saved);
});

void test('contingency API: forged paths, metrics, charge, status and mismatched input never get certificates', async () => {
  const mutations = [
    (s: Awaited<typeof fixture>) => {
      s.candidate.metrics.flightTimeSec += 1;
    },
    (s: Awaited<typeof fixture>) => {
      s.candidate.sorties[0].segments[0].from[0] += 0.001;
    },
    (s: Awaited<typeof fixture>) => {
      s.candidate.sorties[0].segments[0].batteryToPct = 100;
    },
    (s: Awaited<typeof fixture>) => {
      s.candidate.status = 'partial';
    },
    (s: Awaited<typeof fixture>) => {
      s.document.name += ' changed';
    },
  ];
  for (const mutate of mutations) {
    const source = structuredClone(await fixture);
    mutate(source);
    const response = await POST(request(JSON.stringify(source)));
    assert.equal(response.status, 200);
    const c = (await response.json()) as MissionContingencyCertificate;
    assert.equal(c.status, 'not_certified');
    assert.equal(c.certifiedAnchors, 0);
    assert.equal(c.anchors.length, 0);
    assert.ok(c.reasons.length > 0);
  }
});

void test('contingency API: malformed JSON, duplicate keys and unsafe object keys reject before schema', async () => {
  for (const body of [
    '',
    '{',
    '{"document":{},"document":{}}',
    '{"x":{"same":1,"same":2}}',
    '{"__proto__":{}}',
    '{"constructor":{"prototype":{}}}',
  ]) {
    const response = await POST(request(body));
    assert.equal(response.status, 400, body);
    assert.equal(
      ((await response.json()) as { code: string }).code,
      'JSON',
      body,
    );
  }
});

void test('contingency API: unknown top-level/document fields and missing document reject strict schema', async () => {
  const source = await fixture;
  for (const body of [
    { ...source, extra: true },
    { ...source, document: { ...source.document, extra: true } },
    { candidate: source.candidate },
  ]) {
    const response = await POST(request(JSON.stringify(body)));
    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as { code: string }).code, 'SCHEMA');
  }
  const unknownCandidate = {
    ...source,
    candidate: { ...source.candidate, hiddenOverride: true },
  };
  const response = await POST(request(JSON.stringify(unknownCandidate)));
  assert.equal(response.status, 200);
  assert.equal(
    ((await response.json()) as MissionContingencyCertificate).status,
    'not_certified',
  );
});

void test('contingency API: missing/null/unstructured candidate produces no certificate or internal crash', async () => {
  const { document } = await fixture;
  for (const candidate of [
    undefined,
    null,
    [],
    {},
    { status: 'feasible_model' },
  ]) {
    const response = await POST(
      request(JSON.stringify({ document, candidate })),
    );
    const body = (await response.json()) as { status?: string; code?: string };
    assert.notEqual(body.status, 'certified_model');
    assert.ok([200, 400, 422].includes(response.status));
    if (response.status === 200) assert.equal(body.status, 'not_certified');
  }
});

void test('contingency API: wrong origin/content type reject and cancel unopened bodies', async () => {
  for (const [headers, expected, code] of [
    [{ ...jsonHeaders, Origin: 'https://hostile.example' }, 403, 'ORIGIN'],
    [{ 'Content-Type': 'text/plain' }, 415, 'TYPE'],
    [{ 'Content-Type': 'application/json-bogus' }, 415, 'TYPE'],
  ] as const) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>(
      {
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const req = new Request(url, {
      method: 'POST',
      headers,
      body: stream,
      duplex: 'half',
    } as RequestInit);
    const response = await POST(req);
    assert.equal(response.status, expected);
    assert.equal(((await response.json()) as { code: string }).code, code);
    assert.equal(cancelled, true);
    assert.equal(req.body!.locked, false);
  }
});

void test('contingency API: 2 MiB limit counts bytes, cancels oversized stream and releases busy state', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('я'.repeat(1024 * 1024 + 1)),
        );
      },
      cancel() {
        cancelled = true;
        return new Promise<void>(() => {});
      },
    },
    { highWaterMark: 0 },
  );
  const req = new Request(url, {
    method: 'POST',
    headers: jsonHeaders,
    body: stream,
    duplex: 'half',
  } as RequestInit);
  const response = await POST(req);
  assert.equal(response.status, 413);
  assert.equal(((await response.json()) as { code: string }).code, 'SIZE');
  assert.equal(cancelled, true);
  assert.equal(req.body!.locked, false);
  assert.equal((await POST(request('{'))).status, 400);
});

void test('contingency API: stalled body returns timeout, releases reader even if cancel never resolves, and frees busy lock', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull() {
        return new Promise<void>(() => {});
      },
      cancel() {
        cancelled = true;
        return new Promise<void>(() => {});
      },
    },
    { highWaterMark: 0 },
  );
  const req = new Request(url, {
    method: 'POST',
    headers: jsonHeaders,
    body: stream,
    duplex: 'half',
  } as RequestInit);
  const pending = POST(req);
  let busyCancelled = false;
  const busyStream = new ReadableStream<Uint8Array>(
    {
      cancel() {
        busyCancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const busy = await POST(
    new Request(url, {
      method: 'POST',
      headers: jsonHeaders,
      body: busyStream,
      duplex: 'half',
    } as RequestInit),
  );
  assert.equal(busy.status, 429);
  assert.equal(busy.headers.get('Retry-After'), '3');
  assert.equal(((await busy.json()) as { code: string }).code, 'BUSY');
  assert.equal(busyCancelled, true);
  t.mock.timers.tick(5000);
  const response = await pending;
  assert.equal(response.status, 408);
  assert.equal(((await response.json()) as { code: string }).code, 'TIMEOUT');
  assert.equal(cancelled, true);
  assert.equal(req.body!.locked, false);
  assert.equal((await POST(request('{'))).status, 400);
});

void test('contingency API: invalid UTF-8 and aborted completed upload reject without holding lock', async () => {
  const invalid = await POST(
    new Request(url, {
      method: 'POST',
      headers: jsonHeaders,
      body: new Uint8Array([0xff, 0xfe]),
    }),
  );
  assert.equal(invalid.status, 400);
  assert.equal(((await invalid.json()) as { code: string }).code, 'JSON');
  const controller = new AbortController();
  controller.abort();
  const req = new Request(url, {
    method: 'POST',
    headers: jsonHeaders,
    body: '{}',
    signal: controller.signal,
  });
  const cancelled = await POST(req);
  assert.equal(cancelled.status, 499);
  assert.equal(
    ((await cancelled.json()) as { code: string }).code,
    'CANCELLED',
  );
  assert.equal(req.body!.locked, false);
  assert.equal((await POST(request('{'))).status, 400);
});

void test('contingency API: exhausted CPU budget cannot become a complete certificate', async (t) => {
  const source = await fixture;
  let calls = 0;
  t.mock.method(performance, 'now', () => (calls++ ? 10000 : 0));
  const response = await POST(request(JSON.stringify(source)));
  assert.equal(response.status, 200);
  const certificate = (await response.json()) as MissionContingencyCertificate;
  assert.equal(certificate.status, 'not_certified');
  assert.equal(certificate.budgetExceeded, true);
  assert.ok(certificate.checkedAnchors < certificate.anchorCount);
  assert.ok(certificate.reasons.length > 0);
});
