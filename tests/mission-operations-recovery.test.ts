import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { sha256 } from '../lib/planner/mission-schema.ts';
import {
  createMissionOperations,
  OPERATIONS_DB,
  OPERATIONS_STORE,
  verifyMissionOperation,
} from '../lib/planner/mission-operations.ts';
import type { MissionOperation } from '../lib/planner/mission-operations.ts';
import { createMissionOperationsController } from '../hooks/use-mission-operations.ts';

const now = '2026-09-20T10:00:00.000Z';
const fixture = (async () => {
  const document = SHOWCASE_SCENARIOS.find(
    (s) => s.id === 'height-obstacle',
  )!.create();
  const result = await solveMissionDocument(document);
  const candidate = result.candidates[0];
  assert.equal(candidate.status, 'feasible_model');
  return {
    document,
    candidate,
    approval: {
      inputHash: result.inputHash,
      planHash: await sha256(candidate),
      candidateId: candidate.id,
      approvedAt: now,
    },
  };
})();

async function put(factory: IDBFactory, value: unknown) {
  await new Promise<void>((resolve, reject) => {
    const opening = factory.open(OPERATIONS_DB, 2);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result,
        tx = db.transaction(OPERATIONS_STORE, 'readwrite');
      tx.objectStore(OPERATIONS_STORE).put(value);
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
async function oldEvent(row: MissionOperation): Promise<MissionOperation> {
  const updated = structuredClone(row);
  updated.candidate.events.at(-1)!.detail =
    'Архивная формулировка события предыдущего выпуска.';
  updated.planHash = await sha256(updated.candidate);
  updated.approval.planHash = updated.planHash;
  const { integrityHash: _old, ...payload } = updated;
  return { ...payload, integrityHash: await sha256(payload) };
}
async function setup() {
  const factory = new IDBFactory();
  const store = createMissionOperations({
    indexedDB: factory,
    now: () => new Date(now),
  });
  const add = async (id: string) =>
    store.enqueue({ id, ...structuredClone(await fixture) });
  return { factory, store, add };
}

void test('one stale completed snapshot is isolated, preserves bytes and never hides healthy rows or reapproves its plan', async () => {
  const { factory, store, add } = await setup();
  let old = await add('old');
  old = await store.start(old.id, old.revision);
  old = await store.advance(
    old.id,
    old.revision,
    old.candidate.metrics.makespanSec,
  );
  const stale = await oldEvent(old);
  await put(factory, stale);
  const good = await add('good');
  const inspected = await store.inspect();
  assert.deepEqual(
    inspected.rows.map((r) => r.id),
    [good.id],
  );
  assert.equal(inspected.rejected.length, 1);
  assert.deepEqual(inspected.rejected[0].checkIds, ['EVENT_JOURNAL']);
  assert.equal(inspected.rejected[0].blocksExecution, false);
  assert.match(
    inspected.rejected[0].reason,
    /журнал событий или состав проверок обновился/,
  );
  assert.deepEqual(await store.exportRaw('old'), stale);
  assert.deepEqual(await store.recoverDocument('old'), stale.document);
  await assert.rejects(
    store.start('old', stale.revision),
    /повторную модельную/,
  );
  await assert.rejects(
    store.enqueue({ id: 'old', ...structuredClone(await fixture) }),
    /ID.*занят/,
  );
  store.close();
});

void test('stale active checkpoint blocks other launches until explicit audited archive, without fake battery or landing updates', async () => {
  const { factory, store, add } = await setup();
  let old = await add('old');
  old = await store.start(old.id, old.revision);
  old = await store.pause(
    old.id,
    old.revision,
    old.candidate.sorties[0].startSec + 1,
  );
  const stale = await oldEvent(old);
  await put(factory, stale);
  const good = await add('good');
  const fleetBefore = await store.listFleet();
  const rejection = (await store.inspect()).rejected[0];
  assert.equal(rejection.blocksExecution, true);
  await assert.rejects(store.start(good.id, good.revision), /явно остановите/);
  await assert.rejects(
    store.archiveRejected('old', '0'.repeat(64)),
    /Снимок изменился/,
  );
  await store.archiveRejected('old', rejection.originalHash!);
  const after = await store.inspect();
  assert.equal(after.rejected[0].archived, true);
  assert.equal(after.rejected[0].blocksExecution, false);
  assert.deepEqual(await store.listFleet(), fleetBefore);
  const saved = (await store.exportRaw('old')) as {
    original: MissionOperation;
    action: string;
  };
  assert.deepEqual(saved.original, stale);
  assert.equal(saved.action, 'operator-confirmed-simulation-stop');
  assert.deepEqual(await store.recoverDocument('old'), stale.document);
  await assert.rejects(verifyMissionOperation(saved));
  await assert.rejects(store.start('old', stale.revision), /явно остановлена/);
  // Occupancy was retired, but unchanged airborne/unready fleet must still block.
  await assert.rejects(
    store.start(good.id, good.revision),
    /парк|готов|состояние/,
  );
  store.close();
});

void test('corrupt hashes are visible but cannot be automatically archived, recovered or released from occupancy', async () => {
  const { factory, store, add } = await setup();
  const row = await add('corrupt');
  await put(factory, { ...row, progressSec: 100 });
  const rejected = (await store.inspect()).rejected[0];
  assert.match(rejected.reason, /целостность/);
  assert.equal(rejected.originalHash, null);
  assert.equal(rejected.blocksExecution, true);
  await assert.rejects(
    store.archiveRejected(row.id, row.integrityHash),
    /целостность/,
  );
  await assert.rejects(store.recoverDocument(row.id), /целостность/);
  assert.equal(
    ((await store.exportRaw(row.id)) as MissionOperation).progressSec,
    100,
  );
  store.close();
});

void test('controller loads healthy records with rejected history instead of a persistent global error; errors are dismissible', async () => {
  const { factory, store, add } = await setup();
  const old = await oldEvent(await add('old'));
  await put(factory, old);
  const good = await add('good');
  const controller = createMissionOperationsController(store, () => {});
  await controller.refresh();
  assert.deepEqual(
    controller.getSnapshot().rows.map((r) => r.id),
    [good.id],
  );
  assert.equal(controller.getSnapshot().rejected.length, 1);
  assert.equal(controller.getSnapshot().error, null);
  await assert.rejects(controller.start('old'), /не загружено/);
  assert.ok(controller.getSnapshot().error);
  controller.dismissError();
  assert.equal(controller.getSnapshot().error, null);
  assert.equal(controller.getSnapshot().rejected.length, 1);
  assert.deepEqual(await controller.exportRaw('old'), old);
  controller.dispose();
});

void test('healthy running rows cannot bypass normal cancellation through the archive endpoint', async () => {
  const { store, add } = await setup();
  let row = await add('healthy');
  row = await store.start(row.id, row.revision);
  await assert.rejects(
    store.archiveRejected(row.id, await sha256(row)),
    /Снимок изменился/,
  );
  assert.deepEqual(await store.get(row.id), row);
  store.close();
});

void test('an altered archive wrapper loses its stop acknowledgement and blocks execution without changing the original payload', async () => {
  const { factory, store, add } = await setup();
  let row = await add('old');
  row = await store.start(row.id, row.revision);
  const stale = await oldEvent(row);
  await put(factory, stale);
  const hash = (await store.inspect()).rejected[0].originalHash!;
  await store.archiveRejected('old', hash);
  const archive = (await store.exportRaw('old')) as Record<string, unknown>;
  await put(factory, { ...archive, archivedAt: '2026-09-21T10:00:00.000Z' });
  const rejected = (await store.inspect()).rejected[0];
  assert.equal(rejected.archived, false);
  assert.equal(rejected.blocksExecution, true);
  assert.equal(rejected.originalHash, null);
  assert.match(rejected.reason, /архивной оболочки/);
  assert.deepEqual(
    ((await store.exportRaw('old')) as { original: unknown }).original,
    stale,
  );
  store.close();
});

void test('a resealed but contradictory terminal status cannot silently release an unverified checkpoint', async () => {
  const { factory, store, add } = await setup();
  const old = await oldEvent(await add('old'));
  const { integrityHash: _old, ...payload } = {
    ...old,
    status: 'completed' as const,
    startedAt: now,
    finishedAt: now,
  };
  await put(factory, { ...payload, integrityHash: await sha256(payload) });
  const rejected = (await store.inspect()).rejected[0];
  assert.equal(rejected.blocksExecution, true);
  assert.equal(rejected.status, 'completed');
  store.close();
});

void test('an integrity-valid earlier engine version can be preserved and explicitly stopped but never resumed', async () => {
  const { factory, store, add } = await setup();
  let row = await add('old-version');
  row = await store.start(row.id, row.revision);
  const { integrityHash: _hash, ...payload } = {
    ...row,
    engineVersion: '0.2.0',
  };
  const old = { ...payload, integrityHash: await sha256(payload) };
  await put(factory, old);
  const rejection = (await store.inspect()).rejected[0];
  assert.equal(rejection.blocksExecution, true);
  assert.ok(rejection.originalHash);
  await assert.rejects(store.start(row.id, row.revision), /текущей версии/);
  await store.archiveRejected(row.id, rejection.originalHash!);
  assert.deepEqual(
    ((await store.exportRaw(row.id)) as { original: unknown }).original,
    old,
  );
  assert.equal((await store.inspect()).rejected[0].archived, true);
  store.close();
});
