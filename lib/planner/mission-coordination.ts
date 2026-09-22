import type { MissionOperation } from './mission-operations.ts';
import type { Coordinate } from './schema.ts';

/** Conservative all-time horizontal reservation. Pauses, asynchronous clocks and
 * different altitude datums cannot make intersecting envelopes safe. */
export function operationEnvelope(
  row: Pick<MissionOperation, 'document' | 'candidate'>,
) {
  const used = new Set(row.candidate.sorties.map((s) => s.vehicleId));
  const points: Coordinate[] = row.candidate.sorties.flatMap((s) =>
    s.segments.flatMap((p) => [p.from, p.to]),
  );
  points.push(
    ...row.document.scenario.vehicles
      .filter((v) => used.has(v.id))
      .flatMap((v) => [v.start, v.landing]),
  );
  points.push(...row.document.scenario.reserveSites);
  if (
    !points.length ||
    points.some((p) => !p.every(Number.isFinite) || Math.abs(p[1]) > 84)
  )
    return null;
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  if (Math.max(...xs) - Math.min(...xs) > 180) return null;
  const margin = row.document.planning.separationHorizontalM + 10;
  const dy = margin / 110000,
    dx = dy / Math.cos((Math.max(...ys.map(Math.abs)) * Math.PI) / 180);
  return {
    west: Math.min(...xs) - dx,
    east: Math.max(...xs) + dx,
    south: Math.min(...ys) - dy,
    north: Math.max(...ys) + dy,
  };
}
export function independentOperations(
  a: Pick<MissionOperation, 'document' | 'candidate'>,
  b: Pick<MissionOperation, 'document' | 'candidate'>,
) {
  const ids = new Set(a.candidate.sorties.map((s) => s.vehicleId));
  if (b.candidate.sorties.some((s) => ids.has(s.vehicleId))) return false;
  const x = operationEnvelope(a),
    y = operationEnvelope(b);
  return (
    !!x &&
    !!y &&
    (x.east < y.west ||
      y.east < x.west ||
      x.north < y.south ||
      y.north < x.south)
  );
}
