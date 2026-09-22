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
  installedBatteryDocument,
  fleetStateFromDocument,
} from '../lib/planner/mission-fleet-state.ts';
import { demoMission } from '../lib/planner/mission-demo.ts';

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
test('72 percent supports three sorties without any replacement or automatic recharge', async () => {
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
test('insufficient remainder cannot turn into a future charged battery', async () => {
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
test('completed mission transfers SOC, blocks stale launch, and accepts explicit grounded replacement', async () => {
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
test('cancellation in the air never makes UAV ready or permits replacement', async () => {
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
test('fifteen joined UAVs enter one snapshot; temporary unavailability does not stick', async () => {
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
test('legacy input remains untouched and migration does not assume spare supply', () => {
  const old = demoMission(1),
    before = JSON.stringify(old);
  const d = installedBatteryDocument(old);
  assert.equal(JSON.stringify(old), before);
  assert.equal(d.batteries.length, d.scenario.vehicles.length);
  assert.ok(d.batteries.every((b) => b.rechargeSec === null));
  assert.equal(parseMissionDocument(old).planning.batteryPolicy, undefined);
});
