import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { sha256 } from '../lib/planner/mission-schema.ts';
import {
  createMissionOperations,
  getOperationStartBlockers,
  OPERATIONS_DB,
  OPERATIONS_STORE,
  verifyMissionOperation,
} from '../lib/planner/mission-operations.ts';
import type {
  EnqueueMissionOperation,
  MissionOperation,
} from '../lib/planner/mission-operations.ts';
import {
  applyFleetState,
  fleetStateFromDocument,
} from '../lib/planner/mission-fleet-state.ts';
import type { FleetState } from '../lib/planner/mission-fleet-state.ts';

const clock = '2026-09-20T10:00:00.000Z';
async function snapshot(
  scenarioId: string,
  legacy = false,
  fleet?: FleetState[],
) {
  let document = SHOWCASE_SCENARIOS.find(
    (scenario) => scenario.id === scenarioId,
  )!.create();
  if (fleet) document = applyFleetState(document, fleet);
  if (legacy) delete document.planning.safetyPolicy;
  const result = await solveMissionDocument(document);
  const candidate = result.candidates[0];
  assert.equal(candidate.status, 'feasible_model');
  return {
    id: scenarioId,
    document: result.document,
    candidate,
    approval: {
      inputHash: result.inputHash,
      planHash: await sha256(candidate),
      candidateId: candidate.id,
      approvedAt: clock,
    },
  } satisfies EnqueueMissionOperation;
}
const fixtures = {
  first: snapshot('height-obstacle'),
  second: snapshot('lidar-geophysics'),
  legacy: snapshot('height-obstacle', true),
};
async function input(name: keyof typeof fixtures, id = name) {
  return { ...structuredClone(await fixtures[name]), id };
}
function store(factory = new IDBFactory()) {
  let time = Date.parse(clock);
  return {
    operations: createMissionOperations({
      indexedDB: factory,
      now: () => new Date(time),
    }),
    tick: () => new Date((time += 1000)).toISOString(),
  };
}
async function overwrite(factory: IDBFactory, row: MissionOperation) {
  const { integrityHash: _hash, ...payload } = row;
  const sealed = { ...payload, integrityHash: await sha256(payload) };
  await new Promise<void>((resolve, reject) => {
    const opening = factory.open(OPERATIONS_DB, 2);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction(OPERATIONS_STORE, 'readwrite');
      transaction.objectStore(OPERATIONS_STORE).put(sealed);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error);
      };
    };
  });
  return sealed;
}
async function unassignedState(id = 'unassigned'): Promise<FleetState> {
  const document = (await fixtures.second).document;
  const state = fleetStateFromDocument(
    document,
    document.scenario.vehicles[0].id,
    clock,
  );
  state.id = id;
  state.vehicle.id = id;
  state.battery.vehicleId = id;
  state.battery.id = `${id}-battery`;
  state.vehicle.start[0] += 0.004;
  state.vehicle.landing = [...state.vehicle.start];
  return state;
}

void test('running and paused missions reserve airspace even for disjoint vehicle IDs; own resume succeeds', async (t) => {
  const { operations } = store();
  t.after(() => operations.close());
  let first = await operations.enqueue(await input('first'));
  const second = await operations.enqueue(await input('second'));
  const firstIds = new Set(first.candidate.sorties.map((s) => s.vehicleId));
  assert.ok(second.candidate.sorties.every((s) => !firstIds.has(s.vehicleId)));
  assert.deepEqual(getOperationStartBlockers(first, [first, second]), []);

  first = await operations.start(first.id, first.revision);
  await assert.rejects(
    operations.start(second.id, second.revision),
    /уже выполняется/,
  );
  first = await operations.pause(
    first.id,
    first.revision,
    first.candidate.sorties[0].startSec + 1,
  );
  const blockers = getOperationStartBlockers(second, [first, second]);
  assert.ok(
    blockers.some(
      (blocker) =>
        blocker.code === 'SIMULATOR_BUSY' && blocker.otherId === first.id,
    ),
  );
  assert.ok(
    blockers.every((blocker) => blocker.code !== 'VEHICLE_TIME_CONFLICT'),
  );
  await assert.rejects(
    operations.start(second.id, second.revision),
    /Пауза сохраняет занятое пространство/,
  );
  assert.deepEqual(getOperationStartBlockers(first, [first, second]), []);
  const resumed = await operations.start(first.id, first.revision);
  assert.equal(resumed.status, 'running');
  assert.equal(resumed.progressSec, first.progressSec);
});

