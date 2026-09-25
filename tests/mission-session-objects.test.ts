import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { demoMission } from '../lib/planner/mission-demo.ts';
import {
  installedBatteryDocument,
  fleetStateFromDocument,
} from '../lib/planner/mission-fleet-state.ts';
import {
  missionBases,
  baseVehicleIds,
  updateMissionBase,
  deleteMissionBase,
  moveMissionBase,
  reassignBaseVehicles,
  baseContains,
} from '../lib/planner/mission-bases.ts';
import {
  upsertMission,
  importedFleetConflicts,
  reconcileImportedFleet,
  MAX_SESSION_MISSIONS,
} from '../lib/planner/mission-collection.ts';
import {
  parseMissionDocument,
  canonicalStringify,
} from '../lib/planner/mission-schema.ts';
import { createMissionOperations } from '../lib/planner/mission-operations.ts';
import { projection, distance, inside } from '../lib/planner/geometry.ts';
const fixture = () => installedBatteryDocument(demoMission(1));

void test('library limit rejects only a new card and still allows editing at capacity', () => {
  const first = fixture();
  const documents = Array.from(
    { length: MAX_SESSION_MISSIONS },
    (_, index) => ({ ...first, id: `capacity-${index}` }),
  );
  assert.throws(
    () => upsertMission(documents, { ...first, id: 'over-capacity' }),
    /до 50 миссий/,
  );
  assert.equal(
    upsertMission(documents, { ...documents[0], name: 'Edited at limit' })[0]
      .name,
    'Edited at limit',
  );
  assert.equal(documents[0].name, first.name);
});

void test('five custom imports preserve identity, weather, geometry and neighbouring cards', () => {
  const first = fixture();
  let documents = [
    first,
    { ...first, id: 'demo-b' },
    { ...first, id: 'demo-c' },
  ];
  for (let i = 0; i < 5; i++) {
    const next = structuredClone(first);
    next.id = `custom-${i}`;
    next.scenario.wind.speedMps = 3 + i;
    documents = upsertMission(documents, next);
    assert.equal(documents.at(-1)?.id, next.id);
    assert.equal(documents.at(-1)?.scenario.wind.speedMps, 3 + i);
    assert.equal(
      canonicalStringify(
        parseMissionDocument(JSON.parse(JSON.stringify(next))),
      ),
      canonicalStringify(next),
    );
  }
  assert.equal(documents.length, 8);
  assert.equal(documents[0], first);
  assert.equal(
    upsertMission(documents, { ...documents[4], name: 'Changed' }).length,
    8,
  );
});

void test('conflicting fleet IDs require explicit reconciliation, never alter source weather', () => {
  const known = fixture(),
    source = structuredClone(known);
  source.id = 'external';
  source.scenario.vehicles[0].batteryPct = 55;
  source.batteries[0].initialPct = 55;
  source.scenario.wind.speedMps = 7;
  const before = canonicalStringify(source);
  assert.equal(importedFleetConflicts(source, [known], []).length, 1);
  const reconciled = reconcileImportedFleet(source, [known], []);
  assert.equal(reconciled.scenario.vehicles[0].batteryPct, 100);
  assert.equal(reconciled.scenario.wind.speedMps, 7);
  assert.equal(canonicalStringify(source), before);
});

void test('base creation places multiple UAVs on separate explicit pads without changing battery', () => {
  const d = fixture(),
    before = canonicalStringify(d);
  const next = updateMissionBase(d, {
    id: 'operator-base',
    name: 'Новая база',
    coordinate: [30.303, 60.033],
    vehicleIds: d.scenario.vehicles.map((v) => v.id),
    purpose: 'both',
  });
  parseMissionDocument(next);
  const b = missionBases(next).find((b) => b.id === 'operator-base')!;
  assert.equal(baseVehicleIds(next, b).length, 2);
  assert.equal(b.landingPads?.length, 2);
  const p = projection(b.coordinate);
  assert.ok(
    distance(
      p.forward(next.scenario.vehicles[0].start),
      p.forward(next.scenario.vehicles[1].start),
    ) > d.planning.separationHorizontalM,
  );
  assert.deepEqual(next.batteries, d.batteries);
  assert.equal(canonicalStringify(d), before);
  assert.equal(
    missionBases(next).filter(
      (x) =>
        x.id.startsWith('base-') &&
        b.landingPads?.some((p) => p.coordinate.join() === x.coordinate.join()),
    ).length,
    0,
  );
});

