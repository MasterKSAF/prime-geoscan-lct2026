import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { parseMissionDocument, sha256 } from '../lib/planner/mission-schema.ts';
import type { MissionDocument } from '../lib/planner/mission-schema.ts';
import { validateExportedCandidate } from '../lib/planner/mission-validation.ts';
import { createMissionOperations } from '../lib/planner/mission-operations.ts';
import {
  applyFleetState,
  refreshMissionFleetState,
  installedBatteryDocument,
  fleetStateFromDocument,
} from '../lib/planner/mission-fleet-state.ts';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { migrateMissionCameraBindings } from '../lib/planner/camera-profile.ts';

const source = () =>
  SHOWCASE_SCENARIOS.find((s) => s.id === 'repeat-sorties')!.create();
async function snapshot(d: MissionDocument, id: string) {
  const result = await solveMissionDocument(d),
    candidate = result.candidates[0];
  assert.equal(candidate.status, 'feasible_model');
  return {
    id,
    document: result.document,
    candidate,
    approval: {
      inputHash: result.inputHash,
      planHash: await sha256(candidate),
      candidateId: candidate.id,
      approvedAt: '2026-09-20T10:00:00Z',
    },
  };
}
void test('72 percent supports three sorties without any replacement or automatic recharge', async () => {
  const d = source();
  d.batteries[0].initialPct = 72;
  d.scenario.vehicles[0].batteryPct = 72;
  const result = await solveMissionDocument(d);
  for (const c of result.candidates) {
    assert.equal(c.status, 'feasible_model');
    assert.equal(c.sorties.length, 3);
    assert.equal(c.metrics.batteryChanges, 0);
    let pct = 72;
    for (const s of c.sorties) {
      assert.equal(s.segments[0].batteryFromPct, pct);
      assert.ok(s.remainingPct < pct);
      assert.ok(s.remainingPct >= 25);
      pct = s.remainingPct;
    }
    assert.ok(
      c.events.every(
        (e) =>
          !e.detail.includes('Установлена') && !e.detail.includes('зарядки'),
      ),
    );
    const forged = structuredClone(c);
    forged.sorties[1].segments[0].batteryFromPct = 100;
    assert.ok(
      (await validateExportedCandidate(d, forged)).some(
        (v) => v.status === 'fail',
      ),
    );
  }
});
void test('insufficient remainder cannot turn into a future charged battery', async () => {
  const d = source();
  d.batteries[0].initialPct = 40;
  d.scenario.vehicles[0].batteryPct = 40;
  const r = await solveMissionDocument(d);
  assert.notEqual(r.candidates[0].status, 'feasible_model');
  assert.throws(() =>
    parseMissionDocument({
      ...d,
      batteries: [{ ...d.batteries[0], rechargeSec: 60 }],
    }),
  );
  assert.throws(() =>
    parseMissionDocument({
      ...d,
      batteries: [...d.batteries, { ...d.batteries[0], id: 'spare' }],
    }),
  );
});
void test('completed mission transfers SOC, blocks stale launch, and accepts explicit grounded replacement', async () => {
  let now = Date.parse('2026-09-20T10:00:00Z');
  const store = createMissionOperations({
    indexedDB: new IDBFactory(),
    now: () => new Date(now),
  });
  const d = source();
  d.jobs = d.jobs.slice(0, 1);
  d.batteries[0].initialPct = 72;
  d.scenario.vehicles[0].batteryPct = 72;
  const first = await store.enqueue(await snapshot(d, 'first'));
  const running = await store.start(first.id, first.revision);
  now += 1000;
  await store.advance(
    running.id,
    running.revision,
    running.candidate.metrics.makespanSec,
  );
  const fleet = await store.listFleet();
  assert.equal(fleet.length, 1);
  assert.ok(fleet[0].ready);
  assert.ok(fleet[0].battery.initialPct < 72);
  const stale = await store.enqueue(await snapshot(d, 'stale'));
  await assert.rejects(store.start(stale.id, stale.revision), /состояние/);
  await store.cancel(stale.id, stale.revision);
  const fresh = applyFleetState(d, fleet);
  const second = await store.enqueue(await snapshot(fresh, 'second'));
  const next = await store.start(second.id, second.revision);
  now += 1000;
  await store.advance(
    next.id,
    next.revision,
    next.candidate.metrics.makespanSec,
  );
  const old = (await store.listFleet())[0];
  assert.ok(old.battery.initialPct < fleet[0].battery.initialPct);
  now += 1000;
  const state = {
    ...old,
    source: 'operator' as const,
    observedAt: new Date(now).toISOString(),
    operationId: null,
    battery: { ...old.battery, id: 'replacement', initialPct: 100 },
    vehicle: { ...old.vehicle, batteryPct: 100 },
  };
  await assert.rejects(
    store.reportFleet({
      expectedRevision: old.revision,
      replacement: false,
      state,
    }),
    /события замены/,
  );
  const swapped = await store.reportFleet({
    expectedRevision: old.revision,
    replacement: true,
    state,
  });
  assert.equal(swapped.battery.initialPct, 100);
  assert.equal(swapped.replacements.length, 1);
  await assert.rejects(
    store.reportFleet({
      expectedRevision: old.revision,
      replacement: true,
      state,
    }),
    /Устаревшее/,
  );
  const changed = applyFleetState(d, [swapped]);
  changed.batteries[0].initialPct = 99;
  changed.scenario.vehicles[0].batteryPct = 99;
  const invalid = await store.enqueue(await snapshot(changed, 'changed'));
  await assert.rejects(store.start(invalid.id, invalid.revision), /состояние/);
  store.close();
});
void test('cancellation in the air never makes UAV ready or permits replacement', async () => {
  let now = Date.parse('2026-09-20T10:00:00Z');
  const store = createMissionOperations({
    indexedDB: new IDBFactory(),
    now: () => new Date(now),
  });
  const row = await store.enqueue(await snapshot(source(), 'flight'));
  let running = await store.start(row.id, row.revision);
  running = await store.advance(
    running.id,
    running.revision,
    (running.candidate.sorties[0].startSec +
      running.candidate.sorties[0].endSec) /
      2,
  );
  await store.cancel(running.id, running.revision);
  const state = (await store.listFleet())[0];
  assert.equal(state.grounded, false);
  assert.equal(state.ready, false);
  now += 1000;
  await assert.rejects(
    store.reportFleet({
      expectedRevision: state.revision,
      replacement: true,
      state: {
        ...state,
        observedAt: new Date(now).toISOString(),
        source: 'operator',
        ready: true,
        grounded: true,
        operationId: null,
      },
    }),
    /посадку/,
  );
  store.close();
});
void test('fifteen joined UAVs enter one snapshot; temporary unavailability does not stick', async () => {
  const d = source();
  const states = Array.from({ length: 15 }, (_, i) => {
    const s = fleetStateFromDocument(
      d,
      d.scenario.vehicles[0].id,
      '2026-09-20T10:00:00Z',
    );
    const id = i === 0 ? s.id : `joined-${i}`;
    s.id = id;
    s.vehicle.id = id;
    s.battery.vehicleId = id;
    s.battery.id = `current-${i}`;
    return s;
  });
  const joined = applyFleetState(d, states);
  assert.equal(joined.scenario.vehicles.length, 15);
  assert.equal(joined.batteries.length, 15);
  states[0].ready = false;
  const waiting = applyFleetState(joined, states);
  assert.equal(waiting.scenario.vehicles[0].enabled, false);
  states[0].ready = true;
  states[0].revision++;
  assert.equal(
    applyFleetState(waiting, states).scenario.vehicles[0].enabled,
    true,
  );
  states[0].vehicle.enabled = false;
  assert.equal(
    applyFleetState(joined, states).scenario.vehicles[0].enabled,
    false,
  );
});
void test('legacy input remains untouched and migration does not assume spare supply', () => {
  const old = demoMission(1),
    before = JSON.stringify(old);
  const d = installedBatteryDocument(old);
  assert.equal(JSON.stringify(old), before);
  assert.equal(d.batteries.length, d.scenario.vehicles.length);
  assert.ok(d.batteries.every((b) => b.rechargeSec === null));
  assert.equal(parseMissionDocument(old).planning.batteryPolicy, undefined);
});

