import { distance, inside, segmentInside } from './geometry.ts';
import type { Multi, Point } from './geometry.ts';

const EPS = 1e-8;
const TAU = Math.PI * 2;
export type FixedWingLine = {
  kind: 'line';
  from: Point;
  to: Point;
  lengthM: number;
  durationSec: number;
};
export type FixedWingArc = {
  kind: 'arc';
  from: Point;
  to: Point;
  center: Point;
  radiusM: number;
  startAngleRad: number;
  sweepRad: number;
  lengthM: number;
  durationSec: number;
};
export type FixedWingPrimitive = FixedWingLine | FixedWingArc;
export type FixedWingGeometry = {
  model: 'still-air-tangent-fillet-v1';
  flightPlanningSupported: false;
  speedMps: number;
  radiusM: number;
  primitives: FixedWingPrimitive[];
  lengthM: number;
  durationSec: number;
};

function positive(n: number, label: string, max: number): void {
  if (!Number.isFinite(n) || n <= 0 || n > max)
    throw new Error(
      `${label}: требуется конечное положительное значение ≤${max}.`,
    );
}
function finitePoint(p: Point): void {
  if (
    !Array.isArray(p) ||
    p.length !== 2 ||
    p.some((x) => !Number.isFinite(x) || Math.abs(x) > 1e7)
  )
    throw new Error(
      'Точка должна содержать две конечные локальные координаты в метрах.',
    );
}
function assertArc(arc: FixedWingArc): void {
  [arc.from, arc.to, arc.center].forEach(finitePoint);
  positive(arc.radiusM, 'Радиус', 1e6);
  positive(arc.lengthM, 'Длина дуги', TAU * 1e6);
  positive(arc.durationSec, 'Длительность манёвра', 1e9);
  if (
    !Number.isFinite(arc.startAngleRad) ||
    !Number.isFinite(arc.sweepRad) ||
    Math.abs(arc.sweepRad) <= EPS ||
    Math.abs(arc.sweepRad) > TAU + EPS ||
    Math.abs(arc.lengthM - Math.abs(arc.sweepRad) * arc.radiusM) > 1e-5
  )
    throw new Error('Некорректная геометрия кругового манёвра.');
  const endpoint = (angle: number): Point => [
    arc.center[0] + arc.radiusM * Math.cos(angle),
    arc.center[1] + arc.radiusM * Math.sin(angle),
  ];
  if (
    distance(arc.from, endpoint(arc.startAngleRad)) > 1e-5 ||
    distance(arc.to, endpoint(arc.startAngleRad + arc.sweepRad)) > 1e-5
  )
    throw new Error('Концы дуги не соответствуют её центру, радиусу и углам.');
}
const unit = (a: Point, b: Point): Point => {
  const len = distance(a, b);
  if (len < 0.01)
    throw new Error('Соседние точки совпадают или расположены ближе 1 см.');
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
};
const shifted = (p: Point, u: Point, amount: number): Point => [
  p[0] + u[0] * amount,
  p[1] + u[1] * amount,
];

/** Tangent circular fillet, never an instantaneous turn or a stationary wait.
 * Radius and speed are explicit engineering input, not inferred 201 limits.
 * A U-turn needs a separate loop/Dubins connector and is rejected here. */
export function tangentCircularTurn(
  before: Point,
  corner: Point,
  after: Point,
  radiusM: number,
  speedMps: number,
): { arc: FixedWingArc; trimM: number } | null {
  [before, corner, after].forEach(finitePoint);
  positive(radiusM, 'Радиус', 1e6);
  positive(speedMps, 'Скорость', 1000);
  const incoming = unit(before, corner),
    outgoing = unit(corner, after),
    sweepRad = Math.atan2(
      incoming[0] * outgoing[1] - incoming[1] * outgoing[0],
      incoming[0] * outgoing[0] + incoming[1] * outgoing[1],
    );
  if (Math.abs(sweepRad) < EPS) return null;
  if (Math.PI - Math.abs(sweepRad) < 1e-6)
    throw new Error(
      'Разворот на 180° требует отдельной петли; нулевой радиус недопустим.',
    );
  const trimM = radiusM * Math.tan(Math.abs(sweepRad) / 2);
  if (
    trimM > distance(before, corner) + EPS ||
    trimM > distance(corner, after) + EPS
  )
    throw new Error(
      'Для заданного радиуса не хватает длины подхода или выхода.',
    );
  const from = shifted(corner, incoming, -trimM),
    to = shifted(corner, outgoing, trimM),
    turnSign = Math.sign(sweepRad),
    center = shifted(from, [-incoming[1], incoming[0]], turnSign * radiusM),
    lengthM = Math.abs(sweepRad) * radiusM;
  return {
    trimM,
    arc: {
      kind: 'arc',
      from,
      to,
      center,
      radiusM,
      startAngleRad: Math.atan2(from[1] - center[1], from[0] - center[0]),
      sweepRad,
      lengthM,
      durationSec: lengthM / speedMps,
    },
  };
}

/** Geometric groundwork only: no altitude, launch, landing, resource scheduling,
 * recovery or wind-corrected flight dynamics. Not accepted as a mission route. */