void test('base deletion requires a replacement and preserves independent landing roles', () => {
  const d = fixture(),
    bases = missionBases(d),
    before = canonicalStringify(d);
  assert.throws(() => deleteMissionBase(d, bases[0].id), /другую базу/);
  const next = deleteMissionBase(d, bases[0].id, bases[1].id);
  parseMissionDocument(next);
  assert.ok(!missionBases(next).some((b) => b.id === bases[0].id));
  assert.equal(canonicalStringify(d), before);
  assert.deepEqual(next.batteries, d.batteries);
});

void test('invalid base and missing airspace never become unconstrained flight', () => {
  const d = fixture();
  assert.throws(
    () =>
      updateMissionBase(d, {
        id: 'out',
        name: 'Outside',
        coordinate: [0, 0],
        vehicleIds: [],
        purpose: 'both',
      }),
    /вне границы/,
  );
  d.scenario.airspace.coordinates = [];
  assert.equal(
    inside([30.3, 60.035], [d.scenario.airspace.coordinates]),
    false,
  );
  assert.throws(() => parseMissionDocument(d));
  assert.throws(
    () =>
      updateMissionBase(d, {
        id: 'out',
        name: 'Outside',
        coordinate: [30.3, 60.035],
        vehicleIds: [],
        purpose: 'both',
      }),
    /вне границы/,
  );
});

void test('base rename keeps pad coordinates; imported obstacle buffers block new bases', () => {
  const d = fixture();
  const next = updateMissionBase(d, {
    id: 'shared',
    name: 'Общая',
    coordinate: [30.303, 60.033],
    vehicleIds: d.scenario.vehicles.map((v) => v.id),
    purpose: 'both',
  });
  const renamed = updateMissionBase(next, {
    id: 'shared',
    name: 'Общая 2',
    coordinate: [30.303, 60.033],
    vehicleIds: d.scenario.vehicles.map((v) => v.id),
    purpose: 'both',
  });
  assert.deepEqual(renamed.scenario.vehicles, next.scenario.vehicles);
  d.obstacleLayer = {
    version: 'geoscan-kml-horizontal/1',
    filename: 'test.kml',
    sourceText:
      '<kml><Document><Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>30.3029,60.0329,0 30.3031,60.0329,0 30.3031,60.0331,0 30.3029,60.0331,0 30.3029,60.0329,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>',
    bufferM: 10,
    lineHalfWidthM: 2,
    policySource: 'Synthetic regression fixture',
  };
  assert.throws(
    () =>
      updateMissionBase(d, {
        id: 'bad',
        name: 'В препятствии',
        coordinate: [30.303, 60.033],
        vehicleIds: [],
        purpose: 'both',
      }),
    /внутри ограничения/,
  );
});

