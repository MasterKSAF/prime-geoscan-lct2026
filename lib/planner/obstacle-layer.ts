import { DOMParser } from '@xmldom/xmldom';
import { z } from 'zod';
import {
  projection,
  segmentClearance,
  validatePolygonTopology,
} from './geometry.ts';
import type { Coordinate, Polygon, Segment, Check } from './schema.ts';

export const MAX_OBSTACLE_BYTES = 8 * 1024 * 1024;
export const MAX_OBSTACLE_MISSION_BYTES = 12 * 1024 * 1024;
export const OBSTACLE_ADAPTER = 'geoscan-kml-horizontal/1' as const;
export const obstacleSourceSchema = z
  .object({
    version: z.literal(OBSTACLE_ADAPTER),
    filename: z.string().min(1).max(160),
    sourceText: z.string().min(1).max(MAX_OBSTACLE_BYTES),
    bufferM: z.number().min(2).max(100),
    lineHalfWidthM: z.number().min(0).max(100),
    policySource: z.string().min(1).max(500),
  })
  .strict();
export type ObstacleSource = z.infer<typeof obstacleSourceSchema>;
export type Bounds = [number, number, number, number];
export type ObstacleObject = {
  id: string;
  sourceId: string;
  name: string;
  kind: 'Polygon' | 'LineString' | 'unsupported';
  altitudeMode: string;
  extrude: string;
  coordinates: number[][][];
  bounds: Bounds | null;
  status: 'accepted' | 'repaired' | 'rejected';
  repairs: string[];
  error?: string;
};
export type ObstacleCatalog = {
  adapter: typeof OBSTACLE_ADAPTER;
  objects: ObstacleObject[];
  total: number;
  accepted: number;
  repaired: number;
  rejected: number;
  bounds: Bounds;
};
type ObstacleMission = {
  obstacleLayer?: ObstacleSource;
  scenario: { airspace: Polygon; area: Polygon; clearanceM: number };
};
const cache = new Map<string, ObstacleCatalog>();
export function coordinateBounds(points: number[][]): Bounds {
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity;
  for (const p of points) {
    west = Math.min(west, p[0]);
    south = Math.min(south, p[1]);
    east = Math.max(east, p[0]);
    north = Math.max(north, p[1]);
  }
  return [west, south, east, north];
}
export const boundsOverlap = (a: Bounds, b: Bounds) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
export function expandedBounds(b: Bounds, metres: number): Bounds {
  const dy = metres / 110000,
    dx =
      dy / Math.cos((Math.max(Math.abs(b[1]), Math.abs(b[3])) * Math.PI) / 180);
  return [b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy];
}