void test('recalculating an imported mission updates its aircraft without importing other regions', () => {
  const d = source();
  const known = fleetStateFromDocument(
    d,
    d.scenario.vehicles[0].id,
    '2026-09-23T00:00:00Z',
  );
  known.vehicle.batteryPct = known.battery.initialPct = 72;
  known.ready = false;
  const foreign = structuredClone(known);
  foreign.id =
    foreign.vehicle.id =
    foreign.battery.vehicleId =
      'foreign-region';
  foreign.battery.id = 'foreign-current';
  foreign.vehicle.start = foreign.vehicle.landing = [131.9, 43.1];
  const before = JSON.stringify(d);
  const updated = refreshMissionFleetState(d, [known, foreign]);
  assert.equal(updated.scenario.vehicles.length, d.scenario.vehicles.length);
  assert.equal(updated.scenario.vehicles[0].batteryPct, 72);
  assert.equal(updated.scenario.vehicles[0].enabled, false);
  assert.equal(updated.fleetSnapshot?.length, 1);
  assert.ok(!updated.batteries.some((b) => b.vehicleId === foreign.id));
  assert.equal(JSON.stringify(d), before);
  // An explicit fleet-join operation remains available, including new aircraft.
  assert.ok(
    applyFleetState(d, [foreign]).scenario.vehicles.some(
      (v) => v.id === foreign.id,
    ),
  );
});

