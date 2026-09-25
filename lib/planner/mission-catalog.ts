import { DOMParser } from '@xmldom/xmldom';
import clipping from 'polygon-clipping';
import { z } from 'zod';
import { polygon } from './schema.ts';
import type { Polygon } from './schema.ts';
import type { MissionDocument, MissionRestriction } from './mission-schema.ts';
import { validatePolygonTopology } from './geometry.ts';
import {
  boundsOverlap,
  coordinateBounds,
  expandedBounds,
} from './obstacle-layer.ts';
import type { Bounds } from './obstacle-layer.ts';
import {
  parseZoneAltitude,
  resolveZoneAltitude,
  type ParsedZoneAltitude,
  type AirspaceAltitudeContext,
} from './airspace-altitudes.ts';

const instant = z.iso.datetime({ offset: true });
export const zoneRuleSchema = z
  .object({
    objectId: z.string().min(1).max(80),
    altitudeReference: z.enum([
      'AGL',
      'AMSL',
      'FL',
      'mission-reference',
      'unknown',
    ]),
    min: z.number().min(-500).max(60000).nullable(),
    max: z.number().min(-500).max(60000).nullable(),
    timePolicy: z.enum(['always', 'interval', 'unknown']),
    startAt: instant.nullable(),
    endAt: instant.nullable(),
    basis: z.enum(['operator', 'simulation']),
    source: z.string().min(1).max(500),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.min !== null && r.max !== null && r.min > r.max)
      ctx.addIssue({ code: 'custom', message: 'Нижняя высота выше верхней.' });
    if (
      r.timePolicy === 'interval' &&
      (!r.startAt || !r.endAt || Date.parse(r.endAt) <= Date.parse(r.startAt))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Нужен положительный интервал времени с часовым поясом.',
      });
    if (r.timePolicy !== 'interval' && (r.startAt || r.endAt))
      ctx.addIssue({
        code: 'custom',
        message: 'Даты допустимы только при timePolicy=interval.',
      });
  });
export const catalogSourceSchema = z
  .object({
    version: z.literal('geoscan-mission-catalog/1'),
    role: z.enum(['areas', 'restrictions']),
    filename: z.string().min(1).max(160),
    sourceText: z
      .string()
      .min(1)
      .max(4 * 1024 * 1024),
    selectedIds: z.array(z.string().min(1).max(80)).max(8),
    rules: z.array(zoneRuleSchema).max(1000),
  })
  .strict();
export type CatalogSource = z.infer<typeof catalogSourceSchema>;
export type CatalogObject = {
  id: string;
  sourceId: string;
  name: string;
  geometry: Polygon | null;
  bounds: Bounds | null;
  fields: Record<string, string>;
  description: string;
  time: {
    policy: 'always' | 'interval' | 'unknown';
    startAt: string | null;
    endAt: string | null;
    raw: string;
  };
  error?: string;
  warnings: string[];
  editable: boolean;
};
export type MissionCatalog = {
  total: number;
  accepted: number;
  rejected: number;
  objects: CatalogObject[];
  warnings: string[];
};
const cache = new Map<string, MissionCatalog>();

