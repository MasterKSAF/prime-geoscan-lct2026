import { z } from 'zod';
import {
  missionDocumentSchema,
  parseMissionDocument,
  MAX_MISSION_FILE_BYTES,
} from './mission-schema.ts';
import type { MissionDocument, MissionRestriction } from './mission-schema.ts';
import {
  checkTextSize,
  checkMissionSize,
  importGeometryText,
  parseStructuredText,
} from './mission-io.ts';

const layerSchema = z
  .object({
    type: z.literal('prime-restrictions'),
    schemaVersion: z.literal('1.0'),
    altitudeReference: z.literal('mission-reference'),
    source: z.string().min(1).max(500),
    restrictions: missionDocumentSchema.shape.restrictions,
  })
  .strict();
export type RestrictionLayer = z.infer<typeof layerSchema>;

export function parseRestrictionLayer(text: string): RestrictionLayer {
  checkTextSize(text);
  const layer = layerSchema.parse(parseStructuredText(text, 'json'));
  const ids = new Set<string>();
  for (const item of layer.restrictions) {
    if (ids.has(item.id)) throw new Error(`Слой: повторён ID ${item.id}.`);
    ids.add(item.id);
    if (item.maxAltitudeM !== null && item.maxAltitudeM < item.minAltitudeM)
      throw new Error(`${item.id}: верхняя высота ниже нижней.`);
    if (
      (item.startAt === null) !== (item.endAt === null) ||
      (item.startAt &&
        item.endAt &&
        Date.parse(item.endAt) <= Date.parse(item.startAt))
    )
      throw new Error(
        `${item.id}: задайте обе границы положительного интервала времени.`,
      );
    // Shared geometry parser checks closure and bounded WGS84 coordinates;
    // the solver additionally validates topology before accepting any route.
    importGeometryText(JSON.stringify(item.geometry), 'geojson', 'area');
  }
  return layer;
}

export function serializeRestrictionLayer(document: MissionDocument): string {
  const d = parseMissionDocument(document);
  const layer: RestrictionLayer = {
    type: 'prime-restrictions',
    schemaVersion: '1.0',
    altitudeReference: 'mission-reference',
    source: `Ограничения миссии ${d.id}. Высоты в общем локальном уровне миссии; не WGS84/AMSL и не DEM.`,
    restrictions: d.restrictions,
  };
  const compact = JSON.stringify(layer),
    pretty = JSON.stringify(layer, null, 2);
  parseRestrictionLayer(compact);
  return new TextEncoder().encode(pretty).length <= MAX_MISSION_FILE_BYTES
    ? pretty
    : compact;
}

export function appendRestrictionLayer(
  document: MissionDocument,
  layer: RestrictionLayer,
): MissionDocument {
  const checked = parseRestrictionLayer(JSON.stringify(layer));
  if (document.restrictions.length + checked.restrictions.length > 20)
    throw new Error(
      'После импорта получится более 20 объёмов. Ничего не добавлено.',
    );
  const ids = new Set(document.restrictions.map((r) => r.id));
  for (const r of checked.restrictions)
    if (ids.has(r.id))
      throw new Error(
        `ID ограничения ${r.id} уже существует. Измените ID в файле; существующие объёмы не перезаписаны.`,
      );
  const next = parseMissionDocument({
    ...document,
    restrictions: [...document.restrictions, ...checked.restrictions],
  });
  checkMissionSize(next);
  return next;
}

/** Explicit extruded volumes, not interpolation of real terrain elevations. */
export function restrictionFromPolygon(
  geometry: MissionRestriction['geometry'],
  id: string,
  name: string,
  maxAltitudeM: number | null,
  source: string,
): MissionRestriction {
  return missionDocumentSchema.shape.restrictions.element.parse({
    id,
    name,
    geometry,
    kind: 'obstacle',
    minAltitudeM: 0,
    maxAltitudeM,
    startAt: null,
    endAt: null,
    source,
  });
}
