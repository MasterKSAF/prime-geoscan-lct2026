'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createMissionOperations } from '../lib/planner/mission-operations.ts';
import type {
  EnqueueMissionOperation,
  MissionOperation,
  MissionOperations,
  RejectedMissionOperation,
} from '../lib/planner/mission-operations.ts';
import type {
  FleetState,
  FleetReport,
} from '../lib/planner/mission-fleet-state.ts';

export const MISSION_CHECKPOINT_INTERVAL_MS = 2_000;

export type MissionOperationsSnapshot = {
  rows: MissionOperation[];
  rejected: RejectedMissionOperation[];
  fleet: FleetState[];
  loading: boolean;
  busy: boolean;
  error: string | null;
};

type RevisionIntent = {
  id: string;
  revision: number;
  initialStatus: MissionOperation['status'];
};
const initialSnapshot = (): MissionOperationsSnapshot => ({
  rows: [],
  rejected: [],
  fleet: [],
  loading: true,
  busy: false,
  error: null,
});
const asError = (value: unknown) =>
  value instanceof Error ? value : new Error('Ошибка журнала выполнений.');

/** Command coordinator is exported for isolated concurrency tests; not a second
 * store. Only successful writes by THIS coordinator can advance a queued intent's
 * expected revision. A fresh list from another tab never authorizes an old command.
 */