/** Bounded, offline XML parsing. No lossy simplification, external links or HTML execution. */
export function parseMissionCatalog(text: string): MissionCatalog {
  const cached = cache.get(text);
  if (cached) return cached;
  if (new TextEncoder().encode(text).length > 4 * 1024 * 1024 || !text.trim())
    throw new Error('Каталог KML: нужен файл до 4 МиБ.');
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(text))
    throw new Error('Внешние сущности KML запрещены.');
  if ((text.match(/</g) ?? []).length > 160000)
    throw new Error('Слишком сложный XML.');
  const errors: string[] = [],
    warnings: string[] = [];
  const xml = new DOMParser({
    onError: (level, msg) =>
      (level === 'warning' ? warnings : errors).push(msg),
  }).parseFromString(text, 'application/xml');
  if (errors.length || xml.documentElement?.localName !== 'kml')
    throw new Error('Некорректный XML/KML каталога.');
  let count = 0;
  const walk = (el: Element, depth: number) => {
    if (++count > 80000 || depth > 24)
      throw new Error('Превышена сложность KML.');
    if (
      [
        'NetworkLink',
        'Model',
        'GroundOverlay',
        'PhotoOverlay',
        'ScreenOverlay',
      ].includes(el.localName)
    )
      throw new Error('Внешние ресурсы KML не поддерживаются.');
    for (let n = el.firstChild; n; n = n.nextSibling)
      if (n.nodeType === 1) walk(n as Element, depth + 1);
  };
  walk(xml.documentElement as unknown as Element, 0);
  const nodes = Array.from(xml.getElementsByTagNameNS('*', 'Placemark'));
  if (!nodes.length || nodes.length > 1000)
    throw new Error('Каталог должен содержать от 1 до 1000 объектов.');
  let coordinates = 0,
    topologyPairs = 0;
  const objects = nodes.map((n, i): CatalogObject => {
    const field = (tag: string) =>
      n.getElementsByTagNameNS('*', tag)[0]?.textContent?.trim() ?? '';
    const fields = Object.fromEntries(
      ['Data', 'SimpleData'].flatMap((tag) =>
        Array.from(n.getElementsByTagNameNS('*', tag)).map((e) => [
          e.getAttribute('name') ?? '',
          e.textContent?.trim() ?? '',
        ]),
      ),
    );
    const o: CatalogObject = {
      id: `item-${i + 1}`,
      sourceId: n.getAttribute('id') ?? '',
      name: (field('name') || fields.Name || `Участок ${i + 1}`).slice(0, 100),
      geometry: null,
      bounds: null,
      fields,
      description: field('description'),
      time: catalogTime(n, fields.Type ?? ''),
      warnings: [],
      editable: false,
    };
    try {
      const polygons = n.getElementsByTagNameNS('*', 'Polygon');
      if (
        polygons.length !== 1 ||
        n.getElementsByTagNameNS('*', 'LineString').length ||
        n.getElementsByTagNameNS('*', 'Point').length
      )
        throw new Error(
          'Нужен один полигон, в том числе внутри MultiGeometry.',
        );
      const rings = Array.from(
        polygons[0].getElementsByTagNameNS('*', 'coordinates'),
      ).map((el) => {
        const raw = (el.textContent ?? '').trim().split(/\s+/);
        coordinates += raw.length;
        if (coordinates > 100000 || raw.length > 5000)
          throw new Error('Превышен предел координат.');
        const ring = raw.map((s): [number, number] => {
          const parts = s.split(',');
          if (parts.some((p) => !p.trim()))
            throw new Error('Пустая координата.');
          const c = parts.map(Number);
          if (
            c.length < 2 ||
            c.length > 3 ||
            c.some((v) => !Number.isFinite(v)) ||
            Math.abs(c[0]) > 180 ||
            Math.abs(c[1]) > 70
          )
            throw new Error('Некорректная координата.');
          return [c[0], c[1]];
        });
        if (ring.length < 3) throw new Error('Недостаточно вершин.');
        if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) {
          ring.push([...ring[0]]);
          o.warnings.push('Кольцо замкнуто копией первой точки.');
        }
        return ring;
      });
      o.geometry = { type: 'Polygon', coordinates: rings };
      o.bounds = coordinateBounds(rings.flat());
      topologyPairs += rings.reduce(
        (sum, ring) => sum + (ring.length * ring.length) / 2,
        0,
      );
      if (topologyPairs > 20000000)
        throw new Error('Превышен бюджет проверки геометрии каталога.');
      validatePolygonTopology(o.geometry, 5000);
      if (Object.values(fields).some((s) => /Некорректная геометрия/i.test(s)))
        o.warnings.push(
          'Источник содержит пометку о геометрии; топология проверена отдельно.',
        );
      o.editable = polygon.safeParse(o.geometry).success;
    } catch (error) {
      o.error = error instanceof Error ? error.message : String(error);
    }
    return o;
  });
  if (coordinates > 100000)
    throw new Error('Каталог превышает 100 000 координат.');
  const result = {
    total: objects.length,
    accepted: objects.filter((o) => !o.error).length,
    rejected: objects.filter((o) => o.error).length,
    objects,
    warnings,
  };
  if (cache.size >= 4) cache.delete(cache.keys().next().value!);
  cache.set(text, result);
  return result;
}

function catalogTime(
  n: {
    getElementsByTagNameNS: (
      ns: string,
      tag: string,
    ) => ArrayLike<{ textContent: string | null }>;
  },
  type: string,
): CatalogObject['time'] {
  const spans = Array.from(n.getElementsByTagNameNS('*', 'TimeSpan'));
  const stamps = Array.from(n.getElementsByTagNameNS('*', 'TimeStamp'));
  const begin =
    Array.from(
      n.getElementsByTagNameNS('*', 'begin'),
    )[0]?.textContent?.trim() ?? '';
  const end =
    Array.from(n.getElementsByTagNameNS('*', 'end'))[0]?.textContent?.trim() ??
    '';
  if (spans.length || stamps.length) {
    const valid =
      spans.length === 1 &&
      !stamps.length &&
      instant.safeParse(begin).success &&
      instant.safeParse(end).success &&
      Date.parse(end) > Date.parse(begin);
    return {
      policy: valid ? 'interval' : 'unknown',
      startAt: valid ? begin : null,
      endAt: valid ? end : null,
      raw: `TimeSpan: ${begin} — ${end}${stamps.length ? '; TimeStamp' : ''}`,
    };
  }
  // Temporary is not inactive. A missing schedule stays conservative, but is never labelled permanent.
  return {
    policy: ['пост_ограничение', 'запретная_зона'].includes(type)
      ? 'always'
      : 'unknown',
    startAt: null,
    endAt: null,
    raw: type,
  };
}

