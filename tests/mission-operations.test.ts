import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { sha256 } from '../lib/planner/mission-schema.ts';
import type {
  MissionOperation,
  EnqueueMissionOperation,
} from '../lib/planner/mission-operations.ts';
import {
  createMissionOperations,
  verifyMissionOperation,
  deriveOperationVehicleStates,
  getOperationStartBlockers,
  MAX_MISSION_OPERATIONS,
  MAX_OPERATION_BYTES,
  OPERATIONS_DB,
  OPERATIONS_STORE,
} from '../lib/planner/mission-operations.ts';

const clock = '2026-09-19T12:00:00.000Z';
async function makeSnapshot(
  scenarioId = 'height-obstacle',
  delayedBatteries = false,
): Promise<EnqueueMissionOperation> {
  const document = SHOWCASE_SCENARIOS.find(
    (s) => s.id === scenarioId,
  )!.create();
  if (delayedBatteries)
    for (const battery of document.batteries)
      battery.readyAt = new Date(
        Date.parse(document.window.start) +
          (battery.vehicleId === 'rgb-fast'
            ? 600
            : battery.vehicleId === 'rgb-center'
              ? 300
              : 0) *
            1000,
      ).toISOString();
  const result = await solveMissionDocument(document),
    candidate = result.candidates[0];
  assert.equal(candidate.status, 'feasible_model');
  return {
    id: 'run-1',
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
const fixture = makeSnapshot();
const input = async (id = 'run-1') => ({
  ...structuredClone(await fixture),
  id,
});
function store(factory = new IDBFactory()) {
  return createMissionOperations({
    indexedDB: factory,
    now: () => new Date(clock),
  });
}
async function reseal(row: MissionOperation) {
  const { integrityHash: _hash, ...payload } = row;
  return { ...payload, integrityHash: await sha256(payload) };
}
async function overwrite(factory: IDBFactory, row: MissionOperation) {
  await new Promise<void>((resolve, reject) => {
    const opening = factory.open(OPERATIONS_DB, 2);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result,
        tx = db.transaction(OPERATIONS_STORE, 'readwrite');
      tx.objectStore(OPERATIONS_STORE).put(row);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

void test('enqueue clones approved snapshot and persists independently without mission-library migration', async () => {
  const factory = new IDBFactory(),
    first = store(factory),
    original = await input();
  const row = await first.enqueue(original);
  original.document.name = 'Mutated outside';
  assert.equal(row.status, 'scheduled');
  assert.equal(row.progressSec, 0);
  assert.equal(row.engineVersion, '0.3.0');
  assert.equal(row.createdAt, clock);
  assert.equal(row.startedAt, null);
  assert.notEqual(
    (await first.get(row.id))!.document.name,
    original.document.name,
  );
  first.close();
  const second = store(factory);
  assert.deepEqual(await second.get(row.id), row);
  assert.equal(await second.get('absent'), null);
  assert.deepEqual(
    (await factory.databases()).map((d) => d.name),
    [OPERATIONS_DB],
  );
  second.close();
});

void test('unapproved, partial, wrong hash and altered candidate fail before any write', async () => {
  const lib = store();
  for (const mutate of [
    (s: EnqueueMissionOperation) => {
      s.approval.planHash = '0'.repeat(64);
    },
    (s: EnqueueMissionOperation) => {
      s.approval.candidateId = 'other';
    },
    (s: EnqueueMissionOperation) => {
      s.candidate.status = 'partial';
    },
    (s: EnqueueMissionOperation) => {
      s.candidate.metrics.flightTimeSec += 100;
    },
    (s: EnqueueMissionOperation) => {
      s.document.scenario.wind.speedMps = 25;
    },
    (s: EnqueueMissionOperation) => {
      s.approval.approvedAt = 'not a date';
    },
  ]) {
    const snapshot = await input();
    mutate(snapshot);
    await assert.rejects(lib.enqueue(snapshot));
  }
  assert.equal((await lib.list()).length, 0);
  lib.close();
});

void test('rehashed approval cannot promote a physically invalid plan', async () => {
  const lib = store(),
    snapshot = await input();
  snapshot.candidate.sorties[0].remainingPct = 99;
  snapshot.approval.planHash = await sha256(snapshot.candidate);
  await assert.rejects(lib.enqueue(snapshot), /повторную модельную проверку/);
  assert.equal((await lib.list()).length, 0);
  lib.close();
});

void test('explicit start, monotonic advance, pause, resume and exact completion', async () => {
  const lib = store();
  let row = await lib.enqueue(await input());
  await assert.rejects(lib.advance(row.id, row.revision, 10), /running/);
  row = await lib.start(row.id, row.revision);
  assert.equal(row.status, 'running');
  row = await lib.advance(row.id, row.revision, 30);
  assert.equal(row.progressSec, 30);
  for (const t of [
    -1,
    29,
    NaN,
    Infinity,
    row.candidate.metrics.makespanSec + 1,
  ])
    await assert.rejects(lib.advance(row.id, row.revision, t), /монотонно/);
  row = await lib.pause(row.id, row.revision, 40);
  assert.equal(row.status, 'paused');
  await assert.rejects(lib.advance(row.id, row.revision, 41), /running/);
  row = await lib.start(row.id, row.revision);
  assert.equal(row.progressSec, 40);
  row = await lib.advance(
    row.id,
    row.revision,
    row.candidate.metrics.makespanSec,
  );
  assert.equal(row.status, 'completed');
  assert.equal(row.finishedAt, clock);
  for (const action of [lib.start, lib.pause, lib.cancel])
    await assert.rejects(action(row.id, row.revision), /неизменна/);
  lib.close();
});

void test('reload and real elapsed time never advance, auto-start or hide a running checkpoint', async () => {
  const factory = new IDBFactory(),
    first = store(factory);
  let row = await first.enqueue(await input());
  row = await first.start(row.id, row.revision);
  row = await first.advance(row.id, row.revision, 10);
  first.close();
  const reopened = createMissionOperations({
    indexedDB: factory,
    now: () => new Date('2027-01-01T00:00:00Z'),
  });
  assert.deepEqual(await reopened.get(row.id), row);
  await assert.rejects(reopened.start(row.id, row.revision), /очереди|паузы/);
  row = await reopened.pause(row.id, row.revision);
  assert.equal(row.progressSec, 10);
  row = await reopened.start(row.id, row.revision);
  assert.equal(row.progressSec, 10);
  reopened.close();
});

void test('cancel retains record, completed/cancelled do not silently disappear', async () => {
  const lib = store();
  let row = await lib.enqueue(await input());
  row = await lib.cancel(row.id, row.revision);
  assert.equal(row.status, 'cancelled');
  assert.equal(row.startedAt, null);
  assert.equal((await lib.list()).length, 1);
  assert.equal((await lib.get(row.id))!.finishedAt, clock);
  await assert.rejects(lib.enqueue(await input()), /ID.*занят/);
  lib.close();
});

void test('shared vehicle/time conflict can queue but blocks start until explicit cancellation', async () => {
  const lib = store(),
    first = await lib.enqueue(await input('first')),
    second = await lib.enqueue(await input('second'));
  assert.ok(
    getOperationStartBlockers(first, [first, second]).some(
      (b) => b.code === 'VEHICLE_TIME_CONFLICT',
    ),
  );
  await assert.rejects(lib.start(first.id, first.revision), /пересечение/);
  await lib.cancel(second.id, second.revision);
  assert.equal((await lib.start(first.id, first.revision)).status, 'running');
  lib.close();
});

void test('non-overlapping time windows remain serial even with no vehicle/time conflict', async () => {
  const lib = store(),
    one = await lib.enqueue(await input('one'));
  const snapshot = await input('two');
  snapshot.document.window.start = '2026-06-16T09:00:00Z';
  snapshot.document.window.end = '2026-06-16T15:00:00Z';
  const result = await solveMissionDocument(snapshot.document);
  snapshot.candidate = result.candidates[0];
  snapshot.approval.inputHash = result.inputHash;
  snapshot.approval.planHash = await sha256(snapshot.candidate);
  const two = await lib.enqueue(snapshot);
  assert.deepEqual(getOperationStartBlockers(one, [one, two]), []);
  const running = await lib.start(one.id, one.revision);
  await assert.rejects(lib.start(two.id, two.revision), /уже выполняется/);
  await lib.pause(one.id, running.revision);
  await assert.rejects(
    lib.start(two.id, two.revision),
    /состояние|пересечение/,
  );
  lib.close();
});

void test('optimistic revision rejects stale writes and concurrent starts atomically', async () => {
  const factory = new IDBFactory(),
    a = store(factory),
    b = store(factory);
  const row = await a.enqueue(await input());
  const results = await Promise.allSettled([
    a.start(row.id, row.revision),
    b.start(row.id, row.revision),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const saved = (await a.get(row.id))!;
  assert.equal(saved.revision, 2);
  await assert.rejects(b.pause(row.id, row.revision), /Ревизия/);
  a.close();
  b.close();
});

void test('concurrent starts of different non-conflicting fleets still acquire only one simulator', async () => {
  const factory = new IDBFactory(),
    a = store(factory),
    b = store(factory);
  const one = await a.enqueue(await input('one'));
  const different = await makeSnapshot('lidar-geophysics');
  different.id = 'two';
  const two = await b.enqueue(different);
  assert.deepEqual(getOperationStartBlockers(one, [one, two]), []);
  const outcomes = await Promise.allSettled([
    a.start(one.id, one.revision),
    b.start(two.id, two.revision),
  ]);
  assert.equal(
    outcomes.filter((outcome) => outcome.status === 'fulfilled').length,
    1,
  );
  assert.equal(
    (await a.list()).filter((row) => row.status === 'running').length,
    1,
  );
  a.close();
  b.close();
});

void test('corrupt stored progress/snapshot and state contradictions fail closed on read', async () => {
  const factory = new IDBFactory(),
    lib = store(factory),
    row = await lib.enqueue(await input());
  await overwrite(factory, { ...row, progressSec: 5 });
  await assert.rejects(lib.list(), /целостность/);
  await overwrite(factory, await reseal({ ...row, progressSec: 5 }));
  await assert.rejects(lib.get(row.id), /противоречат/);
  const altered = structuredClone(row);
  altered.candidate.metrics.makespanSec += 50;
  altered.planHash = await sha256(altered.candidate);
  altered.approval.planHash = altered.planHash;
  await overwrite(factory, await reseal(altered));
  await assert.rejects(lib.start(row.id, row.revision), /повторную модельную/);
  lib.close();
});

void test('revision overflow rejects before write and record cap never evicts', async () => {
  const factory = new IDBFactory(),
    lib = store(factory),
    row = await lib.enqueue(await input());
  await overwrite(
    factory,
    await reseal({ ...row, revision: Number.MAX_SAFE_INTEGER }),
  );
  await assert.rejects(
    lib.start(row.id, Number.MAX_SAFE_INTEGER),
    /Предел ревизий/,
  );
  assert.equal((await lib.get(row.id))!.revision, Number.MAX_SAFE_INTEGER);
  for (let i = 1; i < MAX_MISSION_OPERATIONS; i++)
    await lib.enqueue(await input(`run-${i + 1}`));
  await assert.rejects(lib.enqueue(await input('overflow')), /Лимит журнала/);
  assert.equal((await lib.list()).length, MAX_MISSION_OPERATIONS);
  lib.close();
});

void test('record size and unavailable storage fail without fallback or deletion', async () => {
  const lib = store(),
    snapshot = await input();
  snapshot.candidate.assumptions.push('x'.repeat(MAX_OPERATION_BYTES));
  await assert.rejects(lib.enqueue(snapshot), /5 МиБ/);
  assert.equal((await lib.list()).length, 0);
  lib.close();
  const denied = createMissionOperations({
    indexedDB: {
      open() {
        throw new DOMException('denied', 'SecurityError');
      },
    } as unknown as IDBFactory,
  });
  await assert.rejects(denied.list(), /недоступно/);
  denied.close();
});

void test('vehicle view derives waiting battery, in-flight phase, service and terminal readiness from model time only', async () => {
  const lib = store(),
    row = await lib.enqueue(await makeSnapshot('automatic-tradeoff', true));
  let states = deriveOperationVehicleStates(row);
  assert.equal(
    states.find((v) => v.vehicleId === 'rgb-center')!.status,
    'preparing',
  );
  assert.ok(
    states
      .find((v) => v.vehicleId === 'rgb-fast')!
      .batteries.every((b) => b.status === 'waiting' && b.readyAtSec === 600),
  );
  const first = row.candidate.sorties.find((s) => s.vehicleId === 'rgb-near')!;
  states = deriveOperationVehicleStates({
    ...row,
    progressSec: first.startSec + 1,
    status: 'paused',
  });
  const flying = states.find((v) => v.vehicleId === first.vehicleId)!;
  assert.equal(flying.status, 'in_flight');
  assert.equal(flying.phase, 'takeoff');
  assert.ok(flying.readyAtSec! >= first.readySec);
  assert.equal(
    flying.batteries.find((b) => b.batteryId === first.batteryId)!.status,
    'in_use',
  );
  states = deriveOperationVehicleStates({
    ...row,
    progressSec: first.endSec,
    status: 'running',
  });
  assert.equal(
    states.find((v) => v.vehicleId === first.vehicleId)!.status,
    'servicing',
  );
  states = deriveOperationVehicleStates({
    ...row,
    progressSec: first.readySec,
    status: 'running',
  });
  assert.equal(
    states.find((v) => v.vehicleId === first.vehicleId)!.status,
    'ready',
  );
  assert.equal(
    deriveOperationVehicleStates({ ...row, status: 'cancelled' }).find(
      (v) => v.vehicleId === first.vehicleId,
    )!.status,
    'unavailable',
  );
  lib.close();
});

void test('battery recharge is sequential and percentage is not fabricated linearly', async () => {
  const snapshot = await makeSnapshot('repeat-sorties');
  // Archived charging policy remains readable/verifiable, but cannot start anew.
  delete snapshot.document.planning.batteryPolicy;
  snapshot.document.batteries.forEach((b) => {
    b.rechargeSec = 600;
  });
  const result = await solveMissionDocument(snapshot.document);
  snapshot.candidate = result.candidates[0];
  snapshot.approval.inputHash = result.inputHash;
  snapshot.approval.planHash = await sha256(snapshot.candidate);
  const lib = store(),
    row = await lib.enqueue(snapshot),
    first = row.candidate.sorties[0];
  const at = (t: number) =>
    deriveOperationVehicleStates({ ...row, progressSec: t })
      .find((v) => v.vehicleId === first.vehicleId)!
      .batteries.find((b) => b.batteryId === first.batteryId)!;
  const charging = at(first.endSec + 1);
  assert.equal(charging.status, 'charging');
  assert.equal(charging.pct, first.remainingPct);
  assert.equal(charging.readyAtSec, first.endSec + 600);
  const full = at(first.endSec + 600);
  // If the selected plan immediately reuses it, the exact start is already in_use.
  assert.ok(full.status === 'ready' || full.status === 'in_use');
  assert.ok(full.pct <= 100);
  lib.close();
});

void test('strict record metadata rejects extra telemetry and forged terminal time even after reseal', async () => {
  const lib = store(),
    row = await lib.enqueue(await input());
  await assert.rejects(verifyMissionOperation({ ...row, telemetryLive: true }));
  await assert.rejects(
    verifyMissionOperation(
      await reseal({
        ...row,
        status: 'completed',
        startedAt: clock,
        finishedAt: clock,
      }),
    ),
    /противоречат/,
  );
  lib.close();
});
