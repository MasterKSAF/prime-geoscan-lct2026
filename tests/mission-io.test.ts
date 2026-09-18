import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoScenario } from '../lib/planner/demo.ts';
import { migrateScenario } from '../lib/planner/mission-schema.ts';
import {
  MAX_MISSION_FILE_BYTES,
  canonicalMissionJson,
  importGeometryText,
  missionContentHash,
  missionSummaryMarkdown,
  parseMissionText,
  parseStructuredText,
  serializeMissionJson,
  serializeMissionYaml,
} from '../lib/planner/mission-io.ts';

const mission = () => migrateScenario(demoScenario(), 'io-test');
const ring = [
  [30, 60],
  [30.01, 60],
  [30.01, 60.01],
  [30, 60.01],
  [30, 60],
];
const hole = [
  [30.002, 60.002],
  [30.002, 60.003],
  [30.003, 60.003],
  [30.003, 60.002],
  [30.002, 60.002],
];
const kml = (geometry: string) =>
  `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark id="source-site"><name>Участок &amp; точка</name>${geometry}</Placemark></Document></kml>`;
const kmlRing = (coords: number[][]) =>
  `<LinearRing><coordinates>${coords.map((p) => `${p.join(',')},0`).join(' ')}</coordinates></LinearRing>`;
const kmlPolygon = `<Polygon><outerBoundaryIs>${kmlRing(ring)}</outerBoundaryIs><innerBoundaryIs>${kmlRing(hole)}</innerBoundaryIs></Polygon>`;

void test('mission JSON/YAML round trip preserves normalized fields and canonical SHA-256', async () => {
  const original = mission();
  original.notes =
    'Русский текст, # комментарий, кавычки "", двоеточие: и <html>';
  const json = parseMissionText(serializeMissionJson(original), 'json');
  const yaml = parseMissionText(serializeMissionYaml(original), 'yaml');
  assert.deepEqual(json, original);
  assert.deepEqual(yaml, original);
  assert.equal(await missionContentHash(json), await missionContentHash(yaml));
  assert.match(await missionContentHash(json), /^[a-f0-9]{64}$/);
});

void test('mission hash ignores object key order, not semantic changes', async () => {
  const doc = mission();
  const reordered = Object.fromEntries(
    Object.entries(doc).reverse(),
  ) as typeof doc;
  assert.equal(canonicalMissionJson(doc), canonicalMissionJson(reordered));
  const other = structuredClone(doc);
  other.scenario.wind.speedMps += 1;
  assert.notEqual(
    await missionContentHash(doc),
    await missionContentHash(other),
  );
});

void test('v1 migrates explicitly with demo-assumption notice; unknown schema and fields rejected', () => {
  const imported = parseMissionText(JSON.stringify(demoScenario()));
  assert.equal(imported.schemaVersion, '2.0');
  assert.match(imported.notes, /учебные/);
  assert.throws(() =>
    parseMissionText(JSON.stringify({ ...mission(), schemaVersion: '3.0' })),
  );
  assert.throws(() =>
    parseMissionText(JSON.stringify({ ...mission(), unknown: 'cannot drop' })),
  );
  assert.throws(() =>
    parseMissionText(JSON.stringify({ ...demoScenario(), unknown: true })),
  );
});

void test('JSON/YAML strict handling rejects duplicate keys at every depth', () => {
  for (const input of [
    '{"a":1,"a":2}',
    '{"a":{"b":1,"b":2}}',
    'a: 1\na: 2',
    'a:\n  b: 1\n  b: 2',
  ]) {
    assert.throws(() => parseStructuredText(input), /unique|уник|map keys/i);
  }
});

void test('YAML rejects aliases, unused anchors, merge, explicit tags and custom tags', () => {
  const cases = [
    'a: &x 1\nb: *x',
    'a: &unused 1',
    'a: { <<: { b: 2 } }',
    'a: !!str 123',
    'a: !thing hi',
  ];
  cases.forEach((input) =>
    assert.throws(() => parseStructuredText(input, 'yaml')),
  );
});

void test('YAML exactly one document, string keys, finite numbers, depth and JSON syntax', () => {
  for (const input of [
    '---\na: 1\n---\nb: 2',
    '1: value',
    'a: .inf',
    'a: .nan',
    '? [a, b]\n: value',
  ])
    assert.throws(() => parseStructuredText(input, 'yaml'));
  assert.throws(() => parseStructuredText('{"x":1,}', 'json'), /JSON/);
  assert.throws(() => parseStructuredText('x: '.repeat(50) + '1', 'yaml'));
  assert.deepEqual(parseStructuredText('\uFEFF{"a":"2026-09-24"}'), {
    a: '2026-09-24',
  });
});

