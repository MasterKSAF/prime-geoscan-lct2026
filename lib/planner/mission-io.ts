import { DOMParser } from '@xmldom/xmldom';
import { MAX_OBSTACLE_MISSION_BYTES } from './obstacle-layer.ts';
import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseAllDocuments,
  stringify,
  visit,
} from 'yaml';
import { migrateScenario, parseMissionDocument } from './mission-schema.ts';
import type { MissionDocument } from './mission-schema.ts';
import { coordinate, parseScenario, polygon } from './schema.ts';
import type { Coordinate, Polygon } from './schema.ts';

import { MAX_MISSION_FILE_BYTES } from './mission-schema.ts';
export { MAX_MISSION_FILE_BYTES } from './mission-schema.ts';
export const MAX_GEOMETRY_FEATURES = 10;
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor', '<<']);

export function checkTextSize(
  text: string,
  limit = MAX_MISSION_FILE_BYTES,
): void {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Файл пуст.');
  if (new TextEncoder().encode(text).length > limit)
    throw new Error(`Размер файла превышает ${Math.round(limit / 1024)} КиБ.`);
}

/** Reject unsafe keys and excessive nesting before schema validation or IDB writes. */
export function assertSafeTree(value: unknown, depth = 0): void {
  if (depth > 24) throw new Error('Вложенность документа превышает 24 уровня.');
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new Error('Числа должны быть конечными.');
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (unsafeKeys.has(key)) throw new Error(`Ключ «${key}» запрещён.`);
      assertSafeTree(item, depth + 1);
    }
  }
}

/** Parse both JSON and YAML through an AST to reject duplicate keys, tags and aliases. */
export function parseStructuredText(
  text: string,
  format: 'auto' | 'json' | 'yaml' = 'auto',
  limit = MAX_MISSION_FILE_BYTES,
): unknown {
  checkTextSize(text, limit);
  const normalized = text.replace(/^\uFEFF/, '');
  const mode =
    format === 'auto'
      ? /^[\s]*[[{]/.test(normalized)
        ? 'json'
        : 'yaml'
      : format;
  if (mode === 'json') {
    try {
      JSON.parse(normalized);
    } catch {
      throw new Error(
        'Некорректный JSON: проверьте кавычки, запятые и скобки.',
      );
    }
  }
  const documents = parseAllDocuments(normalized, {
    uniqueKeys: true,
    strict: true,
    version: '1.2',
    customTags: [],
  });
  if (documents.length !== 1)
    throw new Error('Допускается ровно один YAML-документ.');
  const doc = documents[0];
  if (doc.errors.length || doc.warnings.length)
    throw new Error(
      `Некорректный ${mode.toUpperCase()}: ${[...doc.errors, ...doc.warnings].map((e) => e.message).join('; ')}`,
    );
  visit(doc, (_key, node, path) => {
    if (path.length > 48) throw new Error('Слишком большая вложенность YAML.');
    if (isAlias(node)) throw new Error('YAML-ссылки и алиасы запрещены.');
    if (isScalar(node) || isMap(node) || isSeq(node)) {
      if (node.tag || node.anchor)
        throw new Error('YAML-теги и якоря запрещены.');
    }
    if (isMap(node)) {
      for (const pair of node.items) {
        if (!isScalar(pair.key) || typeof pair.key.value !== 'string')
          throw new Error('Ключи документа должны быть строками.');
        if (unsafeKeys.has(pair.key.value))
          throw new Error(`Ключ «${pair.key.value}» запрещён.`);
      }
    }
  });
  const value: unknown = doc.toJS({ maxAliasCount: 0 });
  assertSafeTree(value);
  return value;
}

export function parseMissionText(
  text: string,
  format: 'auto' | 'json' | 'yaml' = 'auto',
): MissionDocument {
  const value = parseStructuredText(text, format, MAX_OBSTACLE_MISSION_BYTES);
  if (!value || typeof value !== 'object' || !('obstacleLayer' in value))
    checkTextSize(text);
  const document =
    value &&
    typeof value === 'object' &&
    'schemaVersion' in value &&
    value.schemaVersion === '1.0'
      ? migrateScenario(parseScenario(value))
      : parseMissionDocument(value);
  // YAML, legacy migration and short numeric literals can expand on normalization.
  // Accept only documents that retain a lossless, importable JSON representation.
  checkMissionSize(document);
  return document;
}

export function checkMissionSize(document: MissionDocument): void {
  const { obstacleLayer, ...core } = document;
  checkTextSize(JSON.stringify(core));
  checkTextSize(
    JSON.stringify(document),
    obstacleLayer ? MAX_OBSTACLE_MISSION_BYTES : MAX_MISSION_FILE_BYTES,
  );
}

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, ordered((value as Record<string, unknown>)[k])]),
    );
  return value;
}

