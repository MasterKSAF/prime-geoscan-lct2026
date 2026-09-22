import type { MissionDocument } from './mission-schema.ts';
import { canonicalStringify } from './mission-schema.ts';
import type { MissionOperation } from './mission-operations.ts';
import type { FleetState } from './mission-fleet-state.ts';
import {
  fleetStateFromDocument,
  type FleetReport,
} from './mission-fleet-state.ts';

export function vehicleAssignments(
  id: string,
  operations: readonly MissionOperation[],
  state?: FleetState,
) {
  const assigned = operations.filter(
    (o) =>
      !['completed', 'cancelled'].includes(o.status) &&
      o.candidate.sorties.some((s) => s.vehicleId === id),
  );
  const active = assigned.filter(
    (o) => o.status === 'running' || o.status === 'paused',
  );
  const remainingSec =
    active.length && active.every((o) => o.status === 'running' && !o.safety)
      ? Math.max(
          ...active.map((o) =>
            Math.max(0, o.candidate.metrics.makespanSec - o.progressSec),
          ),
        )
      : null;
  return {
    assigned,
    active,
    remainingSec,
    label: assigned.length
      ? remainingSec !== null
        ? `Ещё ≈${Math.ceil(remainingSec / 60)} мин по модели`
        : active.length
          ? 'Ожидает продолжения / завершения'
          : 'Зарезервирован в плане'
      : state && (!state.grounded || !state.ready)
        ? 'Готовность не подтверждена'
        : 'Не назначен',
  };
}

export function baseChangeBlocker(
  id: string,
  operations: readonly MissionOperation[],
  state?: FleetState,
): string | null {
  if (state && !state.grounded)
    return 'БВС не на земле. Сначала подтвердите безопасную посадку.';
  if (
    state?.operationId ||
    vehicleAssignments(id, operations, state).assigned.length
  )
    return 'БВС закреплён за миссией. Завершите или отмените её перед сменой базы.';
  if (
    operations.some(
      (o) => o.startedAt && !['completed', 'cancelled'].includes(o.status),
    )
  )
    return 'Наземные перемещения парка доступны после завершения текущих полётов.';
  return null;
}

/** Only changes existing shared aircraft: never imports unrelated fleet implicitly. */
export function refreshDraftFleet(
  d: MissionDocument,
  before: MissionDocument | null,
  after: MissionDocument,
): MissionDocument {
  const changed = new Map(
    after.scenario.vehicles
      .filter((v) => {
        const previous = before?.scenario.vehicles.find((x) => x.id === v.id);
        return canonicalStringify(previous ?? null) !== canonicalStringify(v);
      })
      .map((v) => [v.id, v]),
  );
  if (!d.scenario.vehicles.some((v) => changed.has(v.id))) return d;
  const next = structuredClone(d);
  next.scenario.vehicles = next.scenario.vehicles.map((v) =>
    structuredClone(changed.get(v.id) ?? v),
  );
  next.bases = [
    ...new Map(
      [...(d.bases ?? []), ...(after.bases ?? [])].map((b) => [
        b.id,
        structuredClone(b),
      ]),
    ).values(),
  ];
  next.batteries = next.batteries.map((b) => {
    const updated =
      changed.has(b.vehicleId) &&
      after.batteries.find((x) => x.vehicleId === b.vehicleId);
    return updated
      ? { ...structuredClone(updated), readyAt: d.window.start }
      : b;
  });
  delete next.fleetSnapshot;
  return next;
}

/** A base assignment is an operator's ground report, never fresh aircraft telemetry or a recharge. */
export function baseAssignmentReport(
  document: MissionDocument,
  id: string,
  old: FleetState | undefined,
  operations: readonly MissionOperation[],
  now = new Date(),
): FleetReport {
  const reason = baseChangeBlocker(id, operations, old);
  if (reason) throw new Error(reason);
  const vehicle = document.scenario.vehicles.find((v) => v.id === id);
  if (!vehicle) throw new Error('БВС отсутствует в парке.');
  const previous =
    old ?? fleetStateFromDocument(document, id, now.toISOString());
  const observedAt = new Date(
    Math.max(now.getTime(), Date.parse(previous.observedAt) + 1),
  ).toISOString();
  return {
    expectedRevision: old?.revision ?? 0,
    replacement: false,
    state: {
      ...structuredClone(previous),
      observedAt,
      source: 'operator',
      operationId: null,
      vehicle: {
        ...structuredClone(vehicle),
        batteryPct: previous.battery.initialPct,
      },
      lastEvent:
        'Оператор подтвердил нахождение на базе. Заряд и готовность сохранены; это не команда перелёта.',
    },
  };
}