void test('prototype pollution keys prohibited in JSON/YAML before schema handling', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    assert.throws(
      () => parseStructuredText(`{"a":{"${key}":"bad"}}`),
      /запрещён/,
    );
    assert.throws(
      () => parseStructuredText(`a:\n  ${key}: bad`, 'yaml'),
      /запрещён/,
    );
  }
  assert.equal(({} as { polluted?: unknown }).polluted, undefined);
});

void test('UTF-8 byte limit and empty files are enforced', () => {
  assert.throws(() => parseMissionText(''), /пуст/);
  assert.throws(
    () => parseMissionText(' '.repeat(MAX_MISSION_FILE_BYTES + 1) + '{}'),
    /200 КиБ/,
  );
  assert.throws(
    () => parseMissionText('я'.repeat(MAX_MISSION_FILE_BYTES / 2 + 1)),
    /200 КиБ/,
  );
});

void test('Russian summary includes all jobs, schedule, assumptions and escaped operator text', () => {
  const doc = mission();
  doc.name = '<script>alert(1)</script>';
  doc.notes = '[click](javascript:alert(1))\n```';
  doc.jobs.push({
    ...structuredClone(doc.jobs[0]),
    id: 'ms',
    name: 'Вторая работа',
    job: { ...doc.jobs[0].job, type: 'MS' },
  });
  const md = missionSummaryMarkdown(doc);
  assert.ok(md.includes('Вторая работа'));
  assert.ok(md.includes('2026-09-24'));
  assert.ok(md.includes('не является разрешением'));
  assert.ok(md.includes('неизвестен'));
  assert.ok(md.includes('\\<script\\>'));
  assert.ok(!md.includes('\n```\n```'));
});

void test('GeoJSON preserves Polygon holes and explicit Point roles', () => {
  const imported = importGeometryText(
    JSON.stringify({
      type: 'Feature',
      id: 'field-a',
      properties: { name: 'Участок' },
      geometry: { type: 'Polygon', coordinates: [ring, hole] },
    }),
    'geojson',
    'area',
  );
  assert.deepEqual(imported.features[0].geometry, {
    type: 'Polygon',
    coordinates: [ring, hole],
  });
  assert.equal(imported.features[0].sourceId, 'field-a');
  const p = importGeometryText(
    '{"type":"Point","coordinates":[30,60]}',
    'geojson',
    'start',
  );
  assert.deepEqual(p.features[0].geometry, {
    type: 'Point',
    coordinates: [30, 60],
  });
});

void test('GeoJSON MultiPolygon preserves every part and identity, never silently selects first', () => {
  const data = JSON.stringify({
    type: 'Feature',
    id: 'multi-a',
    properties: {},
    geometry: { type: 'MultiPolygon', coordinates: [[ring, hole], [ring]] },
  });
  const result = importGeometryText(data, 'geojson', 'area');
  assert.equal(result.features.length, 2);
  assert.equal(result.features[0].sourceId, result.features[1].sourceId);
  assert.deepEqual(
    result.features.map((x) => x.partIndex),
    [0, 1],
  );
  assert.deepEqual(result.features[0].geometry, {
    type: 'Polygon',
    coordinates: [ring, hole],
  });
  assert.throws(
    () => importGeometryText(data, 'geojson', 'airspace'),
    /от 1 до 1/,
  );
});

void test('GeoJSON rejects mixed layers, excess features, unknown geometry and CRS, 3D and unclosed rings', () => {
  const inputs = [
    { type: 'Point', coordinates: [30, 60, 100] },
    { type: 'Point', coordinates: [200, 60] },
    { type: 'Point', coordinates: [30, 71] },
    {
      type: 'LineString',
      coordinates: [
        [30, 60],
        [31, 60],
      ],
    },
    { type: 'GeometryCollection', geometries: [] },
    { type: 'Feature', properties: {}, geometry: null },
    { type: 'FeatureCollection', features: [] },
    { type: 'Point', coordinates: [30, 60], crs: {} },
  ];
  inputs.forEach((item) =>
    assert.throws(() =>
      importGeometryText(JSON.stringify(item), 'geojson', 'start'),
    ),
  );
  assert.throws(
    () =>
      importGeometryText(
        JSON.stringify({ type: 'Polygon', coordinates: [ring.slice(0, -1)] }),
        'geojson',
        'area',
      ),
    /замкнуто/,
  );
  assert.throws(
    () =>
      importGeometryText(
        '{"type":"Point","coordinates":[30,60]}',
        'geojson',
        'area',
      ),
    /Polygon/,
  );
  assert.throws(
    () =>
      importGeometryText(
        JSON.stringify({
          type: 'FeatureCollection',
          features: Array.from({ length: 11 }, () => ({
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [30, 60] },
          })),
        }),
        'geojson',
        'reserve',
      ),
    /10 объектов/,
  );
});

