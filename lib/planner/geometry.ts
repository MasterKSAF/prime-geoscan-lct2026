import clipping from 'polygon-clipping';
import type { Coordinate, Polygon, Scenario } from './schema.ts';

export type Point = [number, number];
export type Multi = Point[][][];
const EPS = 1e-6;
export const distance = (a: Point, b: Point) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
export const interpolate = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

export function projection(origin: Coordinate) {
  const r = (6371008.8 * Math.PI) / 180;
  const x = r * Math.cos((origin[1] * Math.PI) / 180);
  return {
    forward: (p: Coordinate): Point => [
      (p[0] - origin[0]) * x,
      (p[1] - origin[1]) * r,
    ],
    inverse: (p: Point): Coordinate => [
      origin[0] + p[0] / x,
      origin[1] + p[1] / r,
    ],
  };
}
export function area(m: Multi): number {
  const ringArea = (r: Point[]) =>
    Math.abs(r.slice(0, -1).reduce((a, p, i) => a + cross(p, r[i + 1]), 0) / 2);
  return m.reduce(
    (s, p) =>
      s + ringArea(p[0]) - p.slice(1).reduce((a, r) => a + ringArea(r), 0),
    0,
  );
}
function onEdge(p: Point, a: Point, b: Point) {
  return pointSegmentDistance(p, a, b) <= EPS;
}
function inRing(p: Point, r: Point[]) {
  let hit = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (onEdge(p, r[j], r[i])) return 0;
    if (
      r[i][1] > p[1] !== r[j][1] > p[1] &&
      p[0] <
        ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]
    )
      hit = !hit;
  }
  return hit ? 1 : -1;
}
export function inside(p: Point, m: Multi): boolean {
  return m.some(
    (poly) =>
      inRing(p, poly[0]) >= 0 && poly.slice(1).every((r) => inRing(p, r) <= 0),
  );
}
function intersections(a: Point, b: Point, c: Point, d: Point): number[] {
  const v = sub(b, a),
    w = sub(d, c),
    k = cross(v, w),
    q = sub(c, a);
  if (Math.abs(k) < EPS) {
    if (Math.abs(cross(q, v)) > EPS) return [];
    const den = v[0] ** 2 + v[1] ** 2;
    if (den < EPS) return [];
    return [c, d]
      .map((p) => ((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]) / den)
      .filter((t) => t >= 0 && t <= 1);
  }
  const t = cross(q, w) / k,
    u = cross(q, v) / k;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS
    ? [Math.max(0, Math.min(1, t))]
    : [];
}
function breaks(a: Point, b: Point, m: Multi) {
  const ts = [0, 1];
  for (const p of m)
    for (const r of p)
      for (let i = 0; i < r.length - 1; i++)
        ts.push(...intersections(a, b, r[i], r[i + 1]));
  return [...new Set(ts.map((t) => Math.round(t * 1e10) / 1e10))].sort(
    (x, y) => x - y,
  );
}
// Splits at every polygon crossing, rather than checking only route vertices.
export function segmentInside(a: Point, b: Point, m: Multi) {
  if (!inside(a, m) || !inside(b, m)) return false;
  const ts = breaks(a, b, m);
  return ts
    .slice(1)
    .every((t, i) => inside(interpolate(a, b, (t + ts[i]) / 2), m));
}
function assertPolygon(p: Polygon, project: (p: Coordinate) => Point) {
  for (const ring of p.coordinates) {
    if (distance(ring[0], ring[ring.length - 1]) > 1e-10)
      throw new Error('Кольца полигона должны быть замкнуты.');
    const r = ring.map(project);
    if (area([[r]]) < 1) throw new Error('Площадь кольца меньше 1 м².');
    for (let i = 0; i < r.length - 1; i++) {
      if (distance(r[i], r[i + 1]) < 0.01)
        throw new Error('Повторяющиеся соседние вершины.');
      for (let j = i + 2; j < r.length - 1; j++) {
        if (i === 0 && j === r.length - 2) continue;
        if (intersections(r[i], r[i + 1], r[j], r[j + 1]).length)
          throw new Error('Самопересекающийся полигон не поддерживается.');
      }
    }
  }
  const m = p.coordinates.map((r) => r.map(project));
  for (let i = 1; i < m.length; i++) {
    if (!m[i].slice(0, -1).every((q) => inRing(q, m[0]) === 1))
      throw new Error(
        'Отверстие должно находиться строго внутри внешнего контура.',
      );
    for (let j = 0; j < i; j++)
      for (let a = 0; a < m[i].length - 1; a++)
        for (let b = 0; b < m[j].length - 1; b++) {
          if (intersections(m[i][a], m[i][a + 1], m[j][b], m[j][b + 1]).length)
            throw new Error('Кольца не должны пересекаться.');
        }
    for (let j = 1; j < i; j++)
      if (inRing(m[i][0], m[j]) >= 0 || inRing(m[j][0], m[i]) >= 0)
        throw new Error('Вложенные отверстия не поддерживаются.');
  }
}

