import type { MissionDocument, ScheduledSortie } from './mission-schema.ts';
import type { Coordinate } from './schema.ts';
import { firstSortieConflict } from './mission-validation.ts';
import type { SortieConflict } from './mission-validation.ts';

export type RecoveryConflict = SortieConflict & {
  kind: 'aircraft' | 'occupied-pad';
};
export type RecoveryDispatch = {
  algorithm: 'bounded-recovery-dispatch-v1';
  tested: number;
  limit: number;
  exhausted: boolean;
  conflicts: RecoveryConflict[];
  choices: { vehicleId: string; variants: number }[];
};

/** A landed aircraft stays put. No taxi, pad release or disappearance is assumed. */
export function occupyAfterLanding(
  s: ScheduledSortie,
  until: number,
): ScheduledSortie {
  if (until <= s.endSec) return s;
  const last = s.segments.at(-1)!;
  return {
    ...s,
    endSec: until,
    segments: [
      ...s.segments,
      {
        ...last,
        phase: 'landing',
        from: last.to,
        to: last.to,
        startSec: s.endSec,
        endSec: until,
        altitudeFromM: 0,
        altitudeToM: 0,
        distanceM: 0,
        airspeedMps: 0,
        groundSpeedMps: 0,
        batteryFromPct: last.batteryToPct,
        batteryToPct: last.batteryToPct,
      },
    ],
  };
}

export function stationaryRecoverySortie(
  vehicleId: string,
  coordinate: Coordinate,
  startSec: number,
  endSec: number,
): ScheduledSortie {
  return {
    id: `parked-${vehicleId}`,
    vehicleId,
    name: vehicleId,
    jobId: '',
    batteryId: '',
    startSec,
    endSec,
    readySec: endSec,
    durationSec: endSec - startSec,
    distanceM: 0,
    remainingPct: 0,
    strips: 0,
    shots: null,
    segments: [
      {
        phase: 'landing',
        from: coordinate,
        to: coordinate,
        startSec,
        endSec,
        altitudeFromM: 0,
        altitudeToM: 0,
        groundSpeedMps: 0,
        airspeedMps: 0,
        distanceM: 0,
        batteryFromPct: 0,
        batteryToPct: 0,
      },
    ],
  };
}

/** Deterministic bounded backtracking, not a proof that no other path exists. */
export function dispatchRecovery(
  d: MissionDocument,
  pools: { vehicleId: string; batteryPct: number; routes: ScheduledSortie[] }[],
  parked: { vehicleId: string; coordinate: Coordinate }[],
  startSec: number,
): { sorties: ScheduledSortie[]; diagnostics: RecoveryDispatch } {
  const diagnostics: RecoveryDispatch = {
    algorithm: 'bounded-recovery-dispatch-v1',
    tested: 0,
    limit: 2000,
    exhausted: false,
    conflicts: [],
    choices: [],
  };
  const record = (hit: SortieConflict, kind: RecoveryConflict['kind']) => {
    if (
      diagnostics.conflicts.length < 40 &&
      !diagnostics.conflicts.some(
        (c) =>
          c.vehicleId === hit.vehicleId &&
          c.otherVehicleId === hit.otherVehicleId &&
          c.kind === kind &&
          Math.abs(c.atSec - hit.atSec) < 0.1,
      )
    )
      diagnostics.conflicts.push({ ...hit, kind });
  };
  const ready = pools
    .map((pool) => ({
      ...pool,
      routes: pool.routes.filter((route) => {
        for (const p of parked) {
          const hit = firstSortieConflict(
            d,
            route,
            stationaryRecoverySortie(
              p.vehicleId,
              p.coordinate,
              startSec,
              route.endSec,
            ),
          );
          if (hit) {
            record(hit, 'occupied-pad');
            return false;
          }
        }
        return true;
      }),
    }))
    .sort(
      (a, b) =>
        a.routes.length - b.routes.length ||
        a.batteryPct - b.batteryPct ||
        a.vehicleId.localeCompare(b.vehicleId),
    );
  diagnostics.choices = ready.map((p) => ({
    vehicleId: p.vehicleId,
    variants: p.routes.length,
  }));
  const selected: ScheduledSortie[] = [];
  const search = (index: number): boolean => {
    if (index === ready.length) return true;
    for (const route of ready[index].routes) {
      if (++diagnostics.tested > diagnostics.limit) {
        diagnostics.exhausted = true;
        return false;
      }
      let hit: SortieConflict | null = null;
      for (const other of selected) {
        const until = Math.max(route.endSec, other.endSec);
        hit = firstSortieConflict(
          d,
          occupyAfterLanding(route, until),
          occupyAfterLanding(other, until),
        );
        if (hit) {
          record(hit, 'aircraft');
          break;
        }
      }
      if (hit) continue;
      selected.push(route);
      if (search(index + 1)) return true;
      selected.pop();
      if (diagnostics.exhausted) return false;
    }
    return false;
  };
  return {
    sorties: ready.every((p) => p.routes.length) && search(0) ? selected : [],
    diagnostics,
  };
}