export function normalizedZone(
  source: CatalogSource,
  object: CatalogObject,
  d: AirspaceAltitudeContext,
) {
  const rule = source.rules.find((r) => r.objectId === object.id);
  const raw = object.fields.Altitudes ?? object.description;
  const fromSource = parseZoneAltitude(raw);
  const parsed: ParsedZoneAltitude = rule
    ? {
        ...fromSource,
        status: rule.altitudeReference === 'unknown' ? 'unresolved' : 'parsed',
        lower: { reference: rule.altitudeReference, value: rule.min },
        upper: {
          reference: rule.max === null ? 'unlimited' : rule.altitudeReference,
          value: rule.max,
        },
      }
    : fromSource;
  const resolved = resolveZoneAltitude(parsed, d);
  const datum =
    parsed.lower.reference === 'ground'
      ? parsed.upper.reference
      : parsed.lower.reference;
  const time = rule
    ? {
        policy: rule.timePolicy,
        startAt: rule.startAt,
        endAt: rule.endAt,
        raw: rule.source,
      }
    : object.time;
  return {
    objectId: object.id,
    name: object.name,
    sourceType: object.fields.Type ?? 'unknown',
    altitude: {
      reference: datum,
      min: parsed.lower.value,
      max: parsed.upper.value,
      lower: parsed.lower,
      upper: parsed.upper,
      units:
        parsed.lower.reference !== parsed.upper.reference
          ? 'per-bound'
          : datum === 'FL'
            ? 'flight-level'
            : 'metres',
      raw,
      policy: resolved.resolved
        ? 'declared-datum'
        : resolved.minAltitudeM > -500 || resolved.maxAltitudeM !== null
          ? 'partially-resolved'
          : 'all-altitudes',
      conversion: resolved.conversion,
      conditions: parsed.conditions,
      warnings: parsed.warnings,
    },
    time,
    basis:
      rule?.basis ??
      (parsed.status === 'parsed' ? 'source-altitudes' : 'conservative-source'),
    source: rule?.source ?? source.filename,
    effective: {
      minAltitudeM: resolved.minAltitudeM,
      maxAltitudeM: resolved.maxAltitudeM,
      startAt: time.policy === 'interval' ? time.startAt : null,
      endAt: time.policy === 'interval' ? time.endAt : null,
    },
  };
}

export type AppliedMissionRestriction = MissionRestriction & {
  catalog?: {
    objectId: string;
    filename: string;
    rawAltitude: string;
    timePolicy: 'always' | 'interval' | 'unknown';
    altitudePolicy: string;
    model: string;
    conditions: string;
  };
};
const volumesCache = new Map<string, AppliedMissionRestriction[]>();
/** Use every intersecting zone, never a UI selection as permission to ignore zones. */
export function catalogRestrictions(
  d: MissionDocument,
): AppliedMissionRestriction[] {
  const sources =
    d.catalogLayers?.filter((s) => s.role === 'restrictions') ?? [];
  if (!sources.length) return [];
  const key = JSON.stringify([
    sources,
    d.scenario.airspace,
    d.terrainModel,
    d.airspaceAltitudeReference,
  ]);
  const hit = volumesCache.get(key);
  if (hit) return hit;
  const bounds = expandedBounds(
    coordinateBounds(d.scenario.airspace.coordinates.flat()),
    200,
  );
  const [w, s, e, n] = bounds;
  const clip: Polygon['coordinates'] = [
    [
      [w, s],
      [e, s],
      [e, n],
      [w, n],
      [w, s],
    ],
  ];
  const output: AppliedMissionRestriction[] = [];
  for (const [index, source] of sources.entries()) {
    const catalog = parseMissionCatalog(source.sourceText);
    for (const object of catalog.objects) {
      if (object.bounds && !boundsOverlap(object.bounds, bounds)) continue;
      if (object.error || !object.geometry)
        throw new Error(
          `Зона ${object.name}: ${object.error ?? 'нет геометрии'}. Расчёт остановлен.`,
        );
      const parts = clipping.intersection(object.geometry.coordinates, clip);
      if (!parts.length) continue;
      const normalized = normalizedZone(source, object, d);
      for (const [part, coordinates] of parts.entries()) {
        const geometry = { type: 'Polygon' as const, coordinates };
        if (!polygon.safeParse(geometry).success)
          throw new Error(
            `Зона ${object.name}: сложный контур; уменьшите область полёта. Геометрия не упрощена.`,
          );
        output.push({
          id: `catalog-${index}-${object.id}-${part}`,
          name: object.name,
          kind: 'noFlight',
          geometry,
          ...normalized.effective,
          catalog: {
            objectId: object.id,
            filename: source.filename,
            rawAltitude:
              normalized.altitude.raw.split(/\r?\n/)[0].trim() ||
              'Диапазон высот не указан',
            timePolicy: normalized.time.policy,
            altitudePolicy: normalized.altitude.policy,
            model: normalized.altitude.conversion.atmosphere?.source ?? '',
            conditions: normalized.altitude.conditions,
          },
          source:
            `${source.filename}; ${object.id}; ${normalized.basis}; высоты: ${normalized.altitude.policy}; время: ${normalized.time.policy}`.slice(
              0,
              500,
            ),
        });
      }
    }
  }
  if (output.length > 80)
    throw new Error(
      'В области больше 80 зон ограничений. Сократите область полёта.',
    );
  if (volumesCache.size >= 3)
    volumesCache.delete(volumesCache.keys().next().value!);
  volumesCache.set(key, output);
  return output;
}
export const effectiveMissionRestrictions = (
  d: MissionDocument,
): AppliedMissionRestriction[] => [
  ...d.restrictions,
  ...catalogRestrictions(d),
];