/** Validate editor geometry before replacing a valid contour. */
export function validatePolygonTopology(p: Polygon): void {
  if (
    !p.coordinates.length ||
    p.coordinates.some((r) => r.length < 4 || r.length > 70)
  )
    throw new Error('Контур: от 3 до 69 вершин.');
  assertPolygon(p, projection(p.coordinates[0][0]).forward);
}

function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    square = dx * dx + dy * dy;
  if (square < 1e-20) return distance(p, a);
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / square),
  );
  return distance(p, interpolate(a, b, t));
}

/** Exact planar segment-to-filled-polygon clearance, not a geodetic or sampled test. */
export function segmentClearance(a: Point, b: Point, obstacle: Multi): number {
  if (inside(a, obstacle) || inside(b, obstacle)) return 0;
  return segmentBoundaryClearance(a, b, obstacle);
}

/** Distance to polygon rings only, so points inside an airspace remain measurable. */
function segmentBoundaryClearance(a: Point, b: Point, boundary: Multi): number {
  let minimum = Infinity;
  for (const polygon of boundary)
    for (const ring of polygon) {
      for (let i = 1; i < ring.length; i++) {
        const c = ring[i - 1],
          d = ring[i];
        if (intersections(a, b, c, d).length) return 0;
        minimum = Math.min(
          minimum,
          pointSegmentDistance(a, c, d),
          pointSegmentDistance(b, c, d),
          pointSegmentDistance(c, a, b),
          pointSegmentDistance(d, a, b),
        );
      }
    }
  return minimum;
}

function boundaryBufferPieces(projected: Point[][], clearanceM: number): Multi {
  const safe = clearanceM + 0.01,
    outerRadius = safe / Math.cos(Math.PI / 8);
  const pieces: Multi = [];
  for (const ring of projected) {
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1],
        b = ring[i],
        length = distance(a, b),
        nx = (-(b[1] - a[1]) / length) * safe,
        ny = ((b[0] - a[0]) / length) * safe;
      const rectangle: Point[] = [
        [a[0] + nx, a[1] + ny],
        [b[0] + nx, b[1] + ny],
        [b[0] - nx, b[1] - ny],
        [a[0] - nx, a[1] - ny],
        [a[0] + nx, a[1] + ny],
      ];
      pieces.push([rectangle]);
      const octagon: Point[] = Array.from({ length: 8 }, (_, j) => {
        const angle = Math.PI / 8 + (j * Math.PI) / 4;
        return [
          a[0] + Math.cos(angle) * outerRadius,
          a[1] + Math.sin(angle) * outerRadius,
        ];
      });
      octagon.push([...octagon[0]]);
      pieces.push([octagon]);
    }
  }
  return pieces;
}

/**
 * Conservative Minkowski buffer in exactly the local metre plane used by routing.
 * The filled polygon + edge rectangles + circumscribed vertex octagons contain
 * the complete Euclidean radius-r buffer. The octagon apothem is r + 10 mm;
 * unlike inscribed Turf arcs, none of its chords cuts inside the requested radius.
 * Holes shrink through union with their boundary capsules, never disappear by fiat.
 * This is a model-space guarantee, not a claim about geodetic/physical clearance.
 */