export function createMissionOperationsController(
  store: MissionOperations,
  notify: (snapshot: MissionOperationsSnapshot) => void,
  clock: () => number = () => performance.now(),
) {
  let snapshot = initialSnapshot();
  // Latest verified rows, independent of React's asynchronous rendering cycle.
  const rowsRef: { current: MissionOperation[] } = { current: [] };
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;
  let pendingRefreshes = 0;
  let listening = true;
  let accepting = true;
  let disposalRequested = false;
  const intents = new Set<RevisionIntent>();
  const lastCheckpoint = new Map<string, number>();
  const checkpointPending = new Map<
    string,
    { progressSec: number; promise: Promise<MissionOperation | null> }
  >();

  const emit = (patch: Partial<MissionOperationsSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    if (listening) notify(snapshot);
  };
  const replaceRows = (rows: MissionOperation[]) => {
    rowsRef.current = rows;
    emit({ rows });
  };
  const report = (value: unknown): Error => {
    const error = asError(value);
    emit({ error: error.message });
    return error;
  };
  const get = (id: string): MissionOperation | null =>
    rowsRef.current.find((row) => row.id === id) ?? null;
  const schedule = <T>(work: () => Promise<T>): Promise<T> => {
    if (!accepting)
      return Promise.reject(
        report(new Error('Журнал уже закрыт. Откройте планировщик заново.')),
      );
    pending += 1;
    emit({ busy: true });
    const result = tail.then(async () => {
      try {
        return await work();
      } catch (error) {
        throw report(error);
      } finally {
        pending -= 1;
        emit({ busy: pending > 0 });
      }
    });
    // A rejected command must reject to its caller without poisoning later commands.
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  async function afterWrite(
    saved: MissionOperation,
    expectedRevision?: number,
  ) {
    if (expectedRevision !== undefined) {
      for (const intent of intents) {
        if (intent.id === saved.id && intent.revision === expectedRevision)
          intent.revision = saved.revision;
      }
    }
    // Keep the confirmed local commit visible even if its subsequent read fails.
    replaceRows(
      [...rowsRef.current.filter((row) => row.id !== saved.id), saved].sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
      ),
    );
    lastCheckpoint.set(saved.id, clock());
    try {
      const inspected = await store.inspect();
      replaceRows(inspected.rows);
      emit({ rejected: inspected.rejected });
      emit({ fleet: await store.listFleet() });
    } catch (error) {
      throw new Error(
        `Изменение сохранено, но список не удалось перечитать: ${asError(error).message}`,
      );
    }
    return saved;
  }

  function refresh(): Promise<MissionOperation[]> {
    if (!accepting)
      return Promise.reject(
        report(new Error('Журнал уже закрыт. Откройте планировщик заново.')),
      );
    pendingRefreshes += 1;
    emit({ error: null, loading: true });
    return schedule(async () => {
      try {
        const { rows, rejected } = await store.inspect();
        emit({ fleet: await store.listFleet() });
        replaceRows(rows);
        emit({ rejected });
        return rows;
      } finally {
        pendingRefreshes -= 1;
        emit({ loading: pendingRefreshes > 0 });
      }
    });
  }

  function enqueue(input: EnqueueMissionOperation): Promise<MissionOperation> {
    emit({ error: null });
    let submitted: EnqueueMissionOperation;
    try {
      // Bind the user's request now, not after earlier commands finish.
      submitted = structuredClone(input);
    } catch (error) {
      return Promise.reject(report(error));
    }
    return schedule(async () => afterWrite(await store.enqueue(submitted)));
  }

  function mutate(
    action: 'start' | 'pause' | 'advance' | 'cancel',
    id: string,
    progressSec?: number,
  ): Promise<MissionOperation> {
    if (action !== 'advance') emit({ error: null });
    const row = get(id);
    if (!row)
      return Promise.reject(
        report(
          new Error(
            'Выполнение не загружено. Обновите журнал и повторите действие.',
          ),
        ),
      );
    const intent: RevisionIntent = {
      id,
      revision: row.revision,
      initialStatus: row.status,
    };
    intents.add(intent);
    return schedule(async () => {
      const expectedRevision = intent.revision;
      const latest = get(id);
      // Pause clicked during our terminal checkpoint: completion already stopped
      // the same model. Do not attempt to rewrite its immutable completed record.
      if (
        action === 'pause' &&
        intent.initialStatus === 'running' &&
        latest?.status === 'completed' &&
        latest.revision === expectedRevision &&
        (progressSec === undefined || progressSec <= latest.progressSec)
      ) {
        return latest;
      }
      const saved =
        action === 'start'
          ? await store.start(id, expectedRevision)
          : action === 'pause'
            ? await store.pause(id, expectedRevision, progressSec)
            : action === 'cancel'
              ? await store.cancel(id, expectedRevision)
              : await store.advance(id, expectedRevision, progressSec!);
      return afterWrite(saved, expectedRevision);
    }).finally(() => intents.delete(intent));
  }

  function checkpoint(
    id: string,
    progressSec: number,
  ): Promise<MissionOperation | null> {
    const row = get(id);
    if (!row)
      return Promise.reject(
        report(new Error('Выполнение для контрольной точки не загружено.')),
      );
    if (
      !Number.isFinite(progressSec) ||
      progressSec < row.progressSec ||
      progressSec > row.candidate.metrics.makespanSec
    ) {
      return Promise.reject(
        report(
          new Error(
            'Контрольная точка должна сохранять монотонное время в пределах миссии.',
          ),
        ),
      );
    }
    if (row.status === 'completed' && progressSec === row.progressSec)
      return Promise.resolve(row);
    if (row.status !== 'running')
      return Promise.reject(
        report(
          new Error(
            'Контрольная точка доступна только для запущенного выполнения.',
          ),
        ),
      );
    if (progressSec === row.progressSec) return Promise.resolve(null);
    const terminal = progressSec === row.candidate.metrics.makespanSec;
    const previous = checkpointPending.get(id);
    if (previous?.progressSec === progressSec) return previous.promise;
    if (
      !terminal &&
      (previous ||
        clock() - (lastCheckpoint.get(id) ?? -Infinity) <
          MISSION_CHECKPOINT_INTERVAL_MS)
    ) {
      return Promise.resolve(null);
    }
    // At most one periodic checkpoint plus one terminal flush. Pause also flushes
    // its exact model time and never uses this throttle.
    const promise: Promise<MissionOperation | null> = mutate(
      'advance',
      id,
      progressSec,
    );
    const marker = { progressSec, promise };
    checkpointPending.set(id, marker);
    const settled = () => {
      if (checkpointPending.get(id) === marker) checkpointPending.delete(id);
    };
    void promise.then(settled, settled);
    return promise;
  }

  function safetyChange(
    id: string,
    action: Parameters<MissionOperations['safetyChange']>[2],
  ) {
    const row = get(id);
    if (!row)
      return Promise.reject(report(new Error('Выполнение не загружено.')));
    const intent: RevisionIntent = {
      id,
      revision: row.revision,
      initialStatus: row.status,
    };
    const submitted = structuredClone(action);
    intents.add(intent);
    return schedule(async () =>
      afterWrite(
        await store.safetyChange(id, intent.revision, submitted),
        intent.revision,
      ),
    ).finally(() => intents.delete(intent));
  }

  function dispose() {
    if (disposalRequested) return;
    disposalRequested = true;
    listening = false;
    // React calls sibling effect cleanups synchronously. Allow the workbench's
    // explicit final pause in that cleanup; then reject any later timer commands.
    queueMicrotask(() => {
      accepting = false;
      void tail.then(() => store.close());
    });
  }

  return {
    getSnapshot: () => snapshot,
    get,
    refresh,
    dismissError: () => emit({ error: null }),
    exportRaw: (id: string) => schedule(() => store.exportRaw(id)),
    recoverDocument: (id: string) => schedule(() => store.recoverDocument(id)),
    archiveRejected: (id: string, expectedOriginalHash: string) =>
      schedule(async () => {
        await store.archiveRejected(id, expectedOriginalHash);
        const inspected = await store.inspect();
        replaceRows(inspected.rows);
        emit({
          rejected: inspected.rejected,
          fleet: await store.listFleet(),
          error: null,
        });
      }),
    listFleet: () => schedule(() => store.listFleet()),
    reportFleet: (input: FleetReport) =>
      schedule(async () => {
        const saved = await store.reportFleet(structuredClone(input));
        emit({ fleet: await store.listFleet() });
        return saved;
      }),
    enqueue,
    safetyChange,
    start: (id: string) => mutate('start', id),
    pause: (id: string, progressSec?: number) =>
      mutate('pause', id, progressSec),
    checkpoint,
    cancel: (id: string) => mutate('cancel', id),
    dispose,
  };
}