/** No network, entities, style execution or silent object loss. Cache keys are exact source text. */
export function parseObstacleKml(sourceText: string): ObstacleCatalog {
  const found = cache.get(sourceText);
  if (found) return found;
  if (
    !sourceText.trim() ||
    new TextEncoder().encode(sourceText).length > MAX_OBSTACLE_BYTES
  )
    throw new Error('KML препятствий: пустой файл или размер больше 8 МиБ.');
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(sourceText))
    throw new Error('KML: DTD и внешние сущности запрещены.');
  if ((sourceText.match(/</g) ?? []).length > 200000)
    throw new Error('KML: слишком много XML-элементов.');
  const errors: string[] = [];
  const xml = new DOMParser({
    onError: (level, message) => {
      if (level !== 'warning') errors.push(message);
      else errors.push(message);
    },
  }).parseFromString(sourceText, 'application/xml');
  if (
    errors.length ||
    !xml.documentElement ||
    xml.documentElement.localName !== 'kml'
  )
    throw new Error('Некорректный XML/KML.');
  let elements = 0;
  const walk = (el: Element, depth: number) => {
    if (depth > 32 || ++elements > 100000)
      throw new Error('KML: превышена сложность XML.');
    if (
      [
        'NetworkLink',
        'Model',
        'GroundOverlay',
        'PhotoOverlay',
        'ScreenOverlay',
      ].includes(el.localName)
    )
      throw new Error(
        `KML: ${el.localName} не поддерживается; внешние ресурсы не загружаются.`,
      );
    for (let n = el.firstChild; n; n = n.nextSibling)
      if (n.nodeType === 1) walk(n as Element, depth + 1);
  };
  walk(xml.documentElement as unknown as Element, 0);
  const nodes = Array.from(xml.getElementsByTagNameNS('*', 'Placemark'));
  if (!nodes.length || nodes.length > 10000)
    throw new Error('KML: требуется от 1 до 10 000 объектов.');
  let tuples = 0;
  const ids = new Set<string>();
  const objects: ObstacleObject[] = nodes.map((node, index) => {
    const sourceId = node.getAttribute('id') ?? '';
    const text = (tag: string, fallback = '') =>
      node.getElementsByTagNameNS('*', tag)[0]?.textContent?.trim() ?? fallback;
    const obj: ObstacleObject = {
      id: `obs-${index + 1}`,
      sourceId,
      name: text('name', `Объект ${index + 1}`).slice(0, 500),
      kind: 'unsupported',
      altitudeMode: text('altitudeMode', 'clampToGround'),
      extrude: text('extrude', '0'),
      coordinates: [],
      bounds: null,
      status: 'accepted',
      repairs: [],
    };
    try {
      if (sourceId && ids.has(sourceId)) throw new Error('Повторён XML ID.');
      if (sourceId) ids.add(sourceId);
      const polygons = node.getElementsByTagNameNS('*', 'Polygon'),
        lines = node.getElementsByTagNameNS('*', 'LineString');
      if (
        polygons.length + lines.length !== 1 ||
        node.getElementsByTagNameNS('*', 'Point').length ||
        node.getElementsByTagNameNS('*', 'MultiGeometry').length
      )
        throw new Error('Требуется один Polygon или LineString.');
      obj.kind = polygons.length ? 'Polygon' : 'LineString';
      const shape = polygons[0] ?? lines[0];
      const coordinateNodes = Array.from(
        shape.getElementsByTagNameNS('*', 'coordinates'),
      );
      if (
        coordinateNodes.length < 1 ||
        coordinateNodes.length > 5 ||
        (obj.kind === 'LineString' && coordinateNodes.length !== 1)
      )
        throw new Error('Неподдержанное число контуров.');
      obj.coordinates = coordinateNodes.map((n) => {
        const raw = (n.textContent ?? '').trim().replace(/\s*,\s*/g, ',').split(/\s+/);
        if ((tuples += raw.length) > 200000)
          throw new Error('KML: превышено 200 000 координат.');
        if (raw.length > 70)
          throw new Error(
            'Объект: более 70 координат в контуре; требуется отдельная обработка.',
          );
        return raw.map((s) => {
          const parts = s.split(',');
          if (
            parts.length < 2 ||
            parts.length > 3 ||
            parts.some((v) => !v.trim())
          )
            throw new Error('Некорректная координатная тройка.');
          const p = parts.map(Number);
          if (p.length === 2) p.push(0);
          if (
            p.some((v) => !Number.isFinite(v)) ||
            Math.abs(p[0]) > 180 ||
            Math.abs(p[1]) > 70 ||
            Math.abs(p[2]) > 20000
          )
            throw new Error('Координата вне поддерживаемого диапазона.');
          return p;
        });
      });
      obj.bounds = coordinateBounds(obj.coordinates.flat());
      if (
        !['absolute', 'relativeToGround', 'clampToGround', 'relativeToSeaFloor', 'clampToSeaFloor'].includes(
          obj.altitudeMode,
        )
      )
        throw new Error('Неизвестная система высот.');
      // Preserve the declared datum, including non-gx exports. The footprint is
      // avoided at ALL heights: no sea-floor-to-AGL conversion is being claimed.
      if (obj.kind === 'Polygon') {
        for (const ring of obj.coordinates) {
          if (ring.length < 3) throw new Error('Недостаточно вершин полигона.');
          const first = ring[0],
            last = ring.at(-1)!;
          if (first[0] !== last[0] || first[1] !== last[1]) {
            ring.push([...first]);
            obj.repairs.push(
              'Добавлена замыкающая копия первой координаты в производной геометрии.',
            );
          }
        }
        validatePolygonTopology({
          type: 'Polygon',
          coordinates: obj.coordinates.map((r) => r.map((p) => [p[0], p[1]])),
        });
      } else {
        const r = obj.coordinates[0];
        if (
          r.length < 2 ||
          r.slice(1).some((p, i) => p[0] === r[i][0] && p[1] === r[i][1])
        )
          throw new Error('Вырожденная линия.');
      }
      if (obj.repairs.length) obj.status = 'repaired';
    } catch (e) {
      obj.status = 'rejected';
      obj.error = e instanceof Error ? e.message : String(e);
    }
    return obj;
  });
  if (tuples > 200000) throw new Error('KML: превышено 200 000 координат.');
  const valid = objects.flatMap((o) =>
    o.bounds
      ? [
          [o.bounds[0], o.bounds[1]],
          [o.bounds[2], o.bounds[3]],
        ]
      : [],
  );
  if (!valid.length) throw new Error('KML не содержит определимых координат.');
  const catalog: ObstacleCatalog = {
    adapter: OBSTACLE_ADAPTER,
    objects,
    total: objects.length,
    accepted: objects.filter((o) => o.status !== 'rejected').length,
    repaired: objects.filter((o) => o.status === 'repaired').length,
    rejected: objects.filter((o) => o.status === 'rejected').length,
    bounds: coordinateBounds(valid),
  };
  if (cache.size >= 2) cache.delete(cache.keys().next().value!);
  cache.set(sourceText, catalog);
  return catalog;
}

