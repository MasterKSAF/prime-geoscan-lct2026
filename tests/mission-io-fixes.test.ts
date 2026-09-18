import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { demoScenario } from '../lib/planner/demo.ts';
import { demoMission } from '../lib/planner/mission-demo.ts';
import {
  MAX_MISSION_FILE_BYTES,
  canonicalMissionJson,
  importGeometryText,
  missionSummaryMarkdown,
  parseMissionText,
  serializeMissionJson,
} from '../lib/planner/mission-io.ts';
import { createMissionLibrary } from '../lib/planner/mission-library.ts';
import type {
  MissionDocument,
  MissionResult,
} from '../lib/planner/mission-schema.ts';
import type { Coordinate, Polygon } from '../lib/planner/schema.ts';

// Resolve the app's tsconfig alias for direct, network-free route regression tests.
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
    return (await import('../app/api/planner/missions/solve/route.ts')).POST;
  } finally {
    hook.deregister();
  }
}
const POST = await loadPost();
const bytes = (text: string) => new TextEncoder().encode(text).length;
const fixedNow = () => new Date('2026-09-17T12:00:00Z');
const library = () =>
  createMissionLibrary({ indexedDB: new IDBFactory(), now: fixedNow });

function denseMission(): MissionDocument {
  const circle = (x: number, y: number, radius: number): Coordinate[] => {
    const points = Array.from(
      { length: 69 },
      (_, i): Coordinate => [
        x + radius * Math.cos((i * 2 * Math.PI) / 69),
        y + radius * Math.sin((i * 2 * Math.PI) / 69),
      ],
    );
    return [...points, points[0]];
  };
  const area: Polygon = {
    type: 'Polygon',
    coordinates: [
      circle(30.3, 60.035, 0.009),
      circle(30.295, 60.035, 0.001),
      circle(30.305, 60.035, 0.001),
      circle(30.3, 60.03, 0.001),
      circle(30.3, 60.04, 0.001),
    ],
  };
  const document = demoMission(1);
  document.jobs = Array.from({ length: 8 }, (_, i) => ({
    ...structuredClone(document.jobs[0]),
    id: `dense-${i}`,
    area: structuredClone(area),
  }));
  return document;
}

function expandedNumberInput(): string {
  const document = demoMission(1);
  const area: Polygon = {
    type: 'Polygon',
    coordinates: Array.from({ length: 5 }, () =>
      Array.from({ length: 70 }, (): Coordinate => [0.000001, 0.000002]),
    ),
  };
  document.scenario.area = area;
  document.scenario.airspace = area;
  document.scenario.exclusions = Array.from({ length: 5 }, () => area);
  document.jobs = Array.from({ length: 8 }, (_, i) => ({
    ...structuredClone(document.jobs[0]),
    id: `job-${i}`,
    area,
  }));
  document.restrictions = Array.from({ length: 20 }, (_, i) => ({
    id: `restriction-${i}`,
    name: 'Restriction',
    kind: 'noFlight',
    geometry: area,
    minAltitudeM: 0,
    maxAltitudeM: null,
    startAt: null,
    endAt: null,
    source: 'Test',
  }));
  const normalized = JSON.stringify(document);
  const input = normalized
    .replaceAll('0.000001', '1e-6')
    .replaceAll('0.000002', '2e-6');
  assert.ok(bytes(input) < MAX_MISSION_FILE_BYTES);
  assert.ok(bytes(normalized) > MAX_MISSION_FILE_BYTES);
  return input;
}

void test('IO-01: dense accepted mission saves, restores and exports every coordinate and field', async () => {
  const original = denseMission();
  assert.ok(bytes(JSON.stringify(original)) < MAX_MISSION_FILE_BYTES);
  assert.ok(bytes(JSON.stringify(original, null, 2)) > MAX_MISSION_FILE_BYTES);
  const accepted = parseMissionText(JSON.stringify(original), 'json');
  const exported = serializeMissionJson(accepted);
  assert.equal(exported, canonicalMissionJson(accepted));
  assert.ok(bytes(exported) <= MAX_MISSION_FILE_BYTES);
  assert.deepEqual(parseMissionText(exported, 'json'), original);
  const appendix = missionSummaryMarkdown(accepted)
    .split('```json\n')[1]
    .split('\n```')[0];
  assert.deepEqual(JSON.parse(appendix), original);
  const first = library();
  const restored = library();
  try {
    const saved = await first.save(accepted);
    assert.deepEqual((await first.get(saved.id))?.document, original);
    assert.equal(await restored.importBackup(await first.exportBackup()), 1);
    assert.deepEqual(await restored.list(true), await first.list(true));
  } finally {
    first.close();
    restored.close();
  }
});