export function conservativeBuffer(
  p: Polygon,
  clearanceM: number,
  forward: (p: Coordinate) => Point,
): Multi {
  if (!Number.isFinite(clearanceM) || clearanceM <= 0 || clearanceM > 100)
    throw new Error('Защитный запас должен быть в пределах (0; 100] м.');
  if (
    p.coordinates.length > 5 ||
    p.coordinates.some((ring) => ring.length > 70)
  )
    throw new Error('Слишком сложный исходный полигон защитного буфера.');
  const projected = p.coordinates.map((ring) => ring.map(forward));
  if (
    projected
      .flat()
      .some(
        (point) =>
          point.some((value) => !Number.isFinite(value)) ||
          distance(point, [0, 0]) > 15000,
      )
  )
    throw new Error(
      'Защитный буфер рассчитан на локальные участки радиусом до 15 км.',
    );
  assertPolygon(p, forward);
  const pieces: Multi = [
    projected,
    ...boundaryBufferPieces(projected, clearanceM),
  ];
  // Boolean operations use integer millimetres to avoid near-coincident seams.
  // The 10 mm apothem margin dominates the <= 1 mm coordinate perturbation.
  const snapped = pieces.map((part) =>
    part.map((ring) =>
      ring.map(([x, y]): Point => [Math.round(x * 1000), Math.round(y * 1000)]),
    ),
  );
  let result: Multi = [snapped[0]];
  // Two-input unions avoid a large coincident-edge sweep at polygon vertices.
  for (const piece of snapped.slice(1))
    result = clipping.union(result, piece) as Multi;
  if (!result.length || result.flat(2).length > 3000)
    throw new Error(
      'Результат защитного буфера вне поддерживаемого предела сложности.',
    );
  const metric = result.map((poly) =>
    poly.map((ring) => ring.map(([x, y]): Point => [x / 1000, y / 1000])),
  );
  const original: Multi = [projected];
  // Independent analytical postcondition over complete edges, not sampled arc
  // points. Any numerical union defect fails closed rather than shrinking r.
  for (const ring of projected)
    for (let i = 1; i < ring.length; i++) {
      if (!segmentInside(ring[i - 1], ring[i], metric))
        throw new Error(
          'Не удалось подтвердить включение исходного запрета в буфер.',
        );
    }
  for (const poly of metric)
    for (const ring of poly)
      for (let i = 1; i < ring.length; i++) {
        if (segmentClearance(ring[i - 1], ring[i], original) < clearanceM - EPS)
          throw new Error(
            'Не удалось подтвердить минимальный метрический защитный запас.',
          );
      }
  return metric;
}

/**
 * Erode every airspace ring by a conservative metric boundary buffer. Removing
 * complete edge strips and circumscribed vertex octagons expands holes and can
 * disconnect or close narrow corridors. Integer-millimetre clipping is guarded
 * by an independent analytical check of all resulting edges against all source
 * edges; a numerical defect or empty corridor fails closed.
 */
