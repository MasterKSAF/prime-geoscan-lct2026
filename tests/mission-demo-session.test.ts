import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { IDBFactory } from 'fake-indexeddb';
import {
  DEMO_IDS,
  prepareDemoDocument,
  demoCompletion,
  simulationArtifacts,
} from '../lib/planner/demo-session.ts';
import { parseMissionDocument, sha256 } from '../lib/planner/mission-schema.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { createMissionOperations } from '../lib/planner/mission-operations.ts';
import { fleetStateFromDocument } from '../lib/planner/mission-fleet-state.ts';
import {
  buildMissionArchive,
  buildMissionDiagnosticArchive,
  readStoredZip,
  verifyArchiveFiles,
} from '../lib/planner/mission-archive.ts';

const clock = '2026-09-23T10:00:00.000Z';
async function fixture(id: string) {
  const raw = parseMissionDocument(
    JSON.parse(
      await readFile(`public/planner/scenarios/${id}.mission.json`, 'utf8'),
    ),
  );
  const document = prepareDemoDocument(raw);
  const result = await solveMissionDocument(document);
  const candidate = result.candidates[0];
  return {
    id: `run-${id}`,
    document,
    candidate,
    approval: {
      inputHash: result.inputHash,
      planHash: await sha256(candidate),
      candidateId: candidate.id,
      approvedAt: clock,
    },
  };
}
const first = fixture(DEMO_IDS[0]);
void test('three active mission limit is separate from saved cards and cancelled history', async () => {
  const a = await first;
  const store = createMissionOperations({
    indexedDB: new IDBFactory(),
    demoSession: true,
    now: () => new Date(clock),
  });
  const rows = [];
  const make = async (i: number) => {
    const d = structuredClone(a.document);
    d.id = `arbitrary-${i}`;
    d.window.start = new Date(
      Date.parse(d.window.start) + i * 86400000,
    ).toISOString();
    d.window.end = new Date(
      Date.parse(d.window.end) + i * 86400000,
    ).toISOString();
    for (const b of d.batteries) b.readyAt = d.window.start;
    const result = await solveMissionDocument(d),
      candidate = result.candidates[0];
    assert.equal(candidate.status, 'feasible_model');
    return {
      id: `run-arbitrary-${i}`,
      document: result.document,
      candidate,
      approval: {
        candidateId: candidate.id,
        inputHash: result.inputHash,
        planHash: await sha256(candidate),
        approvedAt: clock,
      },
    };
  };
  for (let i = 0; i < 3; i++) rows.push(await store.enqueue(await make(i)));
  const fourth = await make(3);
  await assert.rejects(() => store.enqueue(fourth), /три миссии/);
  await store.cancel(rows[0].id, rows[0].revision);
  assert.equal((await store.enqueue(fourth)).status, 'scheduled');
  assert.equal((await store.list()).length, 4);
  store.close();
});
void test('demo fixtures preserve actual geometry, safety and low battery; weather is explicit and flightable', async () => {
  for (const id of DEMO_IDS) {
    const raw = parseMissionDocument(
      JSON.parse(
        await readFile(`public/planner/scenarios/${id}.mission.json`, 'utf8'),
      ),
    );
    const before = JSON.stringify(raw),
      d = prepareDemoDocument(raw);
    assert.equal(JSON.stringify(raw), before);
    assert.deepEqual(d.jobs, raw.jobs);
    assert.deepEqual(
      d.batteries.map((b) => b.initialPct),
      raw.batteries.map((b) => b.initialPct),
    );
    assert.equal(d.scenario.wind.speedMps, 1);
    assert.ok(
      d.scenario.vehicles.every(
        (v) => v.maxWindMps >= d.scenario.wind.speedMps,
      ),
    );
    assert.match(d.notes, /DEMO-SIMULATION/);
  }
});
void test('session guards reject duplicate runs; custom IDs work and deletion allows replay', async () => {
  const factory = new IDBFactory();
  const store = createMissionOperations({
    indexedDB: factory,
    dbName: 'demo',
    demoSession: true,
    now: () => new Date(clock),
  });
  const a = structuredClone(await first);
  assert.equal(a.candidate.status, 'feasible_model');
  let row = await store.enqueue(a);
  await assert.rejects(
    () => store.enqueue({ ...a, id: 'duplicate' }),
    /мисси|запуск/i,
  );
  const customStore = createMissionOperations({
    indexedDB: factory,
    dbName: 'custom',
    demoSession: true,
    now: () => new Date(clock),
  });
  const customResult = await solveMissionDocument({
    ...a.document,
    id: 'expert-mission',
  });
  const custom = {
    ...a,
    id: 'custom-run',
    document: customResult.document,
    candidate: customResult.candidates[0],
  };
  custom.approval = {
    ...custom.approval,
    candidateId: custom.candidate.id,
    planHash: await sha256(custom.candidate),
    inputHash: customResult.inputHash,
  };
  assert.equal(
    (await customStore.enqueue(custom)).document.id,
    'expert-mission',
  );
  customStore.close();
  row = await store.start(row.id, row.revision);
  await store.removeDemo(row.id, row.revision);
  assert.equal((await store.list()).length, 0);
  assert.equal(
    (await store.listFleet()).filter((v) => v.operationId === row.id).length,
    0,
  );
  const fresh = await store.enqueue({ ...a, id: 'replay' });
  assert.equal(fresh.progressSec, 0);
  const normal = createMissionOperations({
    indexedDB: factory,
    dbName: 'normal',
  });
  await assert.rejects(() => normal.removeDemo('x', 1), /демонстрационной/);
  const nextSession = createMissionOperations({
    indexedDB: factory,
    dbName: 'new-demo',
    demoSession: true,
  });
  assert.equal((await nextSession.list()).length, 0);
  assert.equal((await store.list()).length, 1);
  store.close();
  normal.close();
  nextSession.close();
});
void test('synthetic polls only admitted in demo mode, preserve actual charge and remain marked simulation', async () => {
  const a = await first;
  const state = fleetStateFromDocument(
    a.document,
    a.document.scenario.vehicles[0].id,
    clock,
  );
  state.source = 'simulation';
  const factory = new IDBFactory(),
    normal = createMissionOperations({
      indexedDB: factory,
      dbName: 'normal',
      now: () => new Date(clock),
    }),
    demo = createMissionOperations({
      indexedDB: factory,
      dbName: 'demo',
      demoSession: true,
      now: () => new Date(clock),
    });
  await assert.rejects(
    () =>
      normal.reportFleet({ state, expectedRevision: 0, replacement: false }),
    /оператора/,
  );
  const saved = await demo.reportFleet({
    state,
    expectedRevision: 0,
    replacement: false,
  });
  assert.equal(saved.source, 'simulation');
  assert.equal(saved.battery.initialPct, state.battery.initialPct);
  normal.close();
  demo.close();
});
void test('evidence contains synthetic captures only after saved progress; tampering rejected; failed demo stays failed', async () => {
  const a = await first;
  const store = createMissionOperations({
    indexedDB: new IDBFactory(),
    demoSession: true,
    now: () => new Date(clock),
  });
  let row = await store.enqueue(a);
  assert.equal(demoCompletion(row), 0);
  const before = simulationArtifacts(a.document, a.candidate, row);
  assert.equal(
    JSON.parse(before['data/simulation/captures.json']).previewCount,
    0,
  );
  row = await store.start(row.id, row.revision);
  row = await store.advance(
    row.id,
    row.revision,
    a.candidate.metrics.makespanSec,
  );
  assert.equal(row.status, 'completed');
  assert.equal(demoCompletion(row), 100);
  const archive = await buildMissionArchive(a.document, a.candidate, row, [
    row,
  ]);
  const files = readStoredZip(archive.bytes);
  assert.ok(files['data/simulation/poll.json']);
  assert.ok(files['data/run/events.jsonl']);
  assert.ok(files['data/checks/requirements.json']);
  assert.match(
    files['data/simulation/previews/frame-1.svg'],
    /NOT A REAL AERIAL PHOTO/,
  );
  assert.equal(
    JSON.parse(files['data/simulation/captures.json']).realPhotos,
    0,
  );
  await verifyArchiveFiles(files);
  await assert.rejects(() =>
    verifyArchiveFiles({
      ...files,
      'data/simulation/previews/frame-1.svg': 'fake',
    }),
  );
  const bad = await fixture(DEMO_IDS[2]);
  assert.notEqual(bad.candidate.status, 'feasible_model');
  await assert.rejects(() => buildMissionArchive(bad.document, bad.candidate));
  const rejected = await buildMissionDiagnosticArchive(
    bad.document,
    bad.candidate,
  );
  assert.equal(
    (await verifyArchiveFiles(readStoredZip(rejected.bytes))).status,
    'diagnostic-only-not-flight-approved',
  );
  assert.equal(
    JSON.parse(rejected.files['data/simulation/captures.json']).previewCount,
    0,
  );
  store.close();
});