export function canonicalMissionJson(document: MissionDocument): string {
  assertSafeTree(document);
  return JSON.stringify(ordered(parseMissionDocument(document)));
}

/** Validate a composed mission before committing an import to editor state. */
export function parseSizedMissionDocument(value: unknown): MissionDocument {
  const document = parseMissionDocument(value);
  checkMissionSize(document);
  return document;
}

export function serializeMissionJson(document: MissionDocument): string {
  const compact = canonicalMissionJson(document);
  checkMissionSize(document);
  const pretty = JSON.stringify(JSON.parse(compact), null, 2) + '\n';
  // Whitespace must not prevent saving a document accepted by the import boundary.
  return new TextEncoder().encode(pretty).length <=
    (document.obstacleLayer
      ? MAX_OBSTACLE_MISSION_BYTES
      : MAX_MISSION_FILE_BYTES)
    ? pretty
    : compact;
}

export function serializeMissionYaml(document: MissionDocument): string {
  const compact = canonicalMissionJson(document);
  checkMissionSize(document);
  const text =
    '# PRIME · задача миссии, не команда реальному БВС\n' +
    stringify(JSON.parse(compact), {
      lineWidth: 100,
      aliasDuplicateObjects: false,
      defaultStringType: 'QUOTE_DOUBLE',
      defaultKeyType: 'PLAIN',
    });
  checkTextSize(
    text,
    document.obstacleLayer
      ? MAX_OBSTACLE_MISSION_BYTES
      : MAX_MISSION_FILE_BYTES,
  );
  return text;
}

export async function missionContentHash(
  document: MissionDocument,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalMissionJson(document));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

