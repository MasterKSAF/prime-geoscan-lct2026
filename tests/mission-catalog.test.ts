import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseMissionCatalog,
  catalogRestrictions,
  normalizedZone,
  zoneRuleSchema,
} from '../lib/planner/mission-catalog.ts';
import {
  parseObstacleKml,
  relevantObstacles,
  OBSTACLE_ADAPTER,
} from '../lib/planner/obstacle-layer.ts';
import { parseMissionDocument } from '../lib/planner/mission-schema.ts';
import {
  parseMissionText,
  serializeMissionJson,
} from '../lib/planner/mission-io.ts';
import { demoMission } from '../lib/planner/mission-demo.ts';
import type { CatalogSource } from '../lib/planner/mission-catalog.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { validateExportedCandidate } from '../lib/planner/mission-validation.ts';
import {
  buildMissionArchive,
  readStoredZip,
  verifyArchiveFiles,
} from '../lib/planner/mission-archive.ts';
import { sha256Text } from '../lib/planner/mission-schema.ts';
const original = (name: string) =>
  readFile(
    `docs/planner/expert-materials/2026-09-23/originals/${name}`,
    'utf8',
  );
const source = (
  text: string,
  role: CatalogSource['role'] = 'restrictions',
): CatalogSource => ({
  version: 'geoscan-mission-catalog/1',
  role,
  filename: 'test.kml',
  sourceText: text,
  rules: [],
  selectedIds: [],
});
const kml =
  '<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark id="zone"><name>Зона</name><ExtendedData><Data name="Altitudes"><value>От FL100</value></Data></ExtendedData><MultiGeometry><Polygon><outerBoundaryIs><LinearRing><coordinates>30,60 30.02,60 30.02,60.02 30,60.02 30,60</coordinates></LinearRing></outerBoundaryIs></Polygon></MultiGeometry></Placemark></kml>';
void test('real catalog imports preserve all source objects and report rejected geometry', async () => {
  const a = parseMissionCatalog(await original('flight-boundaries.kml'));
  const z = parseMissionCatalog(await original('moscow-zone.kml'));
  assert.equal(a.total, 696);
  assert.equal(a.accepted + a.rejected, a.total);
  assert.ok(
    a.objects.some((o) => o.geometry && o.geometry.coordinates.length > 1),
  );
  assert.ok(a.objects.some((o) => !o.error && !o.editable));
  assert.equal(z.total, 341);
  assert.equal(z.accepted, 341);
  assert.ok(z.objects.some((o) => o.fields.Altitudes.includes('FL')));
});
void test('sea-floor datum remains intact and is safely avoided horizontally; invalid objects remain visible', async () => {
  const text = await original('moscow-obstacles.kml'),
    c = parseObstacleKml(text);
  assert.equal(c.total, 5164);
  assert.equal(c.accepted, 5146);
  assert.equal(c.rejected, 18);
  assert.ok(
    c.objects.some(
      (o) => o.altitudeMode === 'relativeToSeaFloor' && o.status !== 'rejected',
    ),
  );
  assert.equal(
    c.objects.filter((o) => !o.bounds).length,
    0,
    'malformed zero placeholders acquire known bounds, not silently discarded',
  );
  const d = demoMission(1);
  d.obstacleLayer = {
    version: OBSTACLE_ADAPTER,
    filename: 'test.kml',
    sourceText: text,
    bufferM: 10,
    lineHalfWidthM: 2,
    policySource: 'test',
  };
  assert.deepEqual(
    relevantObstacles(d),
    [],
    'unrelated distant bad geometry does not block a local corridor',
  );
});
void test('known FL is converted in the declared model; unknown time does not erase the lower height', () => {
  const s = source(kml),
    o = parseMissionCatalog(kml).objects[0],
    d = demoMission(1);
  const normalized = normalizedZone(s, o, d);
  assert.equal(normalized.altitude.policy, 'declared-datum');
  assert.equal(normalized.effective.minAltitudeM, 3048);
  assert.equal(normalized.effective.maxAltitudeM, null);
  assert.equal(normalized.effective.startAt, null);
  s.rules = [
    {
      objectId: o.id,
      altitudeReference: 'FL',
      min: 100,
      max: 200,
      timePolicy: 'unknown',
      startAt: null,
      endAt: null,
      basis: 'operator',
      source: 'Source FL, conversion not available',
    },
  ];
  assert.equal(normalizedZone(s, o, d).effective.maxAltitudeM, 6096);
  d.airspaceAltitudeReference = {
    kind: 'unknown',
    source: 'No pressure reference',
  };
  assert.equal(normalizedZone(s, o, d).effective.maxAltitudeM, null);
  assert.throws(() =>
    zoneRuleSchema.parse({ ...s.rules[0], timePolicy: 'interval' }),
  );
});
void test('full catalog is losslessly serializable above legacy size; all intersecting zones are derived', async () => {
  const d = demoMission(1);
  d.catalogLayers = [source(await original('moscow-zone.kml'))];
  const serialized = serializeMissionJson(d);
  assert.ok(serialized.length > 200 * 1024);
  assert.deepEqual(parseMissionText(serialized), parseMissionDocument(d));
  d.catalogLayers = [source(kml)];
  d.scenario.airspace = {
    type: 'Polygon',
    coordinates: [
      [
        [30.005, 60.005],
        [30.01, 60.005],
        [30.01, 60.01],
        [30.005, 60.01],
        [30.005, 60.005],
      ],
    ],
  };
  assert.equal(catalogRestrictions(d).length, 1);
  assert.equal(catalogRestrictions(d)[0].maxAltitudeM, null);
  d.catalogLayers[0].selectedIds = ['item-1'];
  assert.throws(() => parseMissionDocument(d), /выборочное отключение/);
});
void test('XML external entities and invalid zone references are rejected', () => {
  assert.throws(() =>
    parseMissionCatalog(
      '<!DOCTYPE kml [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + kml,
    ),
  );
  const d = demoMission(1);
  d.catalogLayers = [{ ...source(kml, 'areas'), selectedIds: ['missing'] }];
  assert.throws(() => parseMissionDocument(d), /Нет объекта/);
});