export function buildFixedWingGeometry(input: {
  waypoints: Point[];
  radiusM: number;
  speedMps: number;
  windMps: number;
}): FixedWingGeometry {
  const { waypoints, radiusM, speedMps, windMps } = input;
  positive(radiusM, 'Радиус', 1e6);
  positive(speedMps, 'Скорость', 1000);
  if (windMps !== 0)
    throw new Error(
      'Эта геометрическая модель рассчитана только для штиля; ветер не игнорируется автоматически.',
    );
  if (
    !Array.isArray(waypoints) ||
    waypoints.length < 2 ||
    waypoints.length > 100
  )
    throw new Error('Нужно от 2 до 100 путевых точек.');
  waypoints.forEach(finitePoint);
  const turns = waypoints.map((p, i) =>
    i === 0 || i === waypoints.length - 1
      ? null
      : tangentCircularTurn(
          waypoints[i - 1],
          p,
          waypoints[i + 1],
          radiusM,
          speedMps,
        ),
  );
  const primitives: FixedWingPrimitive[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const length = distance(waypoints[i], waypoints[i + 1]);
    if (length < 0.01)
      throw new Error('Соседние точки расположены ближе 1 см.');
    if ((turns[i]?.trimM ?? 0) + (turns[i + 1]?.trimM ?? 0) > length + EPS)
      throw new Error(
        'Соседние манёвры перекрываются: нужен другой маршрут или радиус.',
      );
    const from = turns[i]?.arc.to ?? waypoints[i],
      to = turns[i + 1]?.arc.from ?? waypoints[i + 1],
      lengthM = distance(from, to);
    if (lengthM > EPS)
      primitives.push({
        kind: 'line',
        from: [...from],
        to: [...to],
        lengthM,
        durationSec: lengthM / speedMps,
      });
    if (turns[i + 1]) primitives.push(turns[i + 1]!.arc);
  }
  return {
    model: 'still-air-tangent-fillet-v1',
    flightPlanningSupported: false,
    speedMps,
    radiusM,
    primitives,
    lengthM: primitives.reduce((sum, p) => sum + p.lengthM, 0),
    durationSec: primitives.reduce((sum, p) => sum + p.durationSec, 0),
  };
}

export function circularArcPoint(arc: FixedWingArc, fraction: number): Point {
  assertArc(arc);
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)
    throw new Error('Доля дуги должна быть от 0 до 1.');
  const theta = arc.startAngleRad + arc.sweepRad * fraction;
  return [
    arc.center[0] + arc.radiusM * Math.cos(theta),
    arc.center[1] + arc.radiusM * Math.sin(theta),
  ];
}

/** All circle/edge intersections split the analytic arc. Checking each interval
 * avoids the false safety of merely testing sampled vertices or the chord.
 * free must already contain the caller's protective clearance/inset. */
export function circularArcInside(arc: FixedWingArc, free: Multi): boolean {
  assertArc(arc);
  const fractionAt = (point: Point) => {
    const theta = Math.atan2(
        point[1] - arc.center[1],
        point[0] - arc.center[0],
      ),
      angle =
        arc.sweepRad > 0
          ? theta - arc.startAngleRad
          : arc.startAngleRad - theta,
      wrapped = ((angle % TAU) + TAU) % TAU;
    return wrapped / Math.abs(arc.sweepRad);
  };
  const splits = [0, 1];
  for (const polygon of free)
    for (const ring of polygon)
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          b = ring[i],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          fx = a[0] - arc.center[0],
          fy = a[1] - arc.center[1],
          aa = dx * dx + dy * dy,
          bb = 2 * (fx * dx + fy * dy),
          cc = fx * fx + fy * fy - arc.radiusM ** 2,
          disc = bb * bb - 4 * aa * cc;
        if (aa < EPS || disc < 0) continue;
        for (const t of [
          (-bb - Math.sqrt(disc)) / (2 * aa),
          (-bb + Math.sqrt(disc)) / (2 * aa),
        ]) {
          if (t < -EPS || t > 1 + EPS) continue;
          const f = fractionAt([a[0] + t * dx, a[1] + t * dy]);
          if (f > EPS && f < 1 - EPS) splits.push(f);
        }
      }
  splits.sort((a, b) => a - b);
  return (
    splits.every((t) => inside(circularArcPoint(arc, t), free)) &&
    splits
      .slice(1)
      .every((t, i) => inside(circularArcPoint(arc, (splits[i] + t) / 2), free))
  );
}

export function fixedWingGeometryInside(
  path: FixedWingGeometry,
  free: Multi,
): boolean {
  if (!path.primitives.length)
    throw new Error('Пустая геометрия не является маршрутом.');
  return path.primitives.every((p) =>
    p.kind === 'arc'
      ? circularArcInside(p, free)
      : segmentInside(p.from, p.to, free),
  );
}

/** Drawing helper only. Chords deviate by at most maxSagittaM from the arc;
 * this polyline must not replace analytic geometry in safety verification. */
export function sampleCircularArc(
  arc: FixedWingArc,
  maxSagittaM: number,
): Point[] {
  assertArc(arc);
  positive(maxSagittaM, 'Погрешность отображения', arc.radiusM);
  const maxAngle = 2 * Math.acos(1 - maxSagittaM / arc.radiusM),
    count = Math.max(1, Math.ceil(Math.abs(arc.sweepRad) / maxAngle));
  if (!Number.isFinite(count) || count > 10000)
    throw new Error('Слишком мелкий шаг отображения дуги.');
  return Array.from({ length: count + 1 }, (_, i) =>
    circularArcPoint(arc, i / count),
  );
}