void test('IO-01: dense GeoJSON import remains lossless through mission JSON and library save', async () => {
  const document = denseMission();
  const imported = importGeometryText(
    JSON.stringify({
      type: 'FeatureCollection',
      features: document.jobs.map((job) => ({
        type: 'Feature',
        properties: { name: job.name },
        geometry: job.area,
      })),
    }),
    'geojson',
    'area',
  );
  document.jobs = imported.features.map((feature, i) => ({
    ...document.jobs[i],
    area: feature.geometry as Polygon,
  }));
  const lib = library();
  try {
    await lib.save(document);
    assert.deepEqual(
      parseMissionText(serializeMissionJson(document)),
      document,
    );
    assert.deepEqual((await lib.get(document.id))?.document, document);
  } finally {
    lib.close();
  }
});

void test('IO-01: small mission keeps readable JSON; normalization overflow is rejected at import', () => {
  assert.match(serializeMissionJson(demoMission(1)), /^\{\n  /);
  const input = expandedNumberInput();
  for (const format of ['json', 'yaml'] as const)
    assert.throws(() => parseMissionText(input, format), /200 КиБ/);
});

function backupWithRevision(revision: number) {
  const document = demoMission(1);
  return JSON.stringify({
    format: 'prime-mission-library/1',
    exportedAt: fixedNow().toISOString(),
    entries: [
      {
        id: document.id,
        revision,
        savedAt: fixedNow().toISOString(),
        archived: false,
        document,
      },
    ],
  });
}

void test('IO-02: maximum revision remains readable and unchanged after refused save/archive', async () => {
  const lib = library();
  const restored = library();
  try {
    assert.equal(
      await lib.importBackup(backupWithRevision(Number.MAX_SAFE_INTEGER)),
      1,
    );
    const before = await lib.list(true);
    const document = { ...before[0].document, name: 'Must not overwrite' };
    await assert.rejects(
      lib.save(document, { expectedRevision: Number.MAX_SAFE_INTEGER }),
      /предел ревизий/,
    );
    assert.deepEqual(await lib.list(true), before);
    await assert.rejects(
      lib.archive(document.id, Number.MAX_SAFE_INTEGER),
      /предел ревизий/,
    );
    assert.deepEqual(await lib.get(document.id), before[0]);
    assert.equal(await restored.importBackup(await lib.exportBackup()), 1);
    assert.deepEqual(await restored.list(true), before);
    const copy = await lib.save({ ...document, id: 'recovered-copy' });
    assert.equal(copy.revision, 1);
  } finally {
    lib.close();
    restored.close();
  }
});

void test('IO-02: last safe increment works for save and archive; unsafe import stays atomic', async () => {
  for (const operation of ['save', 'archive'] as const) {
    const lib = library();
    try {
      await lib.importBackup(backupWithRevision(Number.MAX_SAFE_INTEGER - 1));
      const document = demoMission(1);
      if (operation === 'save')
        await lib.save(document, {
          expectedRevision: Number.MAX_SAFE_INTEGER - 1,
        });
      else await lib.archive(document.id, Number.MAX_SAFE_INTEGER - 1);
      assert.equal(
        (await lib.get(document.id))?.revision,
        Number.MAX_SAFE_INTEGER,
      );
      assert.equal((await lib.list(true)).length, 1);
    } finally {
      lib.close();
    }
  }
  const lib = library();
  try {
    await lib.save({ ...demoMission(1), id: 'keep' });
    const before = await lib.list(true);
    await assert.rejects(
      lib.importBackup(backupWithRevision(Number.MAX_SAFE_INTEGER + 1)),
      /формат записи/,
    );
    assert.deepEqual(await lib.list(true), before);
  } finally {
    lib.close();
  }
});

function post(body: string, type = 'application/json') {
  return POST(
    new Request('http://localhost/api/planner/missions/solve', {
      method: 'POST',
      headers: { 'Content-Type': type },
      body,
    }),
  );
}

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as { code: string }).code;
}

void test('IO-03: API rejects duplicate safety keys, unsafe trees and malformed JSON before solving', async () => {
  const valid = JSON.stringify(demoMission(1));
  for (const body of [
    valid.replace('"reservePct":25', '"reservePct":80,"reservePct":25'),
    valid.replace('"reservePct":25', '"reservePct":80,"reser\\u0076ePct":25'),
    valid.replace('"reservePct":25', '"reservePct":25,"__proto__":{}'),
    valid.replace('"reservePct":25', '"reservePct":1e999'),
    '{',
    '',
  ]) {
    assert.notEqual(body, valid);
    const response = await post(body);
    assert.equal(response.status, 400);
    assert.equal(await errorCode(response), 'JSON');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  }
});

