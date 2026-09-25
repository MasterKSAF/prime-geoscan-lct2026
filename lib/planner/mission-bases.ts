import { type MissionDocument, canonicalStringify } from './mission-schema.ts';
import { coordinate, type Coordinate } from './schema.ts';
import {
  distance,
  inside,
  projection,
  segmentBoundaryClearance,
  conservativeBuffer,
} from './geometry.ts';
import { fleetBases } from './fleet-registry.ts';
import { restrictionsInEnvelope } from './mission-catalog.ts';
import {
  parseObstacleKml,
  boundsOverlap,
  coordinateBounds,
  expandedBounds,
} from './obstacle-layer.ts';
import { segmentClearance } from './geometry.ts';

export type MissionBase = NonNullable<MissionDocument['bases']>[number];
export type BaseEdit = {
  id: string;
  name: string;
  coordinate: Coordinate;
  vehicleIds: string[];
  purpose: 'both' | 'start' | 'landing';
};
const same = (a: Coordinate, b: Coordinate) => a[0] === b[0] && a[1] === b[1];
export function baseContains(base: MissionBase, point: Coordinate) {
  return (
    same(base.coordinate, point) ||
    !!base.landingPads?.some((p) => same(p.coordinate, point))
  );
}
export function missionBases(d: MissionDocument): MissionBase[] {
  return fleetBases(d);
}
export function baseVehicleIds(d: MissionDocument, base: MissionBase) {
  return d.scenario.vehicles
    .filter((v) => baseContains(base, v.start) || baseContains(base, v.landing))
    .map((v) => v.id);
}
function basePointValidator(d: MissionDocument, origin: Coordinate) {
  const g = projection(origin);
  if (!d.scenario.airspace.coordinates.length) return () => false;
  const boundary = [
    d.scenario.airspace.coordinates.map((r) => r.map(g.forward)),
  ];
  const forbidden = [
    ...restrictionsInEnvelope(d, 0, 0).map((r) => ({
      name: r.name,
      shape: conservativeBuffer(r.geometry, d.scenario.clearanceM, g.forward),
    })),
    ...d.scenario.exclusions.map((r, i) => ({
      name: `Запрет ${i + 1}`,
      shape: conservativeBuffer(r, d.scenario.clearanceM, g.forward),
    })),
  ];
  // Base placement checks local ground occupancy, not a visibility-graph budget for the entire map.
  const obstacles = d.obstacleLayer
    ? parseObstacleKml(d.obstacleLayer.sourceText)
    : null;
  const obstacleGap = Math.max(
    d.scenario.clearanceM,
    d.obstacleLayer?.bufferM ?? 0,
  );
  const lineWidth = d.obstacleLayer?.lineHalfWidthM ?? 0;
  return (point: Coordinate) => {
    coordinate.parse(point);
    const projected = g.forward(point);
    const groundFree = !obstacles?.objects.some((o) => {
      const bounds = expandedBounds(
        coordinateBounds([point]),
        obstacleGap + lineWidth + 1,
      );
      if (o.bounds && !boundsOverlap(o.bounds, bounds)) return false;
      if (o.status === 'rejected') return true;
      const rings = o.coordinates.map((r) =>
        r.map((p) => g.forward([p[0], p[1]])),
      );
      const shapes =
        o.kind === 'Polygon'
          ? [rings]
          : rings[0].slice(1).map((p, i) => [[rings[0][i], p]]);
      return shapes.some(
        (shape) =>
          segmentClearance(projected, projected, [shape]) <=
          obstacleGap + (o.kind === 'LineString' ? lineWidth : 0) + 1e-6,
      );
    });
    return (
      inside(projected, boundary) &&
      segmentBoundaryClearance(projected, projected, boundary) >=
        d.scenario.clearanceM &&
      forbidden.every(({ shape }) => !inside(projected, shape)) &&
      groundFree
    );
  };
}