void test('fractional preparation duration survives the refreshed ISO snapshot and can start', async () => {
  // A new working draft binds its camera before polling, just like the editor.
  // Solving a legacy document after reporting it would change the plan's profile
  // relative to that old report, which must remain a legitimate stale-state error.
  const d = migrateMissionCameraBindings(source()).document;
  d.jobs = d.jobs.slice(0, 1);
  const store = createMissionOperations({
    indexedDB: new IDBFactory(),
    now: () => new Date('2026-09-24T12:00:00.000Z'),
  });
  try {
    const state = fleetStateFromDocument(
      d,
      d.scenario.vehicles[0].id,
      '2026-09-24T12:00:00.000Z',
    );
    state.preparationRemainingSec = 123.456789;
    await store.reportFleet({ expectedRevision: 0, replacement: false, state });
    const fleet = await store.listFleet();
    const fresh = applyFleetState(d, fleet);
    assert.ok(
      Date.parse(fresh.batteries[0].readyAt) >=
        Date.parse(d.window.start) + state.preparationRemainingSec * 1000,
      'Serialization must never round preparation readiness earlier than its model value.',
    );
    const pending = await store.enqueue(
      await snapshot(fresh, 'fractional-ready'),
    );
    // Do not fix the regression by relaxing the start guard: an earlier
    // readiness timestamp must remain an invalid snapshot of the same state.
    const early = structuredClone(fresh);
    early.batteries[0].readyAt = new Date(
      Date.parse(fresh.batteries[0].readyAt) - 1,
    ).toISOString();
    const invalid = await store.enqueue(
      await snapshot(early, 'fractional-too-early'),
    );
    await assert.rejects(
      store.start(invalid.id, invalid.revision),
      /состояние/,
    );
    await store.cancel(invalid.id, invalid.revision);
    const running = await store.start(pending.id, pending.revision);
    assert.equal(running.status, 'running');
  } finally {
    store.close();
  }
});