function conservativeAirspaceInset(boundary: Multi, clearanceM: number): Multi {
  const projected = boundary[0];
  if (projected.length > 5 || projected.some((ring) => ring.length > 70))
    throw new Error('Слишком сложный исходный полигон воздушного коридора.');
  const pieces = [
    projected,
    ...boundaryBufferPieces(projected, clearanceM),
  ].map((part) =>
    part.map((ring) =>
      ring.map(([x, y]): Point => [Math.round(x * 1000), Math.round(y * 1000)]),
    ),
  );
  let result: Multi = [pieces[0]];
  for (const piece of pieces.slice(1)) {
    result = clipping.difference(result, piece) as Multi;
    if (!result.length)
      throw new Error(
        'Воздушный коридор пуст после применения защитного запаса.',
      );
  }
  if (result.flat(2).length > 3000)
    throw new Error('Результат сужения воздушного коридора слишком сложный.');
  const metric = result.map((poly) =>
    poly.map((ring) => ring.map(([x, y]): Point => [x / 1000, y / 1000])),
  );
  for (const polygon of metric)
    for (const ring of polygon)
      for (let i = 1; i < ring.length; i++) {
        if (
          !segmentInside(ring[i - 1], ring[i], boundary) ||
          segmentBoundaryClearance(ring[i - 1], ring[i], boundary) <
            clearanceM - EPS
        )
          throw new Error(
            'Не удалось подтвердить защитный запас воздушного коридора.',
          );
      }
  // Also reject a lost source hole or another source boundary swallowed by the
  // result: resulting exterior edges alone cannot detect that topological defect.
  for (const ring of projected)
    for (let i = 1; i < ring.length; i++)
      if (segmentClearance(ring[i - 1], ring[i], metric) < clearanceM - EPS)
        throw new Error('Не удалось подтвердить границы воздушного коридора.');
  return metric;
}