const markdown = (value: string | number | null | undefined) =>
  String(value ?? 'не задано')
    .replace(/[\\`*_{}[\]<>|#!]/g, '\\$&')
    .replace(/[\r\n]+/g, ' ');

export function missionSummaryMarkdown(document: MissionDocument): string {
  const doc = parseMissionDocument(document);
  // A full normalized JSON appendix makes the human summary auditable, but it is not an import format.
  const scenario = doc.scenario;
  const vehicles = scenario.vehicles;
  return [
    `# Задача: ${markdown(doc.name)}`,
    '',
    '> Модельное планирование. Этот документ не является разрешением или командой на полёт.',
    '',
    `- ID: ${markdown(doc.id)}`,
    `- Версия схемы: ${markdown(doc.schemaVersion)}`,
    `- Окно: ${markdown(doc.window.start)} — ${markdown(doc.window.end)} (${markdown(doc.window.timezone)})`,
    `- Работ: ${doc.jobs.length}; типы: ${[...new Set(doc.jobs.map((j) => j.job.type))].join(', ')}`,
    `- Критерий: ${scenario.objective === 'flightTime' ? 'меньше суммарного налёта' : 'раньше завершить работы'}`,
    `- Доступных БВС: ${vehicles.filter((v) => v.enabled).length} из ${vehicles.length}`,
    `- Резерв: ${markdown(scenario.reservePct)}%`,
    doc.planning.batteryPolicy
      ? '- Батарея каждого БВС: текущий заряд; повторные вылеты на остатке, без прогнозируемой замены.'
      : `- Архивная ресурсная модель; неизвестный ресурс батарей: ${doc.batteries.filter((b) => b.cycles === null).length}`,
    `- Дополнительных ограничений: ${doc.restrictions.length}; постоянных запретов: ${scenario.exclusions.length}`,
    `- Разнесение: ${doc.planning.separationHorizontalM} м по горизонтали, ${doc.planning.separationVerticalM} м по вертикали. Источник: ${markdown(doc.planning.separationSource)}`,
    `- Рельеф: ${doc.terrainModel.kind === 'unknown' ? 'неизвестен' : 'учебная плоскость'}; ${markdown(doc.terrainModel.source)}`,
    `- Ветер: ${scenario.wind.speedMps} м/с, от ${scenario.wind.fromDeg}°. ${doc.weather ? 'Постоянный вектор из максимума сохранённого прогноза Open-Meteo, не динамическая модель.' : 'Постоянный ручной вектор на всё окно.'}`,
    ...(doc.weather
      ? [
          `- Прогноз: Open-Meteo (https://open-meteo.com), CC BY 4.0; получен ${doc.weather.snapshot.fetchedAt}. ${doc.weather.snapshot.points.length} контрольных точек; ветер на опорной высоте ${doc.weather.snapshot.referenceHeightM} м. Снимок и пределы включены в JSON ниже. ${markdown(doc.weather.limits.source)}`,
        ]
      : []),
    ...(doc.environment
      ? [
          `- Облачность: нижняя граница ${markdown(doc.environment.cloudBaseM)} м, запас ${doc.environment.cloudClearanceM} м; видимость ${markdown(doc.environment.visibilityM)} м, минимум ${markdown(doc.environment.minVisibilityM)} м. Источник: ${markdown(doc.environment.source)}. Высоты в общем локальном уровне миссии, не фактическая AGL. Условия постоянны.`,
        ]
      : []),
    '',
    '## Работы',
    '',
    ...doc.jobs.map(
      (j) =>
        `- ${markdown(j.name)}: ${j.job.type}, ${j.job.altitudeM} м, полоса ${j.job.swathM} м. Назначение: ${j.assignedVehicleIds.length ? j.assignedVehicleIds.map(markdown).join(', ') : 'автоматическое'}. Освещение: ${j.daylight === 'none' ? 'не ограничено профилем' : j.daylight === 'topographicClearSky' ? 'топографическая съёмка, ясное небо, Солнце ≥15°' : 'Солнце над горизонтом'}. Параметры ${j.quality.status === 'documented' ? 'документированы' : j.quality.status === 'assumed' ? 'приняты для примера' : 'неизвестны'}: ${markdown(j.quality.source)}`,
    ),
    '',
    '## Примечание оператора',
    '',
    markdown(doc.notes || 'Нет. Комментарий не изменяет расчёт.'),
    '',
    '## БВС и источники параметров',
    '',
    ...vehicles.map(
      (v) =>
        `- ${markdown(v.name)} (${markdown(v.model)}): ${v.enabled ? 'доступен' : 'исключён'}; источник: ${markdown(v.source)}. ${Array.isArray(v.assumptions) ? v.assumptions.map(markdown).join('; ') : ''}`,
    ),
    '',
    '## Полный состав задания',
    '',
    'Для обратного импорта используйте отдельный файл .mission.json или .mission.yaml. Правка этого пересказа не меняет расчёт.',
    '',
    '```json',
    serializeMissionJson(doc).trimEnd().replace(/`/g, '\\u0060'),
    '```',
    '',
  ].join('\n');
}

export type GeometryRole =
  | 'area'
  | 'airspace'
  | 'exclusion'
  | 'obstacle'
  | 'start'
  | 'landing'
  | 'reserve';
export type ImportedGeometryFeature = {
  name: string;
  sourceId?: string;
  partIndex?: number;
  geometry: Polygon | { type: 'Point'; coordinates: Coordinate };
};
export type GeometryImportResult = {
  role: GeometryRole;
  features: ImportedGeometryFeature[];
  warnings: string[];
};

function closedPolygon(input: unknown): Polygon {
  const result = polygon.parse(input);
  for (const [index, ring] of result.coordinates.entries()) {
    const first = ring[0],
      last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1])
      throw new Error(
        `Кольцо ${index + 1} не замкнуто. Повторите первую координату в конце.`,
      );
    if (new Set(ring.slice(0, -1).map((p) => p.join(','))).size < 3)
      throw new Error('Полигон должен содержать не менее трёх разных вершин.');
  }
  return result;
}