void test('camera migration is an explicit fleet report before approval, never an archive or readiness rewrite', async () => {
  const legacy = source();
  legacy.jobs = legacy.jobs.slice(0, 1);
  const vehicle = legacy.scenario.vehicles[0];
  delete vehicle.cameraIds;
  delete vehicle.cameraProfiles;
  vehicle.batteryPct = legacy.batteries[0].initialPct = 72;
  const legacyBytes = JSON.stringify(legacy);
  let clock = Date.parse('2026-09-25T00:00:00.000Z');
  const store = createMissionOperations({
    indexedDB: new IDBFactory(),
    now: () => new Date(clock),
  });
  try {
    const unbound = fleetStateFromDocument(
      legacy,
      vehicle.id,
      new Date(clock).toISOString(),
    );
    assert.equal(
      unbound.vehicle.cameraProfiles,
      undefined,
      'Reading an initial report must not silently infer installed hardware.',
    );
    const stored = await store.reportFleet({
      expectedRevision: 0,
      replacement: false,
      state: unbound,
    });
    const oldInput = refreshMissionFleetState(legacy, [stored]);
    const stale = await store.enqueue(
      await snapshot(oldInput, 'camera-before-explicit-report'),
    );
    const archivedBytes = JSON.stringify(await store.exportRaw(stale.id));
    await assert.rejects(
      store.start(stale.id, stale.revision),
      /состояние/,
      'Solver migration alone cannot authorize a profile absent from the reported fleet.',
    );

    const migrated = migrateMissionCameraBindings(legacy).document;
    assert.equal(JSON.stringify(legacy), legacyBytes);
    assert.ok(migrated.scenario.vehicles[0].cameraIds?.length);
    clock += 1000;
    const bound = await store.reportFleet({
      expectedRevision: stored.revision,
      replacement: false,
      state: {
        ...stored,
        observedAt: new Date(clock).toISOString(),
        vehicle: structuredClone(migrated.scenario.vehicles[0]),
        lastEvent:
          'Operator explicitly accepted migration of legacy camera assumptions.',
      },
    });
    assert.equal(bound.battery.initialPct, 72);
    assert.equal(bound.battery.id, stored.battery.id);
    assert.equal(bound.ready, stored.ready);
    assert.equal(bound.grounded, stored.grounded);
    assert.equal(bound.preparationRemainingSec, stored.preparationRemainingSec);
    assert.deepEqual(bound.replacements, []);
    assert.equal(
      JSON.stringify(await store.exportRaw(stale.id)),
      archivedBytes,
      'An explicit fleet update must not rewrite queued mission or approval evidence.',
    );
    await assert.rejects(
      store.start(stale.id, stale.revision),
      /состояние/,
      'The old fleet revision still requires a fresh plan and approval.',
    );
    await store.cancel(stale.id, stale.revision);

    const freshInput = refreshMissionFleetState(migrated, [bound]);
    const fresh = await store.enqueue(
      await snapshot(freshInput, 'camera-after-explicit-report'),
    );
    const freshBytes = JSON.stringify(await store.exportRaw(fresh.id));
    clock += 1000;
    const changedLens = structuredClone(bound);
    changedLens.observedAt = new Date(clock).toISOString();
    changedLens.vehicle.cameraProfiles![0].focalLengthMm! += 1;
    const updated = await store.reportFleet({
      expectedRevision: bound.revision,
      replacement: false,
      state: changedLens,
    });
    await assert.rejects(
      store.start(fresh.id, fresh.revision),
      /состояние/,
      'Changed optics after approval must not bypass full profile comparison.',
    );
    assert.equal(JSON.stringify(await store.exportRaw(fresh.id)), freshBytes);
    await store.cancel(fresh.id, fresh.revision);

    const replanned = refreshMissionFleetState(migrated, [updated]);
    assert.equal(
      replanned.scenario.vehicles[0].cameraProfiles![0].focalLengthMm,
      updated.vehicle.cameraProfiles![0].focalLengthMm,
      'A stale working draft must never overwrite a newer explicitly reported lens.',
    );
    const final = await store.enqueue(
      await snapshot(replanned, 'camera-final-approved'),
    );
    assert.equal(
      (await store.start(final.id, final.revision)).status,
      'running',
    );
    assert.equal(JSON.stringify(legacy), legacyBytes);
  } finally {
    store.close();
  }
});