void test('fleet batch rejects partial relocation atomically and accepts consistent updates', async () => {
  const at = '2026-09-24T10:00:00Z',
    d = fixture();
  const store = createMissionOperations({
    indexedDB: new IDBFactory(),
    dbName: 'batch',
    demoSession: true,
    now: () => new Date(at),
  });
  const initial = d.scenario.vehicles.map((v) => ({
    expectedRevision: 0,
    state: fleetStateFromDocument(d, v.id, at),
    replacement: false,
  }));
  await store.reportFleetBatch(initial);
  const old = await store.listFleet();
  const bad = old.map((s) => ({
    expectedRevision: s.revision,
    state: { ...structuredClone(s), observedAt: '2026-09-24T10:00:00.001Z' },
    replacement: false,
  }));
  bad[0].state.vehicle.start[0] += 0.001;
  bad[1].expectedRevision = 0;
  await assert.rejects(() => store.reportFleetBatch(bad), /Устаревшее/);
  assert.deepEqual(await store.listFleet(), old);
  bad[1].expectedRevision = old[1].revision;
  const saved = await store.reportFleetBatch(bad);
  assert.equal(saved.length, 2);
  assert.equal(saved[0].battery.initialPct, old[0].battery.initialPct);
  assert.deepEqual(saved[0].vehicle.start, bad[0].state.vehicle.start);
  store.close();
});

void test('map relocation preserves base identity, aircraft assignments, charge and input', () => {
  const d = fixture(),
    original = canonicalStringify(d),
    base = missionBases(d)[0];
  const ids = baseVehicleIds(d, base);
  const moved = moveMissionBase(d, base.id, [30.303, 60.033]);
  parseMissionDocument(moved);
  const after = missionBases(moved).find((b) => b.id === base.id)!;
  assert.deepEqual(after.coordinate, [30.303, 60.033]);
  assert.deepEqual(baseVehicleIds(moved, after), ids);
  assert.deepEqual(moved.batteries, d.batteries);
  assert.deepEqual(
    moved.scenario.vehicles.map((v) => v.batteryPct),
    d.scenario.vehicles.map((v) => v.batteryPct),
  );
  assert.equal(canonicalStringify(d), original);
  assert.ok(
    !missionBases(moved).some(
      (b) => b.id !== base.id && baseContains(base, b.coordinate),
    ),
  );
  const restored = moveMissionBase(moved, base.id, base.coordinate);
  assert.deepEqual(restored.scenario.vehicles, d.scenario.vehicles);
});

void test('deleting source when UAV already lands at destination relocates start, no ghost base', () => {
  const d = fixture(),
    bases = missionBases(d);
  d.scenario.vehicles[0].landing = [...bases[1].coordinate];
  const next = deleteMissionBase(d, bases[0].id, bases[1].id);
  const destination = missionBases(next).find((b) => b.id === bases[1].id)!;
  assert.ok(baseContains(destination, next.scenario.vehicles[0].start));
  assert.ok(baseContains(destination, next.scenario.vehicles[0].landing));
  assert.ok(
    !missionBases(next).some((b) => baseContains(bases[0], b.coordinate)),
  );
  assert.deepEqual(next.batteries, d.batteries);
});

void test('reassignment may empty a base without deleting it or changing battery', () => {
  const d = fixture(),
    bases = missionBases(d),
    ids = baseVehicleIds(d, bases[0]);
  const next = reassignBaseVehicles(d, bases[0].id, bases[1].id, ids);
  const empty = missionBases(next).find((b) => b.id === bases[0].id)!;
  assert.ok(empty);
  assert.equal(baseVehicleIds(next, empty).length, 0);
  assert.deepEqual(next.batteries, d.batteries);
  const deleted = deleteMissionBase(next, empty.id);
  assert.ok(!missionBases(deleted).some((b) => b.id === empty.id));
  assert.deepEqual(deleted.scenario.vehicles, next.scenario.vehicles);
  assert.throws(
    () => reassignBaseVehicles(d, bases[0].id, bases[0].id, ids),
    /другую/,
  );
});

void test('invalid map drag rejects without changing base, fleet or battery', () => {
  const d = fixture(),
    before = canonicalStringify(d),
    id = missionBases(d)[0].id;
  assert.throws(() => moveMissionBase(d, id, [0, 0]), /вне границы/);
  assert.equal(canonicalStringify(d), before);
  assert.throws(
    () => moveMissionBase(d, 'missing', [30.303, 60.033]),
    /не найдена/,
  );
});
