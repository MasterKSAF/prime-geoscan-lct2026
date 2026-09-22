import type { Coordinate, Polygon } from './schema.ts';
import { projection, distance, validatePolygonTopology } from './geometry.ts';

const same = (a: Coordinate, b: Coordinate) => distance(a, b) < 1e-10;
const cross = (a: Coordinate, b: Coordinate) => a[0] * b[1] - a[1] * b[0];
const sub = (a: Coordinate, b: Coordinate): Coordinate => [
  a[0] - b[0],
  a[1] - b[1],
];

/** First closed loop in drawing order. Tails before and after that loop are discarded. */
export function firstDrawingLoop(points: Coordinate[]): Coordinate[] | null {
  if (points.length < 4) return null;
  const project = projection(points[0]);
  const local = points.map(project.forward);
  for (let end = 3; end < local.length; end++) {
    const a = local[end - 1],
      b = local[end],
      v = sub(b, a);
    let hit: { t: number; edge: number; point: Coordinate } | null = null;
    for (let edge = 0; edge < end - 2; edge++) {
      const c = local[edge],
        w = sub(local[edge + 1], c),
        den = cross(v, w);
      if (Math.abs(den) < 1e-8) continue;
      const q = sub(c, a),
        t = cross(q, w) / den,
        u = cross(q, v) / den;
      if (t <= 1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) continue;
      if (!hit || t < hit.t)
        hit = {
          t,
          edge,
          point: project.inverse([a[0] + t * v[0], a[1] + t * v[1]]),
        };
    }
    if (hit) {
      const loop = [
        hit.point,
        ...points.slice(hit.edge + 1, end),
        hit.point,
      ].filter((p, i, all) => !i || !same(p, all[i - 1]));
      if (loop.length >= 4) return loop;
    }
  }
  return null;
}

export function closedDrawing(
  points: Coordinate[],
  holes: Coordinate[][] = [],
): Polygon {
  const clean = points.filter((p, i) => !i || !same(p, points[i - 1]));
  if (clean.length < 3) throw new Error('Отметьте минимум три разные точки.');
  const ring =
    firstDrawingLoop(clean) ??
    (same(clean[0], clean.at(-1)!) ? clean : [...clean, clean[0]]);
  const polygon: Polygon = {
    type: 'Polygon',
    coordinates: [ring, ...structuredClone(holes)],
  };
  validatePolygonTopology(polygon);
  return polygon;
}

export function ellipseDrawing(
  a: Coordinate,
  b: Coordinate,
  circle = false,
): Coordinate[] {
  const p = projection(a),
    corner = p.forward(b);
  let rx = Math.abs(corner[0]) / 2,
    ry = Math.abs(corner[1]) / 2;
  if (circle) rx = ry = Math.min(rx, ry);
  if (rx < 1 || ry < 1)
    throw new Error('Размер фигуры должен быть больше 2 метров.');
  return Array.from({ length: 48 }, (_, i) =>
    p.inverse([
      corner[0] / 2 + rx * Math.cos((i * Math.PI) / 24),
      corner[1] / 2 + ry * Math.sin((i * Math.PI) / 24),
    ]),
  );
}

/** Bounded RDP simplification in metres, never arbitrary vertex truncation. */
export function simplifyDrawing(points: Coordinate[]): Coordinate[] {
  if (points.length <= 69) return points;
  const p = projection(points[0]),
    local = points.map(p.forward);
  const simplify = (from: number, to: number, tolerance: number): number[] => {
    const a = local[from],
      b = local[to],
      v = sub(b, a),
      length2 = v[0] ** 2 + v[1] ** 2;
    let far = -1,
      max = tolerance;
    for (let i = from + 1; i < to; i++) {
      const q = sub(local[i], a),
        t = length2
          ? Math.max(0, Math.min(1, (q[0] * v[0] + q[1] * v[1]) / length2))
          : 0;
      const d = distance(local[i], [a[0] + v[0] * t, a[1] + v[1] * t]);
      if (d > max) {
        max = d;
        far = i;
      }
    }
    return far < 0
      ? [from, to]
      : [
          ...simplify(from, far, tolerance).slice(0, -1),
          ...simplify(far, to, tolerance),
        ];
  };
  for (let tolerance = 0.15; tolerance <= 20; tolerance *= 1.5) {
    const ids = simplify(0, local.length - 1, tolerance);
    if (ids.length <= 69) return ids.map((i) => points[i]);
  }
  throw new Error(
    'Слишком сложный контур. Разделите территорию на несколько участков.',
  );
}

export function moveAreaVertex(
  area: Polygon,
  ring: number,
  vertex: number,
  point: Coordinate,
): Polygon {
  const next = structuredClone(area);
  next.coordinates[ring][vertex] = point;
  if (vertex === 0)
    next.coordinates[ring][next.coordinates[ring].length - 1] = point;
  validatePolygonTopology(next);
  return next;
}