/** Entire permitted airspace, not just the survey area. No truncation at object budget. */
export function relevantObstacles(d: ObstacleMission): ObstacleObject[] {
  if (!d.obstacleLayer) return [];
  const source = d.obstacleLayer,
    catalog = parseObstacleKml(source.sourceText);
  const bounds = expandedBounds(
    coordinateBounds(d.scenario.airspace.coordinates.flat()),
    source.bufferM + source.lineHalfWidthM + d.scenario.clearanceM + 1000,
  );
  const objects = catalog.objects.filter(
    (o) => !o.bounds || boundsOverlap(o.bounds, bounds),
  );
  const invalid = objects.find((o) => o.status === 'rejected');
  if (invalid)
    throw new Error(
      `Препятствие ${invalid.id}: ${invalid.error}. Проверка маршрута заблокирована.`,
    );
  if (objects.length > 80)
    throw new Error(
      'В расчётной области больше 80 препятствий. Уменьшите разрешённый коридор; объекты не отброшены.',
    );
  return objects;
}

/** Conservative rectangles for line segments include their end caps; source poly rings remain unchanged. */
export function obstacleFootprints(d: ObstacleMission): Polygon[] {
  const source = d.obstacleLayer;
  if (!source) return [];
  const proj = projection(d.scenario.area.coordinates[0][0]);
  return relevantObstacles(d).flatMap((o): Polygon[] => {
    if (o.kind === 'Polygon')
      return [
        {
          type: 'Polygon',
          coordinates: o.coordinates.map((r) => r.map((p) => [p[0], p[1]])),
        },
      ];
    const points = o.coordinates[0].map((p) => proj.forward([p[0], p[1]]));
    return points.slice(1).map((b, i) => {
      const a = points[i],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]),
        ux = (b[0] - a[0]) / length,
        uy = (b[1] - a[1]) / length,
        half = Math.max(0.1, source.lineHalfWidthM);
      const ring: Coordinate[] = [
        [-half, half],
        [length + half, half],
        [length + half, -half],
        [-half, -half],
        [-half, half],
      ].map(([x, y]) =>
        proj.inverse([a[0] + ux * x - uy * y, a[1] + uy * x + ux * y]),
      );
      return { type: 'Polygon', coordinates: [ring] };
    });
  });
}

/** Independent full-catalog scan against actual segments, without trusting planner selection/buffers. */
export function checkExternalObstacles(
  d: ObstacleMission,
  segments: Segment[],
): Check[] {
  if (!d.obstacleLayer) return [];
  const source = d.obstacleLayer,
    catalog = parseObstacleKml(source.sourceText),
    proj = projection(d.scenario.area.coordinates[0][0]);
  if (segments.length * catalog.total > 10_000_000)
    return [
      {
        id: 'EXTERNAL_OBSTACLES',
        title: 'Препятствия исходного KML',
        status: 'fail',
        detail:
          'Превышен бюджет 10 миллионов пар сегмент–объект. Частичная проверка не считается успешной; сократите миссию.',
      },
    ];
  const conflicts: string[] = [];
  let checkedPairs = 0;
  for (const s of segments) {
    const radius =
      Math.max(d.scenario.clearanceM, source.bufferM) +
      (s.fixedWing?.tubeRadiusM ?? 0);
    const bounds = expandedBounds(
      coordinateBounds([s.from, s.to]),
      radius + source.lineHalfWidthM + 1,
    );
    for (const o of catalog.objects) {
      if (o.bounds && !boundsOverlap(bounds, o.bounds)) continue;
      if (o.status === 'rejected') {
        conflicts.push(`${o.id}: геометрия не проверена`);
        continue;
      }
      checkedPairs++;
      const rings = o.coordinates.map((r) =>
        r.map((p) => proj.forward([p[0], p[1]])),
      );
      const shapes =
        o.kind === 'Polygon'
          ? [rings]
          : rings[0].slice(1).map((p, i) => [[rings[0][i], p]]);
      const gap = Math.min(
        ...shapes.map((poly) =>
          segmentClearance(proj.forward(s.from), proj.forward(s.to), [poly]),
        ),
      );
      const required =
        radius + (o.kind === 'LineString' ? source.lineHalfWidthM : 0);
      if (gap <= required + 1e-6)
        conflicts.push(
          `${o.id} · ${s.phase} · ${s.startSec.toFixed(2)} с: ${gap.toFixed(2)} м ≤ ${required.toFixed(2)} м`,
        );
    }
  }
  return [
    {
      id: 'EXTERNAL_OBSTACLES',
      title: 'Препятствия исходного KML',
      status: conflicts.length ? 'fail' : 'pass',
      detail: `Полный каталог: ${catalog.total}; сегментов: ${segments.length}; точных проверок: ${checkedPairs}. ${conflicts.length ? conflicts.slice(0, 8).join('; ') : 'Пересечений защитных контуров в принятой горизонтальной модели не найдено.'}`,
    },
  ];
}
