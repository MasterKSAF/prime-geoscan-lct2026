import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMissionOperationsController } from '../hooks/use-mission-operations.ts';
import type {
  MissionOperation,
  MissionOperations,
  MissionOperationsInspection,
} from '../lib/planner/mission-operations.ts';

// These fixtures test command coordination, not flight validity. Store integrity,
// transitions and model verification are exercised by the store's own tests.
function fakeStore() {
  let row = {
    id: 'op-1',
    revision: 1,
    status: 'running',
    progressSec: 0,
    createdAt: '2026-09-19T10:00:00.000Z',
    candidate: { metrics: { makespanSec: 100 } },
  } as MissionOperation;
  let closed = false;
  let blockAdvance: Promise<void> | undefined;
  let externalAfterWrite = false;
  let injectExternal = false;
  let failNextList = false;
  const calls: { action: string; revision: number; progress?: number }[] = [];
  const change = async (
    action: string,
    revision: number,
    progress?: number,
  ) => {
    if (action === 'advance' && blockAdvance) await blockAdvance;
    calls.push({ action, revision, progress });
    if (revision !== row.revision)
      throw new Error('Ревизия выполнения изменилась. Обновите список.');
    if (action === 'pause' || action === 'advance') {
      if (row.status !== 'running') throw new Error('Не running.');
      if (progress !== undefined && progress < row.progressSec)
        throw new Error('Время уменьшилось.');
    }
    row = {
      ...row,
      revision: row.revision + 1,
      progressSec: progress ?? row.progressSec,
      status:
        action === 'cancel'
          ? 'cancelled'
          : progress === 100
            ? 'completed'
            : action === 'pause'
              ? 'paused'
              : 'running',
    };
    if (externalAfterWrite) injectExternal = true;
    return structuredClone(row);
  };
  const store = {
    inspect: async (): Promise<MissionOperationsInspection> => ({
      rows: await store.list(),
      rejected: [],
    }),
    exportRaw: async () => structuredClone(row),
    recoverDocument: async () => {
      throw new Error('Recovery tested separately.');
    },
    archiveRejected: async () => {
      throw new Error('Recovery tested separately.');
    },
    listFleet: async () => [],
    reportFleet: async () => {
      throw new Error('Fleet tested separately.');
    },
    reportFleetBatch: async () => {
      throw new Error('Fleet batches tested separately.');
    },
    list: async () => {
      if (failNextList) {
        failNextList = false;
        throw new Error('Чтение временно недоступно.');
      }
      if (injectExternal) {
        injectExternal = false;
        row = { ...row, revision: row.revision + 1, progressSec: 45 };
      }
      return [structuredClone(row)];
    },
    get: async () => structuredClone(row),
    enqueue: async () => structuredClone(row),
    removeDemo: async () => {
      throw new Error('Demo deletion tested separately.');
    },
    safetyChange: async () => {
      throw new Error('Safety is tested by its own store tests.');
    },
    start: (_id: string, revision: number) => change('start', revision),
    pause: (_id: string, revision: number, progress?: number) =>
      change('pause', revision, progress),
    advance: (_id: string, revision: number, progress: number) =>
      change('advance', revision, progress),
    cancel: (_id: string, revision: number) => change('cancel', revision),
    close: () => {
      closed = true;
    },
  } satisfies MissionOperations;
  return {
    store,
    calls,
    closed: () => closed,
    block: (promise: Promise<void>) => {
      blockAdvance = promise;
    },
    externalAfterWrite: () => {
      externalAfterWrite = true;
    },
    failRead: () => {
      failNextList = true;
    },
  };
}