void test('catalog time rules reach the solver, independent verifier and tamper-resistant evidence', async () => {
  const d = demoMission(1);
  const ring = d.scenario.airspace.coordinates[0]
    .map((p) => p.join(','))
    .join(' ');
  const text = `<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><name>Test window</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>`;
  d.catalogLayers = [source(text)];
  const blocked = await solveMissionDocument(d);
  assert.ok(
    blocked.candidates.every((c) => c.status !== 'feasible_model'),
    'unknown dates do not remove a ban',
  );
  d.catalogLayers[0].rules = [
    {
      objectId: 'item-1',
      altitudeReference: 'AGL',
      min: 0,
      max: null,
      timePolicy: 'interval',
      startAt: d.window.start,
      endAt: new Date(Date.parse(d.window.start) + 1800000).toISOString(),
      basis: 'simulation',
      source: 'Explicit test schedule, not an expert-issued permission',
    },
  ];
  const result = await solveMissionDocument(d),
    c = result.candidates[0];
  assert.equal(c.status, 'feasible_model');
  assert.ok(c.sorties.every((s) => s.startSec >= 1800));
  assert.equal(
    (await validateExportedCandidate(d, c)).find(
      (x) => x.id === 'FOUR_DIMENSIONAL',
    )?.status,
    'pass',
  );
  const files = readStoredZip((await buildMissionArchive(d, c)).bytes);
  assert.equal(files['data/sources/restrictions.kml'], text);
  assert.equal(
    JSON.parse(files['data/restrictions/normalized.json']).zones[0].basis,
    'simulation',
  );
  assert.equal(
    (await verifyArchiveFiles(files)).status,
    'passes-declared-model',
  );
  // Re-signing a modified derived layer must not bypass the independent source conversion.
  const forged: Record<string, string> = {
    ...files,
    'data/restrictions/applied.json': '[]\n',
  };
  forged['manifest-sha256.txt'] =
    (
      await Promise.all(
        Object.entries(forged)
          .filter(([p]) => p.startsWith('data/'))
          .map(async ([p, value]) => `${await sha256Text(value)}  ${p}`),
      )
    ).join('\n') + '\n';
  forged['tagmanifest-sha256.txt'] =
    (
      await Promise.all(
        ['bagit.txt', 'bag-info.txt', 'manifest-sha256.txt'].map(
          async (p) => `${await sha256Text(forged[p])}  ${p}`,
        ),
      )
    ).join('\n') + '\n';
  await assert.rejects(
    () => verifyArchiveFiles(forged),
    /каталог|ограничени|источни/i,
  );
});