type Controller = ReturnType<typeof createMissionOperationsController>;
const notMounted = () =>
  new Error('Журнал выполнений ещё не готов или уже закрыт.');

/** No polling or automatic starts. get() reads the latest local rows synchronously.
 * Every command rejects on failure AND sets error. UI callers must handle rejection.
 * checkpoint() returns null when throttled; pause() always persists the supplied time.
 */
export function useMissionOperations() {
  const [state, setState] =
    useState<MissionOperationsSnapshot>(initialSnapshot);
  const controller = useRef<Controller | null>(null);

  useEffect(() => {
    const current = createMissionOperationsController(
      createMissionOperations(),
      setState,
    );
    controller.current = current;
    // Initial loading has no event caller; refresh already exposes errors in state.
    void current.refresh().catch(() => undefined);
    return () => {
      current.dispose();
      // Leave the draining coordinator available to the workbench cleanup pause.
      queueMicrotask(() => {
        if (controller.current === current) controller.current = null;
      });
    };
  }, []);

  const refresh = useCallback(
    () => controller.current?.refresh() ?? Promise.reject(notMounted()),
    [],
  );
  const dismissError = useCallback(
    () => controller.current?.dismissError(),
    [],
  );
  const exportRaw = useCallback(
    (id: string) =>
      controller.current?.exportRaw(id) ?? Promise.reject(notMounted()),
    [],
  );
  const recoverDocument = useCallback(
    (id: string) =>
      controller.current?.recoverDocument(id) ?? Promise.reject(notMounted()),
    [],
  );
  const archiveRejected = useCallback(
    (id: string, expectedOriginalHash: string) =>
      controller.current?.archiveRejected(id, expectedOriginalHash) ??
      Promise.reject(notMounted()),
    [],
  );
  const get = useCallback(
    (id: string) => controller.current?.get(id) ?? null,
    [],
  );
  const enqueue = useCallback(
    (input: EnqueueMissionOperation) =>
      controller.current?.enqueue(input) ?? Promise.reject(notMounted()),
    [],
  );
  const reportFleet = useCallback(
    (input: FleetReport) =>
      controller.current?.reportFleet(input) ?? Promise.reject(notMounted()),
    [],
  );
  const listFleet = useCallback(
    () => controller.current?.listFleet() ?? Promise.reject(notMounted()),
    [],
  );
  const start = useCallback(
    (id: string) =>
      controller.current?.start(id) ?? Promise.reject(notMounted()),
    [],
  );
  const pause = useCallback(
    (id: string, progressSec?: number) =>
      controller.current?.pause(id, progressSec) ??
      Promise.reject(notMounted()),
    [],
  );
  const checkpoint = useCallback(
    (id: string, progressSec: number) =>
      controller.current?.checkpoint(id, progressSec) ??
      Promise.reject(notMounted()),
    [],
  );
  const cancel = useCallback(
    (id: string) =>
      controller.current?.cancel(id) ?? Promise.reject(notMounted()),
    [],
  );

  const safetyChange = useCallback(
    (id: string, action: Parameters<MissionOperations['safetyChange']>[2]) =>
      controller.current?.safetyChange(id, action) ??
      Promise.reject(notMounted()),
    [],
  );
  return {
    ...state,
    refresh,
    dismissError,
    exportRaw,
    recoverDocument,
    archiveRejected,
    get,
    enqueue,
    reportFleet,
    listFleet,
    start,
    pause,
    checkpoint,
    cancel,
    safetyChange,
  };
}

export default useMissionOperations;