void test('a completed operation releases the cross-operation reservation', async (t) => {
  const { operations } = store();
  t.after(() => operations.close());
  let first = await operations.enqueue(await input('first'));
  const second = await operations.enqueue(await input('second'));
  first = await operations.start(first.id, first.revision);
  first = await operations.advance(
    first.id,
    first.revision,
    first.candidate.metrics.makespanSec,
  );
  assert.equal(first.status, 'completed');
  assert.deepEqual(getOperationStartBlockers(second, [first, second]), []);
});

void test('an archived second paused execution also blocks uncoordinated protective routing', async (t) => {
  const factory = new IDBFactory();
  const { operations } = store(factory);
  t.after(() => operations.close());
  const first = await operations.enqueue(await input('first'));
  const second = await operations.enqueue(await input('second'));
  for (const row of [first, second])
    await overwrite(factory, {
      ...row,
      status: 'paused',
      startedAt: clock,
      progressSec: row.candidate.sorties[0].startSec + 1,
    });
  await assert.rejects(
    operations.safetyChange(first.id, first.revision, {
      type: 'detect',
      id: 'eb784e29-d6c5-47a8-aea8-b008382eb92a',
      kind: 'sensor',
      vehicleId: first.candidate.sorties[0].vehicleId,
      windMps: 0,
      batteryPct: 90,
    }),
    /Другой симулятор/,
  );
});

void test('legacy safety snapshots remain readable but neither start nor resume', async (t) => {
  const factory = new IDBFactory();
  const { operations } = store(factory);
  t.after(() => operations.close());
  const scheduled = await operations.enqueue(await input('legacy'));
  assert.equal(scheduled.document.planning.safetyPolicy, undefined);
  assert.deepEqual(await operations.get(scheduled.id), scheduled);
  await assert.rejects(
    operations.start(scheduled.id, scheduled.revision),
    /откройте задание в редакторе.*пересчитайте/,
  );

  const paused = await overwrite(factory, {
    ...scheduled,
    revision: scheduled.revision + 1,
    status: 'paused',
    startedAt: clock,
    progressSec: scheduled.candidate.sorties[0].startSec + 1,
  });
  assert.deepEqual(await verifyMissionOperation(paused), paused);
  assert.deepEqual(await operations.get(paused.id), paused);
  await assert.rejects(
    operations.start(paused.id, paused.revision),
    /откройте задание в редакторе.*пересчитайте/,
  );
  assert.deepEqual(await operations.get(paused.id), paused);

  const completed = await overwrite(factory, {
    ...paused,
    status: 'completed',
    progressSec: paused.candidate.metrics.makespanSec,
    finishedAt: clock,
  });
  operations.close();
  const reopened = store(factory).operations;
  t.after(() => reopened.close());
  assert.deepEqual(await reopened.list(), [completed]);
});

void test('fleet additions on the ground or in the air are rejected during running and paused operations', async (t) => {
  const { operations, tick } = store();
  t.after(() => operations.close());
  let active = await operations.enqueue(await input('first'));
  active = await operations.start(active.id, active.revision);
  const initialFleet = await operations.listFleet();
  for (const paused of [false, true]) {
    if (paused) active = await operations.pause(active.id, active.revision);
    const before = await operations.listFleet();
    for (const grounded of [true, false]) {
      const state = await unassignedState();
      state.observedAt = tick();
      state.grounded = grounded;
      state.ready = grounded;
      await assert.rejects(
        operations.reportFleet({
          expectedRevision: 0,
          replacement: false,
          state,
        }),
        /нельзя добавлять БВС/,
      );
    }
    assert.deepEqual(await operations.listFleet(), before);
  }
  assert.equal((await operations.listFleet()).length, initialFleet.length);
});