void test('queued pause follows this controller checkpoint revision, not a stale React closure', async () => {
  const fake = fakeStore();
  let release = () => {};
  fake.block(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  const controller = createMissionOperationsController(
    fake.store,
    () => {},
    () => 0,
  );
  await controller.refresh();
  const checkpoint = controller.checkpoint('op-1', 20);
  const paused = controller.pause('op-1', 25);
  assert.equal(controller.getSnapshot().busy, true);
  release();
  assert.equal((await checkpoint)?.revision, 2);
  assert.equal((await paused).revision, 3);
  assert.deepEqual(
    fake.calls.map((call) => [call.action, call.revision]),
    [
      ['advance', 1],
      ['pause', 2],
    ],
  );
  assert.equal(controller.get('op-1')?.progressSec, 25);
  assert.equal(controller.getSnapshot().busy, false);
});

void test('reading a foreign revision never rebases or retries an already queued command', async () => {
  const fake = fakeStore();
  fake.externalAfterWrite();
  const controller = createMissionOperationsController(
    fake.store,
    () => {},
    () => 0,
  );
  await controller.refresh();
  const checkpoint = controller.checkpoint('op-1', 20);
  const paused = controller.pause('op-1', 50);
  await checkpoint;
  await assert.rejects(paused, /Ревизия/);
  assert.equal(controller.get('op-1')?.revision, 3);
  assert.equal(fake.calls.filter((call) => call.action === 'pause').length, 1);
  assert.equal(fake.calls.at(-1)?.revision, 2);
  assert.match(controller.getSnapshot().error ?? '', /Ревизия/);
});

void test('checkpoints throttle writes for two seconds while pause always flushes exact time', async () => {
  const fake = fakeStore();
  let now = 0;
  const controller = createMissionOperationsController(
    fake.store,
    () => {},
    () => now,
  );
  await controller.refresh();
  await controller.checkpoint('op-1', 5);
  now = 1_999;
  assert.equal(await controller.checkpoint('op-1', 10), null);
  now = 2_000;
  await controller.checkpoint('op-1', 20);
  const paused = await controller.pause('op-1', 21);
  assert.equal(paused.progressSec, 21);
  assert.equal(paused.status, 'paused');
  assert.deepEqual(
    fake.calls.map((call) => call.action),
    ['advance', 'advance', 'pause'],
  );
});

void test('terminal checkpoint flushes once behind a periodic write and queued pause does not rewrite completion', async () => {
  const fake = fakeStore();
  let release = () => {};
  fake.block(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  const controller = createMissionOperationsController(
    fake.store,
    () => {},
    () => 0,
  );
  await controller.refresh();
  const first = controller.checkpoint('op-1', 20);
  assert.equal(await controller.checkpoint('op-1', 25), null);
  const terminal = controller.checkpoint('op-1', 100);
  const repeated = controller.checkpoint('op-1', 100);
  const pause = controller.pause('op-1', 100);
  assert.equal(terminal, repeated);
  release();
  await first;
  assert.equal((await terminal)?.status, 'completed');
  assert.equal((await pause).status, 'completed');
  assert.equal(fake.calls.length, 2);
});

void test('failed command rejects with visible error, and the serial queue remains usable', async () => {
  const fake = fakeStore();
  const controller = createMissionOperationsController(fake.store, () => {});
  fake.failRead();
  await assert.rejects(controller.refresh(), /Чтение/);
  assert.match(controller.getSnapshot().error ?? '', /Чтение/);
  assert.equal(controller.getSnapshot().loading, false);
  assert.equal(controller.getSnapshot().busy, false);
  await controller.refresh();
  assert.equal(controller.getSnapshot().error, null);
  await assert.rejects(controller.checkpoint('op-1', -1), /монотонное/);
  assert.match(controller.getSnapshot().error ?? '', /монотонное/);
});

void test('unmount detaches notifications but drains an explicit cleanup pause before closing store', async () => {
  const fake = fakeStore();
  let notifications = 0;
  const controller = createMissionOperationsController(fake.store, () => {
    notifications += 1;
  });
  await controller.refresh();
  const beforeDispose = notifications;
  controller.dispose();
  const pause = controller.pause('op-1', 9);
  await pause;
  await Promise.resolve();
  assert.equal(notifications, beforeDispose);
  assert.equal(fake.closed(), true);
  await assert.rejects(controller.start('op-1'), /закрыт/);
  assert.equal(fake.calls.length, 1);
});

void test('post-commit read failure is explicit and keeps the confirmed saved row visible', async () => {
  const fake = fakeStore();
  const controller = createMissionOperationsController(fake.store, () => {});
  await controller.refresh();
  fake.failRead();
  await assert.rejects(
    controller.checkpoint('op-1', 20),
    /Изменение сохранено.*список/,
  );
  assert.equal(controller.get('op-1')?.revision, 2);
  assert.equal(controller.get('op-1')?.progressSec, 20);
  assert.match(controller.getSnapshot().error ?? '', /Изменение сохранено/);
  assert.equal(fake.calls.length, 1);
  await controller.refresh();
  assert.equal(controller.getSnapshot().error, null);
});