function geometryResult(
  role: GeometryRole,
  features: ImportedGeometryFeature[],
  warnings: string[],
): GeometryImportResult {
  if (
    ![
      'area',
      'airspace',
      'exclusion',
      'obstacle',
      'start',
      'landing',
      'reserve',
    ].includes(role)
  )
    throw new Error('Неизвестное назначение слоя.');
  const limit =
    role === 'area'
      ? 8
      : role === 'obstacle'
        ? 20
        : role === 'exclusion'
          ? 5
          : role === 'reserve'
            ? 10
            : 1;
  if (!features.length || features.length > limit)
    throw new Error(
      `Для слоя «${role}» допустимо от 1 до ${limit} объектов. Несколько областей пока не поддержаны; ни один объект не загружен.`,
    );
  const expected = ['area', 'airspace', 'exclusion', 'obstacle'].includes(role)
    ? 'Polygon'
    : 'Point';
  if (features.some((f) => f.geometry.type !== expected))
    throw new Error(
      `Для слоя «${role}» требуется ${expected}. Смешанные типы не импортированы.`,
    );
  return { role, features, warnings: [...new Set(warnings)] };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label}: ожидался объект.`);
  return value as Record<string, unknown>;
}

function importGeoJSON(text: string, role: GeometryRole): GeometryImportResult {
  const root = record(parseStructuredText(text, 'json'), 'GeoJSON');
  if ('crs' in root)
    throw new Error(
      'GeoJSON с crs не поддержан. Экспортируйте WGS84 longitude/latitude по RFC 7946.',
    );
  const items = root.type === 'FeatureCollection' ? root.features : [root];
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.length > MAX_GEOMETRY_FEATURES
  )
    throw new Error('GeoJSON: допустимо от 1 до 10 объектов.');
  const warnings: string[] = [];
  const features = items.flatMap((input, index): ImportedGeometryFeature[] => {
    const item = record(input, `Объект ${index + 1}`);
    if ('crs' in item)
      throw new Error(`Объект ${index + 1}: crs не поддержан.`);
    const geo = record(
      item.type === 'Feature' ? item.geometry : item,
      `Геометрия ${index + 1}`,
    );
    if (
      geo.type !== 'Polygon' &&
      geo.type !== 'Point' &&
      geo.type !== 'MultiPolygon'
    )
      throw new Error(
        `Объект ${index + 1}: тип ${String(geo.type)} пока не поддержан. Линии и коллекции не преобразуются с потерями.`,
      );
    if (
      Object.keys(geo).some((k) => !['type', 'coordinates', 'bbox'].includes(k))
    )
      throw new Error(`Геометрия ${index + 1}: неизвестные поля.`);
    const props =
      item.properties == null
        ? {}
        : record(item.properties, `Свойства ${index + 1}`);
    if (Object.keys(props).some((k) => k !== 'name'))
      warnings.push(
        'Свойства GeoJSON кроме name не задают правила миссии и не перенесены. Проверьте ограничения отдельно перед подтверждением.',
      );
    const name =
      typeof props.name === 'string'
        ? props.name.slice(0, 100)
        : `Объект ${index + 1}`;
    const sourceId =
      typeof item.id === 'string' || typeof item.id === 'number'
        ? String(item.id)
        : `feature-${index + 1}`;
    if (geo.type === 'MultiPolygon') {
      if (
        !Array.isArray(geo.coordinates) ||
        !geo.coordinates.length ||
        geo.coordinates.length > 8
      )
        throw new Error('MultiPolygon должен содержать от 1 до 8 полигонов.');
      warnings.push(
        'MultiPolygon разделён на отдельные Polygon с общим sourceId и номером части. Все части и отверстия сохранены.',
      );
      return geo.coordinates.map((coords, partIndex) => ({
        name: `${name} · часть ${partIndex + 1}`,
        sourceId,
        partIndex,
        geometry: closedPolygon({ type: 'Polygon', coordinates: coords }),
      }));
    }
    return [
      {
        name,
        sourceId,
        geometry:
          geo.type === 'Point'
            ? { type: 'Point', coordinates: coordinate.parse(geo.coordinates) }
            : closedPolygon({ type: 'Polygon', coordinates: geo.coordinates }),
      },
    ];
  });
  warnings.push(
    'Импортируется только 2D-геометрия WGS84. Высоты, расписание и допуски задаются отдельно; топология дополнительно проверяется расчётным ядром.',
  );
  return geometryResult(role, features, warnings);
}

type XmlElement = ReturnType<DOMParser['parseFromString']>['documentElement'];
function childrenByName(
  node: NonNullable<XmlElement>,
  name: string,
): NonNullable<XmlElement>[] {
  return Array.from(node.childNodes).filter(
    (child): child is NonNullable<XmlElement> =>
      child.nodeType === 1 &&
      (child as NonNullable<XmlElement>).localName === name,
  );
}
function descendants(
  node: NonNullable<XmlElement>,
  name: string,
): NonNullable<XmlElement>[] {
  return Array.from(node.getElementsByTagName('*')).filter(
    (el) => el.localName === name,
  );
}
function oneChild(
  node: NonNullable<XmlElement>,
  name: string,
): NonNullable<XmlElement> {
  const found = childrenByName(node, name);
  if (found.length !== 1)
    throw new Error(`KML: нужен ровно один элемент ${name}.`);
  return found[0];
}
function kmlCoordinates(node: NonNullable<XmlElement>): Coordinate[] {
  const text = oneChild(node, 'coordinates').textContent?.trim() ?? '';
  if (!text) throw new Error('KML: пустые координаты.');
  return text.split(/\s+/).map((tuple) => {
    const parts = tuple.split(',');
    if (
      parts.length < 2 ||
      parts.length > 3 ||
      parts.some(
        (n) => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(n),
      )
    )
      throw new Error('KML: координаты должны быть числовыми lon,lat[,0].');
    if (parts.length === 3 && Number(parts[2]) !== 0)
      throw new Error(
        'KML: ненулевые высоты не поддержаны в 2D-импорте; высота не будет молча отброшена.',
      );
    return coordinate.parse(parts.slice(0, 2).map(Number));
  });
}

function importKML(text: string, role: GeometryRole): GeometryImportResult {
  checkTextSize(text);
  if (/<\?xml-stylesheet\b/i.test(text))
    throw new Error('KML: внешние таблицы стилей запрещены.');
  if (
    /<!\s*(?:DOCTYPE|ENTITY)/i.test(text) ||
    /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-f]+;)/i.test(text)
  )
    throw new Error(
      'KML: DTD, внешние и пользовательские XML-сущности запрещены.',
    );
  const errors: string[] = [];
  const xml = new DOMParser({
    onError: (level, message) => {
      errors.push(`${level}: ${message}`);
    },
  }).parseFromString(text, 'application/xml');
  if (errors.length || !xml.documentElement)
    throw new Error(`Некорректный XML KML: ${errors.join('; ')}`);
  const root = xml.documentElement;
  if (
    root.localName !== 'kml' ||
    (root.namespaceURI &&
      root.namespaceURI !== 'http://www.opengis.net/kml/2.2')
  )
    throw new Error('Ожидался KML 2.2.');
  const all = [root, ...Array.from(root.getElementsByTagName('*'))];
  if (all.length > 2000)
    throw new Error('KML: превышен лимит 2000 XML-элементов.');
  const forbidden = new Set([
    'NetworkLink',
    'Link',
    'Url',
    'href',
    'GroundOverlay',
    'ScreenOverlay',
    'PhotoOverlay',
    'Model',
    'Track',
    'MultiTrack',
    'LineString',
    'GeometryCollection',
  ]);
  for (const node of all) {
    let depth = 0;
    for (let parent = node.parentNode; parent; parent = parent.parentNode) {
      if (++depth > 32)
        throw new Error('KML: вложенность превышает 32 уровня.');
    }
    if (
      Array.from(node.attributes).some((attribute) =>
        ['href', 'src'].includes(attribute.localName ?? ''),
      )
    )
      throw new Error('KML: атрибуты внешних ссылок href/src запрещены.');
    if (
      node.localName === 'styleUrl' &&
      !node.textContent?.trim().startsWith('#')
    )
      throw new Error('KML: внешние ссылки styleUrl запрещены.');
    if (forbidden.has(node.localName ?? ''))
      throw new Error(
        `KML: ${node.localName} не поддержан; внешние ресурсы и неподдержанные геометрии не загружаются.`,
      );
    if (
      node.namespaceURI &&
      node.namespaceURI !== 'http://www.opengis.net/kml/2.2'
    )
      throw new Error(`KML: расширение ${node.namespaceURI} не поддержано.`);
    if (
      node.localName === 'altitudeMode' &&
      node.textContent?.trim() !== 'clampToGround'
    )
      throw new Error(
        'KML: поддержан только clampToGround; абсолютные/относительные высоты требуют отдельного адаптера.',
      );
    if (node.localName === 'extrude' && node.textContent?.trim() !== '0')
      throw new Error('KML: объёмная экструзия пока не поддержана.');
  }
  const placemarks = descendants(root, 'Placemark');
  if (!placemarks.length || placemarks.length > MAX_GEOMETRY_FEATURES)
    throw new Error('KML: допустимо от 1 до 10 Placemark.');
  const features = placemarks.flatMap(
    (item, index): ImportedGeometryFeature[] => {
      const direct = [
        ...childrenByName(item, 'Polygon'),
        ...childrenByName(item, 'Point'),
        ...childrenByName(item, 'MultiGeometry'),
      ];
      if (direct.length !== 1)
        throw new Error(
          `KML Placemark ${index + 1}: требуется одна Polygon, Point или MultiGeometry; пустые объекты не пропускаются.`,
        );
      const collect = (
        element: NonNullable<XmlElement>,
        depth = 0,
      ): NonNullable<XmlElement>[] => {
        if (depth > 8) throw new Error('KML: слишком вложенная MultiGeometry.');
        if (element.localName !== 'MultiGeometry') return [element];
        const children = Array.from(element.childNodes).filter(
          (child): child is NonNullable<XmlElement> => child.nodeType === 1,
        );
        if (
          !children.length ||
          children.some(
            (child) =>
              !['Polygon', 'Point', 'MultiGeometry'].includes(
                child.localName ?? '',
              ),
          )
        )
          throw new Error(
            'KML MultiGeometry: поддержаны только Polygon и Point; пустые и неизвестные элементы запрещены.',
          );
        return children.flatMap((child) => collect(child, depth + 1));
      };
      const geometries = collect(direct[0]);
      const name =
        childrenByName(item, 'name')[0]?.textContent?.slice(0, 100) ||
        `Объект ${index + 1}`;
      const sourceId = item.getAttribute('id') || `placemark-${index + 1}`;
      return geometries.map((geo, partIndex): ImportedGeometryFeature => {
        const meta = {
          name:
            geometries.length > 1 ? `${name} · часть ${partIndex + 1}` : name,
          sourceId,
          ...(geometries.length > 1 ? { partIndex } : {}),
        };
        if (geo.localName === 'Point') {
          const coords = kmlCoordinates(geo);
          if (coords.length !== 1)
            throw new Error('KML Point: требуется ровно одна координата.');
          return {
            ...meta,
            geometry: { type: 'Point', coordinates: coords[0] },
          };
        }
        const outer = oneChild(geo, 'outerBoundaryIs');
        const rings = [outer, ...childrenByName(geo, 'innerBoundaryIs')].map(
          (boundary) => kmlCoordinates(oneChild(boundary, 'LinearRing')),
        );
        return {
          ...meta,
          geometry: closedPolygon({ type: 'Polygon', coordinates: rings }),
        };
      });
    },
  );
  const sourceGeometryCount = all.filter(
    (node) => node.localName === 'Point' || node.localName === 'Polygon',
  ).length;
  if (sourceGeometryCount !== features.length)
    throw new Error(
      'KML содержит геометрию вне поддержанной структуры Placemark. Ничего не загружено.',
    );
  return geometryResult(role, features, [
    'Импортирована только 2D-геометрия WGS84. Стили, описания и метаданные KML не становятся ограничениями миссии; высоты и время задаются отдельно. Топология проверяется ядром.',
  ]);
}

export function importGeometryText(
  text: string,
  format: 'geojson' | 'kml',
  role: GeometryRole,
): GeometryImportResult {
  if (format === 'geojson') return importGeoJSON(text, role);
  if (format === 'kml') return importKML(text, role);
  throw new Error('Поддержаны только GeoJSON и KML.');
}