/** Centre and explicit pads; does not weaken either the route or ground validator. */
export function updateMissionBase(
  input: MissionDocument,
  change: BaseEdit,
): MissionDocument {
  const d = structuredClone(input),
    bases = missionBases(d),
    old = bases.find((b) => b.id === change.id);
  if (!change.name.trim() || change.name.length > 100)
    throw new Error('Введите название базы (до 100 символов).');
  coordinate.parse(change.coordinate);
  if (
    !d.scenario.airspace.coordinates.length ||
    !inside(change.coordinate, [d.scenario.airspace.coordinates])
  )
    throw new Error(
      'База вне границы полётов. Задайте границу и выберите точку внутри неё.',
    );
  const allowedPoint = basePointValidator(d, change.coordinate);
  if (!allowedPoint(change.coordinate))
    throw new Error(
      `База вне границы полётов, у препятствия или внутри ограничения у земли${restrictionsInEnvelope(
        d,
        0,
        0,
      )
        .filter((r) => inside(change.coordinate, [r.geometry.coordinates]))
        .map((r) => ` «${r.name}»`)
        .join(
          '',
        )}. Выберите другую точку; высотные зоны над базой проверяются при расчёте взлёта.`,
    );
  if (
    bases.some(
      (b) => b.id !== change.id && same(b.coordinate, change.coordinate),
    )
  )
    throw new Error(
      'В этой точке уже есть база. Выберите её или другую точку.',
    );
  if (!old && bases.length >= 40)
    throw new Error('В миссии допускается до 40 баз.');
  const ids = new Set([
    ...change.vehicleIds,
    ...(old ? baseVehicleIds(d, old) : []),
  ]);
  if ([...ids].some((id) => !d.scenario.vehicles.some((v) => v.id === id)))
    throw new Error('Назначенный БВС отсутствует в миссии.');
  const p = projection(change.coordinate),
    spacing = d.planning.separationHorizontalM + 2 * d.scenario.clearanceM + 2;
  const occupied = d.scenario.vehicles
    .filter((v) => !ids.has(v.id))
    .flatMap((v) => [v.start, v.landing]);
  const pads: NonNullable<MissionBase['landingPads']> = [];
  const points = new Map<string, Coordinate>();
  for (const id of ids) {
    let chosen: Coordinate | undefined;
    const vehicle = d.scenario.vehicles.find((v) => v.id === id)!;
    if (old && same(old.coordinate, change.coordinate)) {
      const previous = baseContains(old, vehicle.start)
        ? vehicle.start
        : vehicle.landing;
      if (
        baseContains(old, previous) &&
        allowedPoint(previous) &&
        [...occupied, ...points.values()].every(
          (q) => distance(p.forward(q), p.forward(previous)) >= spacing - 1e-6,
        )
      )
        chosen = previous;
    }
    // Bounded, deterministic placement around the operator's chosen centre.
    for (let radius = 0; radius <= 4 && !chosen; radius++)
      for (let index = 0; index < (radius ? 16 : 1); index++) {
        const angle = (index * Math.PI) / 8;
        const point = p.inverse([
          radius * spacing * Math.cos(angle),
          radius * spacing * Math.sin(angle),
        ]);
        if (
          allowedPoint(point) &&
          [...occupied, ...points.values()].every(
            (q) => distance(p.forward(q), p.forward(point)) >= spacing - 1e-6,
          )
        ) {
          chosen = point;
          break;
        }
      }
    if (!chosen)
      throw new Error(
        'Не удалось безопасно разместить аппараты у базы. Выберите более просторное место или назначьте меньше БВС.',
      );
    points.set(id, chosen);
    const v = d.scenario.vehicles.find((v) => v.id === id)!;
    pads.push({
      id: `pad-${pads.length + 1}`,
      coordinate: chosen,
      enabled: true,
      kinds: [v.kind],
    });
  }
  const next: MissionBase = {
    id: change.id,
    name: change.name.trim(),
    coordinate: change.coordinate,
    ...(pads.length ? { landingPads: pads } : {}),
  };
  d.bases = [...bases.filter((b) => b.id !== change.id), next];
  d.scenario.vehicles = d.scenario.vehicles.map((v) => {
    const point = points.get(v.id);
    if (!point) return v;
    const newlyAssigned =
      change.vehicleIds.includes(v.id) &&
      (!old || (!baseContains(old, v.start) && !baseContains(old, v.landing)));
    return {
      ...v,
      start:
        (old && baseContains(old, v.start)) ||
        (newlyAssigned && change.purpose !== 'landing')
          ? point
          : v.start,
      landing:
        (old && baseContains(old, v.landing)) ||
        (newlyAssigned && change.purpose !== 'start')
          ? point
          : v.landing,
    };
  });
  return d;
}

