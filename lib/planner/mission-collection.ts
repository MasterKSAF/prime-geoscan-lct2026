import { canonicalStringify, type MissionDocument } from './mission-schema.ts';
import type { FleetState } from './mission-fleet-state.ts';

export const MAX_SESSION_MISSIONS = 50;
export const MAX_SESSION_BYTES = 80 * 1024 * 1024;
const sizes = new WeakMap<MissionDocument, number>();
function documentBytes(d: MissionDocument) {
  let size = sizes.get(d);
  if (size === undefined) {
    size = new TextEncoder().encode(JSON.stringify(d)).length;
    sizes.set(d, size);
  }
  return size;
}

/** Library capacity is independent of the number of concurrent executions. */
export function upsertMission(
  documents: readonly MissionDocument[],
  next: MissionDocument,
): MissionDocument[] {
  const exists = documents.some((d) => d.id === next.id);
  if (!exists && documents.length >= MAX_SESSION_MISSIONS)
    throw new Error(
      'В сессии можно хранить до 50 миссий. Скачайте и удалите ненужные карточки.',
    );
  const result = exists
    ? documents.map((d) => (d.id === next.id ? next : d))
    : [...documents, next];
  const bytes = result.reduce((sum, d) => sum + documentBytes(d), 0);
  if (bytes > MAX_SESSION_BYTES)
    throw new Error(
      'Миссии занимают больше 80 МиБ. Скачайте и удалите ненужные карточки.',
    );
  return result;
}

export function importedFleetConflicts(
  input: MissionDocument,
  documents: readonly MissionDocument[],
  states: readonly FleetState[],
) {
  const known = new Map(
    documents.flatMap((d) =>
      d.scenario.vehicles.map(
        (v) =>
          [
            v.id,
            {
              vehicle: v,
              battery: d.batteries.find((b) => b.vehicleId === v.id),
            },
          ] as const,
      ),
    ),
  );
  for (const s of states)
    known.set(s.id, { vehicle: s.vehicle, battery: s.battery });
  return input.scenario.vehicles.flatMap((v) => {
    const current = known.get(v.id);
    if (!current) return [];
    const existing = current.vehicle,
      incomingBattery = input.batteries.find((b) => b.vehicleId === v.id);
    const sameBattery =
      !current.battery ||
      !incomingBattery ||
      canonicalStringify({ ...current.battery, readyAt: null }) ===
        canonicalStringify({ ...incomingBattery, readyAt: null });
    if (canonicalStringify(existing) === canonicalStringify(v) && sameBattery)
      return [];
    const differences = [];
    if (existing.batteryPct !== v.batteryPct)
      differences.push(
        `заряд: в файле ${v.batteryPct}%, в парке ${existing.batteryPct}%`,
      );
    if (!sameBattery) differences.push('паспорт или состояние текущей батареи');
    if (
      canonicalStringify([existing.start, existing.landing]) !==
      canonicalStringify([v.start, v.landing])
    )
      differences.push('базы старта / посадки');
    if (canonicalStringify(existing.jobs) !== canonicalStringify(v.jobs))
      differences.push('доступные виды работ');
    if (existing.enabled !== v.enabled) differences.push('доступность');
    if (!differences.length)
      differences.push('характеристики или профиль аппарата');
    return [
      {
        id: v.id,
        name: v.name,
        existing,
        battery: current.battery,
        differences,
      },
    ];
  });
}

/** Explicit user choice only. No weather, geometry or work requirement changes. */
export function reconcileImportedFleet(
  input: MissionDocument,
  documents: readonly MissionDocument[],
  states: readonly FleetState[],
): MissionDocument {
  const conflicts = importedFleetConflicts(input, documents, states);
  const next = structuredClone(input);
  for (const { id, existing, battery } of conflicts) {
    next.scenario.vehicles = next.scenario.vehicles.map((v) =>
      v.id === id ? structuredClone(existing) : v,
    );
    if (battery)
      next.batteries = next.batteries.map((b) =>
        b.vehicleId === id
          ? {
              ...structuredClone(battery),
              readyAt: b.readyAt,
              initialPct: existing.batteryPct,
            }
          : b,
      );
  }
  delete next.fleetSnapshot;
  return next;
}