void test('IO-03: API matches MIME exactly, keeps v2-only and distinct schema/mission errors', async () => {
  for (const type of [
    'application/jsonp',
    'application/json-patch+json',
    'text/plain',
  ]) {
    const response = await post('{}', type);
    assert.equal(response.status, 415);
    assert.equal(await errorCode(response), 'TYPE');
  }
  for (const type of ['application/json', 'APPLICATION/JSON; charset=utf-8']) {
    const response = await post('{}', type);
    assert.equal(response.status, 400);
    assert.equal(await errorCode(response), 'SCHEMA');
  }
  const legacy = await post(JSON.stringify(demoScenario()));
  assert.equal(legacy.status, 400);
  assert.equal(await errorCode(legacy), 'SCHEMA');
  const invalid = demoMission(1);
  invalid.window.end = invalid.window.start;
  const missionError = await post(JSON.stringify(invalid));
  assert.equal(missionError.status, 422);
  assert.equal(await errorCode(missionError), 'MISSION');
  const tooLarge = await post(expandedNumberInput());
  assert.equal(tooLarge.status, 413);
  assert.equal(await errorCode(tooLarge), 'SIZE');
});

void test('IO-03: valid API JSON still solves after rejected requests', async () => {
  const document = demoMission(1);
  document.planning.maxComputeMs = 100;
  const response = await post(JSON.stringify(document));
  assert.equal(response.status, 200);
  const result = (await response.json()) as MissionResult;
  assert.deepEqual(result.document, document);
  assert.equal(result.candidates.length, 2);
});

function streamingRequest(
  body: ReadableStream<Uint8Array>,
  headers: Record<string, string> = { 'Content-Type': 'text/plain' },
): Request {
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers,
    body,
    duplex: 'half',
  };
  return new Request('http://localhost/api/planner/missions/solve', init);
}

void test('early API rejection drains to EOF without parsing malformed JSON or changing status', async () => {
  for (const [headers, status, code] of [
    [{ 'Content-Type': 'text/plain' }, 415, 'TYPE'],
    [
      { 'Content-Type': 'application/json', Origin: 'https://example.invalid' },
      403,
      'ORIGIN',
    ],
  ] as const) {
    let reads = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          reads++;
          if (reads === 1)
            controller.enqueue(new TextEncoder().encode('{not-json'));
          else controller.close();
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const request = streamingRequest(body, headers);
    const response = await POST(request);
    assert.equal(response.status, status);
    assert.equal(await errorCode(response), code);
    assert.equal(reads, 2);
    assert.equal(cancelled, false);
    assert.equal(request.body?.locked, false);
  }
});

void test('early API rejection preserves the HTTP error when the body stream fails', async () => {
  const request = streamingRequest(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('Upload failed'));
      },
    }),
  );
  const response = await POST(request);
  assert.equal(response.status, 415);
  assert.equal(await errorCode(response), 'TYPE');
  assert.equal(request.body?.locked, false);
});

void test('early API rejection stops reading at its 200 KiB bound, cancels and releases the lock', async () => {
  let reads = 0;
  let cancelled = false;
  const request = streamingRequest(
    new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          reads++;
          controller.enqueue(new Uint8Array(MAX_MISSION_FILE_BYTES / 2));
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    ),
  );
  const response = await POST(request);
  assert.equal(response.status, 415);
  assert.equal(await errorCode(response), 'TYPE');
  assert.equal(
    reads,
    2,
    'No further read from an unbounded upload after reaching the limit.',
  );
  assert.equal(cancelled, true);
  assert.equal(request.body?.locked, false);
});

void test('early API rejection has a 5 second deadline even if stream cancellation never settles', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cancelled = false;
  const request = streamingRequest(
    new ReadableStream<Uint8Array>(
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
    ),
  );
  const pending = POST(request);
  t.mock.timers.tick(5000);
  const response = await pending;
  assert.equal(response.status, 415);
  assert.equal(await errorCode(response), 'TYPE');
  assert.equal(cancelled, true);
  assert.equal(request.body?.locked, false);
});

void test('busy API request drains its body while retaining 429 and the active request', async () => {
  let activeController!: ReadableStreamDefaultController<Uint8Array>;
  const activeRequest = streamingRequest(
    new ReadableStream<Uint8Array>({
      start(controller) {
        activeController = controller;
      },
    }),
    { 'Content-Type': 'application/json' },
  );
  const pending = POST(activeRequest);
  let readToEnd = false;
  const busyRequest = streamingRequest(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        readToEnd = true;
        controller.close();
      },
    }),
    { 'Content-Type': 'application/json' },
  );
  try {
    const response = await POST(busyRequest);
    assert.equal(response.status, 429);
    assert.equal(await errorCode(response), 'BUSY');
    assert.equal(response.headers.get('Retry-After'), '3');
    assert.equal(readToEnd, true);
    assert.equal(busyRequest.body?.locked, false);
  } finally {
    activeController.close();
    assert.equal((await pending).status, 400);
  }
});