export function moveMissionBase(
  d: MissionDocument,
  id: string,
  point: Coordinate,
) {
  const base = missionBases(d).find((b) => b.id === id);
  if (!base) throw new Error('База не найдена.');
  return updateMissionBase(d, {
    ...base,
    coordinate: point,
    vehicleIds: baseVehicleIds(d, base),
    purpose: 'both',
  });
}

/** Relocate only the endpoints belonging to this base; preserve independent roles. */
export function reassignBaseVehicles(
  d: MissionDocument,
  sourceId: string,
  destinationId: string,
  ids: string[],
): MissionDocument {
  const bases = missionBases(d),
    source = bases.find((b) => b.id === sourceId),
    destination = bases.find((b) => b.id === destinationId);
  if (!source || !destination || sourceId === destinationId)
    throw new Error('Выберите другую существующую базу.');
  if (ids.some((id) => !baseVehicleIds(d, source).includes(id)))
    throw new Error('БВС не назначен на выбранную базу.');
  const next = updateMissionBase(d, {
    ...destination,
    vehicleIds: ids,
    purpose: 'both',
  });
  const updatedDestination = next.bases!.find((b) => b.id === destinationId)!;
  next.scenario.vehicles = next.scenario.vehicles.map((v) => {
    if (!ids.includes(v.id)) return v;
    const before = d.scenario.vehicles.find((x) => x.id === v.id)!;
    // A vehicle may already land at the destination while starting at the source.
    const point = baseContains(updatedDestination, v.start)
      ? v.start
      : v.landing;
    if (!baseContains(updatedDestination, point))
      throw new Error('Не удалось назначить безопасное место на другой базе.');
    return {
      ...v,
      start: baseContains(source, before.start) ? point : before.start,
      landing: baseContains(source, before.landing) ? point : before.landing,
    };
  });
  const used = next.scenario.vehicles.flatMap((v) => [v.start, v.landing]);
  next.bases = next.bases!.map((b) =>
    b.id === sourceId
      ? {
          ...b,
          landingPads: b.landingPads?.filter((pad) =>
            used.some((p) => same(p, pad.coordinate)),
          ),
        }
      : b,
  );
  return next;
}

export function deleteMissionBase(
  d: MissionDocument,
  id: string,
  replacementId?: string,
): MissionDocument {
  const bases = missionBases(d),
    target = bases.find((b) => b.id === id);
  if (!target) throw new Error('База не найдена.');
  const ids = baseVehicleIds(d, target);
  if (ids.length && !replacementId)
    throw new Error('Сначала выберите другую базу для связанных БВС.');
  let next = structuredClone(d);
  if (ids.length) {
    next = reassignBaseVehicles(d, id, replacementId!, ids);
  }
  next.bases = missionBases(next).filter(
    (b) => b.id !== id && !baseContains(target, b.coordinate),
  );
  return next;
}

export function changedBaseVehicles(
  before: MissionDocument,
  after: MissionDocument,
) {
  return after.scenario.vehicles.filter((v) => {
    const old = before.scenario.vehicles.find((x) => x.id === v.id);
    return (
      old &&
      (canonicalStringify(old.start) !== canonicalStringify(v.start) ||
        canonicalStringify(old.landing) !== canonicalStringify(v.landing))
    );
  });
}
