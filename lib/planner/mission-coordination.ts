import type { MissionOperation } from './mission-operations.ts';
import type { Coordinate } from './schema.ts';
import type { FleetState } from './mission-fleet-state.ts';

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

/** A stationary, unassigned aircraft in another region cannot occupy this
 * model's flight envelope. Keep an intentionally conservative 50 km geographic
 * guard (not a statutory separation norm). Airborne/assigned/unknown states
 * and anything near the operation still require the existing full checks. */
export function distantGroundedFleetState(
  row: Pick<MissionOperation, 'document' | 'candidate'>,
  state: FleetState,
): boolean {
  if (!state.grounded || state.operationId) return false;
  const envelope = operationEnvelope(row);
  if (!envelope) return false;
  const points = [state.vehicle.start, state.vehicle.landing];
  if (points.some((p) => !p.every(Number.isFinite) || Math.abs(p[1]) > 84))
    return false;
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const west = Math.min(...xs),
    east = Math.max(...xs);
  if (Math.max(east, envelope.east) - Math.min(west, envelope.west) > 180)
    return false;
  const dy = 50000 / 110000;
  const latitude = Math.max(
    Math.abs(envelope.north),
    Math.abs(envelope.south),
    ...ys.map(Math.abs),
  );
  const dx = dy / Math.cos((latitude * Math.PI) / 180);
  return (
    east < envelope.west - dx ||
    west > envelope.east + dx ||
    Math.max(...ys) < envelope.south - dy ||
    Math.min(...ys) > envelope.north + dy
  );
}
