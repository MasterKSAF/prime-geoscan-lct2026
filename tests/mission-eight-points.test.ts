import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createMissionLibrary } from '../lib/planner/mission-library.ts';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { synchronizeWorkSettings } from '../lib/planner/mission-editing.ts';
import { parseMissionDocument, sha256 } from '../lib/planner/mission-schema.ts';
import type { MissionDocument } from '../lib/planner/mission-schema.ts';
import {
  fleetImportDiff,
  mergeMissionFleet,
  parseFleetText,
  serializeMissionFleet,
} from '../lib/planner/mission-fleet.ts';
import {
  fleetBases,
  createFleetRegistry,
} from '../lib/planner/fleet-registry.ts';
import {
  createMissionOperations,
  getOperationStartBlockers,
} from '../lib/planner/mission-operations.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { independentOperations } from '../lib/planner/mission-coordination.ts';
import { prepareGroundRevision } from '../lib/planner/mission-revision.ts';
import {
  missionRunReport,
  verifyMissionRunReport,
} from '../lib/planner/mission-run-export.ts';
import { missionBrowserRows } from '../lib/planner/mission-browser.ts';
import { assertRevisionBinding } from '../lib/planner/mission-revision-binding.ts';

const source = () =>
  SHOWCASE_SCENARIOS.find((s) => s.id === 'height-obstacle')!.create();
async function input(d = source(), id = 'run-a') {
  const r = await solveMissionDocument(d),
    c = r.candidates[0];
  assert.equal(c.status, 'feasible_model');
  return {
    id,
    document: d,
    candidate: c,
    approval: {
      candidateId: c.id,
      inputHash: r.inputHash,
      planHash: await sha256(c),
      approvedAt: new Date().toISOString(),
    },
  };
}
const fixture = input();
function distant(d: MissionDocument) {
  const shift = (x: unknown): unknown => {
    if (Array.isArray(x))
      return x.length === 2 && x.every((v) => typeof v === 'number')
        ? [x[0] + 0.1, x[1]]
        : x.map(shift);
    if (x && typeof x === 'object')
      return Object.fromEntries(
        Object.entries(x).map(([k, v]) => [k, shift(v)]),
      );
    return x;
  };
  const out = shift(d) as MissionDocument;
  out.id = 'distant';
  out.scenario.vehicles.forEach((v) => {
    v.id = 'b-' + v.id;
  });
  out.batteries.forEach((b) => {
    b.id = 'b-' + b.id;
    b.vehicleId = 'b-' + b.vehicleId;
  });
  out.jobs.forEach((j) => {
    j.assignedVehicleIds = j.assignedVehicleIds.map((id) => 'b-' + id);
  });
  return out;
}
void test('archive, restore, rename, delete with revision checks; no hidden data loss', async () => {
  const lib = createMissionLibrary({ indexedDB: new IDBFactory() });
  let saved = await lib.save(source());
  await lib.archive(saved.id, saved.revision);
  assert.equal((await lib.list()).length, 0);
  saved = (await lib.list(true))[0];
  saved = await lib.restore(saved);
  assert.equal((await lib.list()).length, 1);
  const old = saved;
  saved = await lib.save(
    { ...saved.document, name: 'Renamed' },
    { expectedRevision: saved.revision },
  );
  await assert.rejects(lib.remove(saved.id, old.revision));
  assert.equal((await lib.get(saved.id))!.document.name, 'Renamed');
  await lib.remove(saved.id, saved.revision);
  assert.equal(await lib.get(saved.id), null);
  lib.close();
});
void test('linked areas inherit settings, never geometry; override detaches cleanly', () => {
  let d = source();
  const parent = d.jobs[0];
  d.jobs.push({
    ...structuredClone(parent),
    id: 'child',
    name: 'Участок 2',
    inheritsFrom: parent.id,
  });
  const geometry = JSON.stringify(d.jobs[1].area);
  parent.job.altitudeM += 10;
  assert.throws(() => parseMissionDocument(d), /параметры/);
  d = synchronizeWorkSettings(d);
  assert.equal(d.jobs[1].job.altitudeM, parent.job.altitudeM);
  assert.equal(JSON.stringify(d.jobs[1].area), geometry);
  assert.ok(parseMissionDocument(d));
  delete d.jobs[1].inheritsFrom;
  d.jobs[0].job.altitudeM += 20;
  assert.notEqual(
    synchronizeWorkSettings(d).jobs[1].job.altitudeM,
    d.jobs[0].job.altitudeM,
  );
});
void test('inheritance cycles, missing source, and conflicting bases reject', () => {
  const d = source();
  d.jobs[0].inheritsFrom = d.jobs[0].id;
  assert.throws(() => parseMissionDocument(d));
  delete d.jobs[0].inheritsFrom;
  const b = {
    id: 'base-a',
    name: 'База',
    coordinate: d.scenario.vehicles[0].start,
  };
  d.bases = [b, b];
  assert.throws(() => parseMissionDocument(d), /Базы/);
});
void test('base ID and custom name persist through registry and fleet JSON', async () => {
  const d = source();
  d.bases = [
    {
      id: 'base-permanent',
      name: 'Северная',
      coordinate: d.scenario.vehicles[0].start,
    },
  ];
  const f = parseFleetText(serializeMissionFleet(d));
  assert.equal(f.bases![0].id, 'base-permanent');
  const store = createFleetRegistry(new IDBFactory());
  await store.save(d, null);
  assert.equal(fleetBases((await store.read())!.document)[0].name, 'Северная');
  await store.close();
});
void test('fleet diff distinguishes changes; updating IDs requires explicit confirmation', () => {
  const d = source(),
    f = parseFleetText(serializeMissionFleet(d));
  assert.ok(fleetImportDiff(d, f).every((x) => x.kind === 'same'));
  f.vehicles[0].name = 'Changed';
  assert.equal(fleetImportDiff(d, f)[0].kind, 'update');
  assert.throws(() => mergeMissionFleet(d, f, false), /Конфликт/);
  assert.equal(
    mergeMissionFleet(d, f, true).scenario.vehicles[0].name,
    'Changed',
  );
  assert.notEqual(d.scenario.vehicles[0].name, 'Changed');
});
void test('parallel missions: genuinely separated fleets run and advance independently', async () => {
  const store = createMissionOperations({ indexedDB: new IDBFactory() });
  let a = await store.enqueue(structuredClone(await fixture));
  let b = await store.enqueue(await input(distant(source()), 'run-b'));
  assert.ok(independentOperations(a, b));
  a = await store.start(a.id, a.revision);
  b = await store.start(b.id, b.revision);
  a = await store.advance(a.id, a.revision, 20);
  b = await store.advance(b.id, b.revision, 25);
  assert.equal((await store.get(a.id))!.progressSec, 20);
  assert.equal((await store.get(b.id))!.progressSec, 25);
  assert.equal(
    (await store.list()).filter((x) => x.status === 'running').length,
    2,
  );
  store.close();
});
void test('overlapping airspace or shared aircraft remain blocked regardless of altitude or clocks', async () => {
  const store = createMissionOperations({ indexedDB: new IDBFactory() });
  const a = await store.enqueue(structuredClone(await fixture));
  const shared = {
    ...a,
    id: 'shared',
    status: 'running' as const,
    startedAt: new Date().toISOString(),
  };
  assert.equal(independentOperations(a, shared), false);
  assert.ok(getOperationStartBlockers(a, [a, shared]).length);
  const d = structuredClone(a);
  d.id = 'distinct';
  d.candidate.sorties.forEach((s) => {
    s.vehicleId = 'different';
  });
  assert.equal(independentOperations(a, d), false);
  store.close();
});
void test('safe revision produces remainder, binds parent, exports verifiable history', async () => {
  const store = createMissionOperations({ indexedDB: new IDBFactory() });
  let parent = await store.enqueue(structuredClone(await fixture));
  parent = await store.start(parent.id, parent.revision);
  parent = await store.pause(parent.id, parent.revision, 0);
  parent = await store.cancel(parent.id, parent.revision);
  const d = await prepareGroundRevision(
    parent,
    await store.listFleet(),
    'Уточнить состав работ',
  );
  assert.equal(d.revisionSource!.integrityHash, parent.integrityHash);
  assert.ok(
    d.revisionSource!.coverage.every(
      (c) => c.completedM2 === 0 && c.remainingM2 > 0,
    ),
  );
  const child = await store.enqueue(await input(d, 'child-run'));
  await assert.rejects(missionRunReport(child), /история/);
  const report = await missionRunReport(child, [parent]);
  assert.equal(report.revisionHistory!.length, 1);
  await verifyMissionRunReport(report);
  const tampered = structuredClone(report);
  tampered.revisionHistory![0].document.name = 'fake';
  await assert.rejects(verifyMissionRunReport(tampered));
  assert.equal(missionBrowserRows([], [parent, child]).length, 1);
  assert.equal((await store.start(child.id, child.revision)).status, 'running');
  store.close();
});
void test('revision refuses airborne cancellation and cannot fabricate landing', async () => {
  const store = createMissionOperations({ indexedDB: new IDBFactory() });
  let row = await store.enqueue(structuredClone(await fixture));
  row = await store.start(row.id, row.revision);
  row = await store.advance(
    row.id,
    row.revision,
    row.candidate.sorties[0].startSec + 5,
  );
  row = await store.cancel(row.id, row.revision);
  await assert.rejects(
    prepareGroundRevision(row, await store.listFleet(), 'test'),
    /Посадка|воздухе/,
  );
  store.close();
});