void test('active operations reject unassigned fleet movement and airborne reports but permit stationary SOC updates', async (t) => {
  const { operations, tick } = store();
  t.after(() => operations.close());
  const original = await operations.reportFleet({
    expectedRevision: 0,
    replacement: false,
    state: await unassignedState(),
  });
  let active = await operations.enqueue(
    await snapshot('height-obstacle', false, [original]),
  );
  active = await operations.start(active.id, active.revision);
  active = await operations.pause(active.id, active.revision);

  for (const mutate of [
    (state: FleetState) => {
      state.vehicle.start[0] += 0.0001;
    },
    (state: FleetState) => {
      state.vehicle.landing[0] += 0.0001;
    },
    (state: FleetState) => {
      state.grounded = false;
      state.ready = false;
    },
  ]) {
    const state = structuredClone(original);
    state.observedAt = tick();
    mutate(state);
    await assert.rejects(
      operations.reportFleet({
        expectedRevision: original.revision,
        replacement: false,
        state,
      }),
      /менять точки старта\/посадки или воздушное состояние/,
    );
    assert.deepEqual(
      (await operations.listFleet()).find((s) => s.id === original.id),
      original,
    );
  }
  const state = structuredClone(original);
  state.observedAt = tick();
  state.battery.initialPct -= 1;
  state.vehicle.batteryPct = state.battery.initialPct;
  const updated = await operations.reportFleet({
    expectedRevision: original.revision,
    replacement: false,
    state,
  });
  assert.equal(updated.battery.initialPct, original.battery.initialPct - 1);
  assert.deepEqual(updated.vehicle.start, original.vehicle.start);
  assert.deepEqual(updated.vehicle.landing, original.vehicle.landing);

  active = await operations.start(active.id, active.revision);
  await operations.advance(
    active.id,
    active.revision,
    active.candidate.metrics.makespanSec,
  );
  const moved = structuredClone(updated);
  moved.observedAt = tick();
  moved.vehicle.start[0] += 0.0001;
  assert.deepEqual(
    (
      await operations.reportFleet({
        expectedRevision: updated.revision,
        replacement: false,
        state: moved,
      })
    ).vehicle.start,
    moved.vehicle.start,
  );
});

void test('a fleet addition after planning blocks the stale start until the whole fleet is captured and recalculated', async (t) => {
  const { operations } = store();
  t.after(() => operations.close());
  const stale = await operations.enqueue(await input('first'));
  const added = await operations.reportFleet({
    expectedRevision: 0,
    replacement: false,
    state: await unassignedState(),
  });
  const blockers = getOperationStartBlockers(stale, [stale], [added]);
  assert.ok(
    blockers.some(
      (blocker) => blocker.code === 'STATE' && blocker.vehicleId === added.id,
    ),
  );
  await assert.rejects(
    operations.start(stale.id, stale.revision),
    /расположение всего парка.*пересчитайте/,
  );
  await operations.cancel(stale.id, stale.revision);
  const fresh = await operations.enqueue(
    await snapshot('height-obstacle', false, await operations.listFleet()),
  );
  assert.ok(fresh.document.scenario.vehicles.some((v) => v.id === added.id));
  const stationary = structuredClone(added);
  stationary.revision++;
  stationary.battery.initialPct--;
  stationary.vehicle.batteryPct = stationary.battery.initialPct;
  assert.deepEqual(getOperationStartBlockers(fresh, [fresh], [stationary]), []);
  for (const mutate of [
    (state: FleetState) => {
      state.vehicle.start[0] += 0.0001;
    },
    (state: FleetState) => {
      state.vehicle.landing[0] += 0.0001;
    },
    (state: FleetState) => {
      state.grounded = false;
      state.ready = false;
    },
  ]) {
    const changed = structuredClone(added);
    mutate(changed);
    assert.ok(
      getOperationStartBlockers(fresh, [fresh], [changed]).some(
        (blocker) => blocker.code === 'STATE' && blocker.vehicleId === added.id,
      ),
    );
  }
  assert.equal(
    (await operations.start(fresh.id, fresh.revision)).status,
    'running',
  );
});

void test('a grounded foreign-region aircraft does not block a local demo; local, airborne and assigned states still do', async () => {
  const { operations } = store();
  try {
    const row = await operations.enqueue(await input('first'));
    const local = await unassignedState();
    assert.ok(getOperationStartBlockers(row, [row], [local]).length > 0);
    const distant = structuredClone(local);
    distant.vehicle.start = distant.vehicle.landing = [131.9, 43.1];
    assert.deepEqual(getOperationStartBlockers(row, [row], [distant]), []);
    assert.ok(
      getOperationStartBlockers(
        row,
        [row],
        [{ ...distant, grounded: false, ready: false }],
      ).length > 0,
    );
    assert.ok(
      getOperationStartBlockers(
        row,
        [row],
        [{ ...distant, operationId: 'unknown-flight' }],
      ).length > 0,
    );
    const landingNearby = structuredClone(distant);
    landingNearby.vehicle.landing = local.vehicle.landing;
    assert.ok(
      getOperationStartBlockers(row, [row], [landingNearby]).length > 0,
    );
  } finally {
    operations.close();
  }
});