/** Broad phase only. Final decisions always intersect the complete 4D segment. */
export function restrictionsInEnvelope(
  d: MissionDocument,
  low: number,
  high: number,
  startSec = 0,
  endSec = (Date.parse(d.window.end) - Date.parse(d.window.start)) / 1000,
) {
  const epoch = Date.parse(d.window.start);
  const guard = d.planning.safetyPolicy ? d.planning.temporalBufferSec : 0;
  return effectiveMissionRestrictions(d).filter(
    (r) =>
      high >= r.minAltitudeM - d.scenario.clearanceM &&
      low <= (r.maxAltitudeM ?? Infinity) + d.scenario.clearanceM &&
      (r.endAt === null ||
        (Date.parse(r.endAt) - epoch) / 1000 + guard >= startSec) &&
      (r.startAt === null ||
        (Date.parse(r.startAt) - epoch) / 1000 - guard <= endSec),
  );
}

export function restrictionMapLabel(
  r: AppliedMissionRestriction,
  altitude: number,
  missionTime: number,
  knownTimeActive?: boolean,
) {
  const outsideAltitude =
    altitude < r.minAltitudeM || altitude > (r.maxAltitudeM ?? Infinity);
  const outsideTime =
    !!r.startAt &&
    (knownTimeActive !== undefined
      ? !knownTimeActive
      : Number.isFinite(missionTime) &&
        (missionTime < Date.parse(r.startAt) ||
          missionTime > Date.parse(r.endAt!)));
  const timing =
    r.catalog?.timePolicy === 'unknown'
      ? 'расписания нет — учитывается весь период миссии'
      : r.startAt
        ? outsideTime
          ? 'вне указанного времени действия'
          : `интервал ${r.startAt} — ${r.endAt}`
        : 'постоянное ограничение';
  const heights =
    r.catalog?.rawAltitude ??
    `${r.minAltitudeM}–${r.maxAltitudeM ?? 'без верхней границы'} м от поверхности модели`;
  return {
    relevant: !outsideAltitude && !outsideTime,
    text: `${r.name}: ${heights}. ${timing}. ${outsideAltitude ? 'Высота текущей работы вне этого слоя; взлёт и посадка проверяются отдельно.' : 'Затрагивает высоту текущей работы.'}${r.catalog?.altitudePolicy === 'all-altitudes' ? ' Высоты не разобраны — консервативно закрыт весь столб.' : ''}${r.catalog?.model ? ` Пересчёт: ${r.catalog.model}` : ''}${r.catalog?.conditions ? ' В источнике есть особые условия; автоматические исключения не применены.' : ''} Источник: ${r.catalog?.filename ?? r.source}`,
  };
}

export function checkCatalogSources(layers: CatalogSource[]) {
  if (new Set(layers.map((s) => s.role)).size !== layers.length)
    throw new Error('Допустим один каталог каждого назначения.');
  for (const source of layers) {
    const catalog = parseMissionCatalog(source.sourceText);
    if (
      new Set(source.rules.map((r) => r.objectId)).size !== source.rules.length
    )
      throw new Error('Повторён ID правила зоны.');
    if (source.role === 'areas' && source.rules.length)
      throw new Error('Правила ограничений не применяются к участкам съёмки.');
    if (source.role === 'restrictions' && source.selectedIds.length)
      throw new Error(
        'Зоны учитываются целиком, выборочное отключение не допускается.',
      );
    for (const id of [
      ...source.selectedIds,
      ...source.rules.map((r) => r.objectId),
    ])
      if (!catalog.objects.some((o) => o.id === id))
        throw new Error(`Нет объекта каталога ${id}.`);
  }
}