void test('partial safe checkpoint subtracts completed work and never restores consumed battery', async () => {
  const d = source();
  const own = (await fixture).candidate.sorties[0].vehicleId;
  d.jobs = [
    d.jobs[0],
    { ...structuredClone(d.jobs[0]), id: 'later', name: 'Поздняя работа' },
  ];
  d.jobs.forEach((j) => (j.assignedVehicleIds = [own]));
  const store = createMissionOperations({ indexedDB: new IDBFactory() });
  let row = await store.enqueue(await input(d, 'partial'));
  row = await store.start(row.id, row.revision);
  const at = row.candidate.sorties[0].endSec;
  row = await store.pause(row.id, row.revision, at);
  row = await store.cancel(row.id, row.revision);
  const draft = await prepareGroundRevision(
    row,
    await store.listFleet(),
    'Проверка остатка',
  );
  assert.ok(draft.revisionSource!.coverage.some((c) => c.completedM2 > 0));
  assert.ok(draft.revisionSource!.coverage.some((c) => c.remainingM2 > 0));
  assert.ok(
    draft.scenario.vehicles.find((v) => v.id === own)!.batteryPct <
      d.scenario.vehicles.find((v) => v.id === own)!.batteryPct,
  );
  assertRevisionBinding(draft, row);
  draft.revisionSource!.coverage[0].completedM2 += 100;
  assert.throws(() => assertRevisionBinding(draft, row), /площадь/);
  store.close();
});