void test('KML preserves Polygon outer ring and holes, xml escaping and source identity', () => {
  const result = importGeometryText(kml(kmlPolygon), 'kml', 'area');
  assert.deepEqual(result.features[0].geometry, {
    type: 'Polygon',
    coordinates: [ring, hole],
  });
  assert.equal(result.features[0].name, 'Участок & точка');
  assert.equal(result.features[0].sourceId, 'source-site');
  const points = importGeometryText(
    kml('<Point><coordinates>30,60,0</coordinates></Point>'),
    'kml',
    'landing',
  );
  assert.deepEqual(points.features[0].geometry, {
    type: 'Point',
    coordinates: [30, 60],
  });
});

void test('KML MultiGeometry preserves parts, roles and holes', () => {
  const imported = importGeometryText(
    kml(`<MultiGeometry>${kmlPolygon}${kmlPolygon}</MultiGeometry>`),
    'kml',
    'area',
  );
  assert.equal(imported.features.length, 2);
  assert.equal(imported.features[0].sourceId, imported.features[1].sourceId);
  assert.equal(imported.features[1].partIndex, 1);
  assert.deepEqual(imported.features[1].geometry, {
    type: 'Polygon',
    coordinates: [ring, hole],
  });
  assert.throws(
    () => importGeometryText(kml('<MultiGeometry/>'), 'kml', 'area'),
    /пустые/,
  );
});

void test('KML rejects DTD/entities, URL resources, malformed XML, unsupported types and altitude loss', () => {
  const bad = [
    '<!DOCTYPE kml [<!ENTITY xxe SYSTEM "file:///C:/secret">]>' +
      kml('<Point><coordinates>&xxe;</coordinates></Point>'),
    kml(
      '<NetworkLink><Link><href>https://example.com/file.kml</href></Link></NetworkLink>',
    ),
    kml('<Point><coordinates>30,60,20</coordinates></Point>'),
    kml(
      '<Point><coordinates>30,60</coordinates><altitudeMode>absolute</altitudeMode></Point>',
    ),
    kml('<LineString><coordinates>30,60 31,60</coordinates></LineString>'),
    kml('<Point><coordinates>30,60</coordinates><foo>&secret;</foo></Point>'),
    '<kml><Placemark><Point></kml>',
    kml('<Point><coordinates>30,60 31,61</coordinates></Point>'),
    '<kml><Placemark/></kml>',
    kml('<Point><coordinates>30,60</coordinates><extrude>1</extrude></Point>'),
    kml(
      '<Point href="https://example.com"><coordinates>30,60</coordinates></Point>',
    ),
    kml(
      '<Point><coordinates>30,60</coordinates></Point><styleUrl>https://example.com/style</styleUrl>',
    ),
    '<?xml-stylesheet href="https://example.com"?>' +
      kml('<Point><coordinates>30,60</coordinates></Point>'),
  ];
  bad.forEach((item) =>
    assert.throws(() => importGeometryText(item, 'kml', 'start')),
  );
});

void test('KML refuses unconsumed geometry and excessive XML depth', () => {
  assert.throws(
    () =>
      importGeometryText(
        `<kml><Document><Placemark><Point><coordinates>30,60</coordinates></Point></Placemark><Point><coordinates>31,61</coordinates></Point></Document></kml>`,
        'kml',
        'start',
      ),
    /вне поддержанной/,
  );
  assert.throws(
    () =>
      importGeometryText(
        `<kml>${'<Folder>'.repeat(34)}<Placemark><Point><coordinates>30,60</coordinates></Point></Placemark>${'</Folder>'.repeat(34)}</kml>`,
        'kml',
        'start',
      ),
    /вложенность/,
  );
});