export function prepareGeometry(
  s: Scenario,
  airspaceClearanceM = 0,
  origin?: Coordinate,
) {
  if (
    !Number.isFinite(airspaceClearanceM) ||
    airspaceClearanceM < 0 ||
    airspaceClearanceM > 100
  )
    throw new Error(
      'Защитный запас воздушного коридора должен быть в пределах [0; 100] м.',
    );
  const proj = projection(origin ?? s.area.coordinates[0][0]);
  const polys = [s.area, s.airspace, ...s.exclusions];
  polys.forEach((p) => assertPolygon(p, proj.forward));
  const all = polys
    .flatMap((p) => p.coordinates.flat())
    .concat(
      s.reserveSites,
      s.vehicles.flatMap((v) => [v.start, v.landing]),
    );
  if (all.some((p) => distance(proj.forward(p), [0, 0]) > 15000))
    throw new Error(
      'Геометрическая модель рассчитана на локальные участки радиусом до 15 км.',
    );
  const convert = (p: Polygon): Multi => [
    p.coordinates.map((r) => r.map(proj.forward)),
  ];
  const gross = convert(s.area),
    sourceBoundary = convert(s.airspace),
    boundary =
      airspaceClearanceM > 0
        ? conservativeAirspaceInset(sourceBoundary, airspaceClearanceM)
        : sourceBoundary;
  // Hard exclusions retain their own buffer; the optional corridor margin also
  // applies to the exterior and holes of the permitted airspace.
  const obstacles: Multi[] = s.exclusions.map((p) =>
    conservativeBuffer(p, s.clearanceM, proj.forward),
  );
  const free = obstacles.length
    ? (clipping.difference(boundary, ...obstacles) as Multi)
    : boundary;
  const target = clipping.intersection(gross, free) as Multi;
  if (area(target) < 10)
    throw new Error(
      'После применения границ и запретов доступная область меньше 10 м².',
    );
  const vertices = free.flatMap((p) => p.flatMap((r) => r.slice(0, -1)));
  if (vertices.length > 220)
    throw new Error(
      'Слишком сложная геометрия: более 220 вершин после буферизации.',
    );
  return { ...proj, gross, free, target, vertices };
}
export type Geometry = ReturnType<typeof prepareGeometry>;
export type Strip = { id: number; a: Point; b: Point };
export function generateStrips(
  g: Geometry,
  spacing: number,
  bearing: number,
): Strip[] {
  const t = (bearing * Math.PI) / 180,
    d: Point = [Math.sin(t), Math.cos(t)],
    n: Point = [Math.cos(t), -Math.sin(t)];
  const uv = (p: Point): Point => [
    p[0] * d[0] + p[1] * d[1],
    p[0] * n[0] + p[1] * n[1],
  ];
  const xy = (p: Point): Point => [
    p[0] * d[0] + p[1] * n[0],
    p[0] * d[1] + p[1] * n[1],
  ];
  const target = g.target.map((p) => p.map((r) => r.map(uv)));
  const pts = target.flat(2),
    ys = pts.map((p) => p[1]),
    xs = pts.map((p) => p[0]);
  const lo = Math.min(...ys),
    hi = Math.max(...ys),
    left = Math.min(...xs) - 1,
    right = Math.max(...xs) + 1;
  const count = Math.max(1, Math.ceil((hi - lo) / spacing));
  if (count > 240)
    throw new Error('Более 240 проходов: увеличьте шаг или уменьшите участок.');
  const strips: Strip[] = [];
  for (let i = 0; i < count; i++) {
    const y = lo + ((hi - lo) * (i + 0.5)) / count,
      a: Point = [left, y],
      b: Point = [right, y],
      ts = breaks(a, b, target);
    for (let j = 0; j < ts.length - 1; j++) {
      const p = interpolate(a, b, ts[j]),
        q = interpolate(a, b, ts[j + 1]);
      if (distance(p, q) > 0.1 && inside(interpolate(p, q, 0.5), target))
        strips.push({
          id: strips.length,
          a: xy(i % 2 ? q : p),
          b: xy(i % 2 ? p : q),
        });
    }
  }
  if (!strips.length || strips.length > 400)
    throw new Error('Число рабочих отрезков вне диапазона 1–400.');
  return strips;
}
export function router(g: Geometry) {
  const nodes = g.vertices;
  const adj = nodes.map((a, i) =>
    nodes.map((b, j) =>
      i !== j && segmentInside(a, b, g.free) ? distance(a, b) : Infinity,
    ),
  );
  const cache = new Map<string, Point[] | null>();
  return (a: Point, b: Point): Point[] | null => {
    if (segmentInside(a, b, g.free)) return [a, b];
    const key = [...a, ...b].map((v) => v.toFixed(4)).join(',');
    if (cache.has(key)) return cache.get(key)!;
    const pts = [...nodes, a, b],
      start = nodes.length,
      end = start + 1;
    const cost = pts.map(() => Infinity),
      prev = pts.map(() => -1),
      visited = new Set<number>();
    cost[start] = 0;
    while (visited.size < pts.length) {
      let u = -1;
      for (let i = 0; i < pts.length; i++)
        if (!visited.has(i) && (u < 0 || cost[i] < cost[u])) u = i;
      if (u < 0 || !Number.isFinite(cost[u])) break;
      if (u === end) break;
      visited.add(u);
      for (let v = 0; v < pts.length; v++)
        if (!visited.has(v)) {
          const w =
            u < start && v < start
              ? adj[u][v]
              : segmentInside(pts[u], pts[v], g.free)
                ? distance(pts[u], pts[v])
                : Infinity;
          if (cost[u] + w < cost[v]) {
            cost[v] = cost[u] + w;
            prev[v] = u;
          }
        }
    }
    let path: Point[] | null = null;
    if (Number.isFinite(cost[end])) {
      path = [];
      for (let u = end; u >= 0; u = prev[u]) path.unshift(pts[u]);
    }
    cache.set(key, path);
    return path;
  };
}

export function coveredArea(g: Geometry, strips: Strip[], swath: number) {
  // A geometric footprint envelope, not proof of image sharpness, trigger rate or DEM quality.
  const footprints: Multi = strips.map((s) => {
    const len = distance(s.a, s.b),
      nx = ((-(s.b[1] - s.a[1]) / len) * swath) / 2,
      ny = (((s.b[0] - s.a[0]) / len) * swath) / 2;
    const r: Point[] = [
      [s.a[0] + nx, s.a[1] + ny],
      [s.b[0] + nx, s.b[1] + ny],
      [s.b[0] - nx, s.b[1] - ny],
      [s.a[0] - nx, s.a[1] - ny],
      [s.a[0] + nx, s.a[1] + ny],
    ];
    return [r];
  });
  const union = clipping.union(
    ...(footprints as [Point[][], ...Point[][][]]),
  ) as Multi;
  return area(clipping.intersection(g.target, union) as Multi);
}
