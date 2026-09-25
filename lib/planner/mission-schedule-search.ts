import type {
  MissionDocument,
  ScheduledSortie,
  MissionCandidate,
} from './mission-schema.ts';
import type { JobContext } from './mission-engine.ts';
import {
  firstSortieConflict,
  groundSeparationConflicts,
  validateMissionCandidate,
} from './mission-validation.ts';
import { sortieJobIds } from './mission-sortie-jobs.ts';

/** Stable lexicographic objectives: waiting on the ground is not airborne time. */
export function betterMission(
  a: MissionCandidate,
  b: MissionCandidate,
  objective: MissionCandidate['objective'],
) {
  const keys =
    objective === 'makespan'
      ? (['makespanSec', 'flightTimeSec', 'vehicleCount', 'distanceM'] as const)
      : ([
          'flightTimeSec',
          'makespanSec',
          'vehicleCount',
          'distanceM',
        ] as const);
  for (const key of keys) {
    if (a.metrics[key] < b.metrics[key] - 1e-6) return true;
    if (a.metrics[key] > b.metrics[key] + 1e-6) return false;
  }
  return false;
}

export function shiftDeparture(
  sortie: ScheduledSortie,
  startSec: number,
): ScheduledSortie {
  const delta = startSec - sortie.startSec;
  return {
    ...sortie,
    startSec,
    endSec: sortie.endSec + delta,
    readySec: sortie.readySec + delta,
    segments: sortie.segments.map((s) => ({
      ...s,
      startSec: s.startSec + delta,
      endSec: s.endSec + delta,
    })),
  };
}

/** Finite, deterministic search family. Never depends on names or demo IDs. */
export function missionJobOrders(ids: string[]): string[][] {
  const result: string[][] = [];
  const add = (order: string[]) => {
    if (!result.some((x) => x.every((id, i) => id === order[i])))
      result.push(order);
  };
  add([...ids]);
  add([...ids].reverse());
  for (let k = 1; k < ids.length; k++)
    add([...ids.slice(k), ...ids.slice(0, k)]);
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const order = [...ids];
      [order[i], order[j]] = [order[j], order[i]];
      add(order);
    }
  return result;
}

/** Post-route schedule repair. Keep all work, geometry, aircraft and SOC intact.
 * One-second departure grid is a bounded heuristic, NOT a global optimum claim.
 * Full validation before accepting includes parked aircraft, windows and energy.
 */
export function compactMissionSchedule(
  d: MissionDocument,
  initial: ScheduledSortie[],
  contexts: JobContext[],
  stop: () => boolean,
): ScheduledSortie[] {
  let result = initial;
  const begin = Date.parse(d.window.start);
  for (let pass = 0; pass < 2 && !stop(); pass++) {
    let changed = false;
    for (const original of [...result].sort(
      (a, b) => a.startSec - b.startSec || a.id.localeCompare(b.id),
    )) {
      if (stop()) break;
      const own = result.filter(
        (s) =>
          s.vehicleId === original.vehicleId &&
          s.endSec <= original.startSec &&
          s.id !== original.id,
      );
      const previous = own.sort((a, b) => a.endSec - b.endSec).at(-1);
      const battery = d.batteries.find((b) => b.id === original.batteryId);
      const jobs = sortieJobIds(original).map((id) =>
        d.jobs.find((j) => j.id === id)!,
      );
      const earliest = Math.max(
        d.planning.preparationSec,
        previous?.readySec ?? 0,
        battery ? (Date.parse(battery.readyAt) - begin) / 1000 : 0,
        ...jobs.map(
          (j) => (Date.parse(j.window?.start ?? d.window.start) - begin) / 1000,
        ),
      );
      if (earliest >= original.startSec - 1e-6) continue;
      const others = result.filter((s) => s.id !== original.id);
      for (
        let at = earliest, attempts = 0;
        at < original.startSec - 1e-6 && attempts < 11000 && !stop();
        at += 1, attempts++
      ) {
        const proposed = shiftDeparture(original, at);
        if (others.some((s) => firstSortieConflict(d, proposed, s))) continue;
        const candidate = result.map((s) =>
          s.id === original.id ? proposed : s,
        );
        if (
          d.planning.safetyPolicy &&
          groundSeparationConflicts(d, candidate).length
        )
          continue;
        if (
          validateMissionCandidate(d, candidate, contexts).some(
            (c) => c.status === 'fail',
          )
        )
          continue;
        result = candidate;
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return result;
}
