import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseZoneAltitude,
  resolveZoneAltitude,
  airspaceAltitudeReferenceSchema,
} from '../lib/planner/airspace-altitudes.ts';
import {
  parseMissionCatalog,
  normalizedZone,
  catalogRestrictions,
  restrictionMapLabel,
  restrictionsInEnvelope,
  type CatalogSource,
} from '../lib/planner/mission-catalog.ts';
import { demoMission } from '../lib/planner/mission-demo.ts';
import {
  parseMissionDocument,
  canonicalStringify,
} from '../lib/planner/mission-schema.ts';
import { moveMissionBase, missionBases } from '../lib/planner/mission-bases.ts';
import {
  compileRestrictions,
  segmentIntersectsVolume,
  validateExportedCandidate,
} from '../lib/planner/mission-validation.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { projection } from '../lib/planner/geometry.ts';
import { recoveryOptions } from '../lib/planner/mission-safety.ts';
import {
  buildMissionArchive,
  readStoredZip,
  verifyArchiveFiles,
} from '../lib/planner/mission-archive.ts';
import type { Segment } from '../lib/planner/schema.ts';

const context = {
  terrainModel: {
    kind: 'flat' as const,
    elevationM: 150,
    source: 'Test model, not measured DEM',
  },
};
const cases: [string, number, number | null][] = [
  ['От FL100 до FL980', 2898, 29720.4],
  ['Oт FL140 до FL260', 4117.2, 7774.8],
  ['от FL070 до FL090', 1983.6, 2593.2],
  ['От 800\u00a0м (2700 фут) AMSL до FL90', 650, 2593.2],
  ['От земли до FL140', 0, 4117.2],
  ['От земли до 500 м (1700 фут) AMSL', 0, 350],
  ['От земли до 500 м (1700 фyт) AGL', 0, 500],
  ['От земли до 6000M AGL', 0, 6000],
  ['От земли до 2400 м (7900) AGL', 0, 2400],
  ['От 1850 м (6100 фут) AMSL до 3050 м (10100 фут) AMSL', 1700, 2900],
  ['От 100 м AGL до 200 м AGL', 100, 200],
  ['На всех высотах GND-UNL', 0, null],
  ['GND-UNL', 0, null],
  ['От FL100', 2898, null],
];
for (const [raw, lower, upper] of cases)
  void test(`altitude clause: ${raw}`, () => {
    const parsed = parseZoneAltitude(raw),
      result = resolveZoneAltitude(parsed, context);
    assert.equal(parsed.status, 'parsed');
    assert.equal(result.resolved, true);
    assert.ok(Math.abs(result.minAltitudeM - lower) < 1e-8);
    if (upper === null) assert.equal(result.maxAltitudeM, null);
    else assert.ok(Math.abs(result.maxAltitudeM! - upper) < 1e-8);
  });
for (const raw of [
  '',
  'SVO',
  'По описанию военных',
  'Уточнить, в фз 172 нет',
  'От 100 до 200',
  'От FL200 до FL100',
  'От FL100 до FL200 или от земли',
  'От земли до 100 м AGL не всегда',
  'От 999999999999999999999999999999999999999999999999999999999999999999999999 м AGL до UNL',
])
  void test(`unresolved clause never opens airspace: ${raw || '(empty)'}`, () => {
    const value = resolveZoneAltitude(parseZoneAltitude(raw), context);
    assert.equal(value.minAltitudeM, -500);
    assert.equal(value.maxAltitudeM, null);
    assert.equal(value.resolved, false);
  });

const source = (text: string): CatalogSource => ({
  version: 'geoscan-mission-catalog/1',
  role: 'restrictions',
  filename: 'test-zones.kml',
  sourceText: text,
  selectedIds: [],
  rules: [],
});
function zoned(raw: string, timing = '', type = 'врем_ограничение') {
  const d = demoMission(1);
  const ring = d.scenario.airspace.coordinates[0]
    .map((p) => p.join(','))
    .join(' ');
  d.catalogLayers = [
    source(
      `<kml><Document><Placemark><name>Test zone</name><ExtendedData><Data name="Altitudes"><value>${raw}</value></Data><Data name="Type"><value>${type}</value></Data></ExtendedData>${timing}<Polygon><outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`,
    ),
  ];
  return d;
}
void test('pressure reference, uncertainty and unknown terrain never silently become metres AGL', () => {
  const parsed = parseZoneAltitude('От FL100 до FL110');
  const converted = resolveZoneAltitude(parsed, {
    ...context,
    airspaceAltitudeReference: {
      kind: 'pressure-altitude-offset',
      offsetM: 100,
      uncertaintyM: 50,
      source: 'Explicit test bounds',
    },
  });
  assert.equal(converted.minAltitudeM, 2748);
  assert.equal(converted.maxAltitudeM, 3152.8);
  for (const d of [
    { terrainModel: { kind: 'unknown' as const, source: 'No DEM' } },
    {
      ...context,
      airspaceAltitudeReference: {
        kind: 'unknown' as const,
        source: 'No pressure',
      },
    },
  ]) {
    const result = resolveZoneAltitude(parsed, d);
    assert.equal(result.minAltitudeM, -500);
    assert.equal(result.maxAltitudeM, null);
  }
  const partial = resolveZoneAltitude(
    parseZoneAltitude('От 800 м AMSL до FL90'),
    {
      ...context,
      airspaceAltitudeReference: { kind: 'unknown', source: 'No pressure' },
    },
  );
  assert.equal(partial.minAltitudeM, 650);
  assert.equal(partial.maxAltitudeM, null);
  assert.throws(() =>
    airspaceAltitudeReferenceSchema.parse({
      kind: 'pressure-altitude-offset',
      offsetM: 0,
      uncertaintyM: -1,
      source: 'bad',
    }),
  );
});
void test('prose exceptions and source geometry warnings are retained, not automatic exemptions', () => {
  const p = parseZoneAltitude(
    'Некорректная геометрия! От земли до 500 м AGL\n\nНе распространяется на государственную авиацию',
  );
  assert.equal(p.status, 'parsed');
  assert.equal(p.warnings.length, 2);
  assert.match(p.conditions, /государственную/);
  assert.equal(resolveZoneAltitude(p, context).maxAltitudeM, 500);
});
void test('all 341 real zones classified: 335 height clauses, six explicit conservative fallbacks', async () => {
  const s = source(
    await readFile(
      'docs/planner/expert-materials/2026-09-23/originals/moscow-zone.kml',
      'utf8',
    ),
  );
  const c = parseMissionCatalog(s.sourceText),
    zones = c.objects.map((o) => normalizedZone(s, o, context));
  assert.equal(c.accepted, 341);
  assert.equal(
    zones.filter((z) => z.altitude.policy === 'declared-datum').length,
    335,
  );
  assert.equal(
    zones.filter((z) => z.altitude.policy === 'all-altitudes').length,
    6,
  );
  assert.equal(zones.filter((z) => z.time.policy === 'always').length, 203);
  assert.equal(zones.filter((z) => z.time.policy === 'unknown').length, 138);
  assert.equal(
    zones.find((z) => z.name === 'UUR219')?.effective.minAltitudeM,
    2898,
  );
  assert.equal(
    zones.find((z) => z.name === 'UUR372')?.effective.minAltitudeM,
    0,
  );
});
void test('source time spans need both exact timezone-aware bounds; timestamp/partial/invalid never imply inactivity', () => {
  const fixture = zoned('От земли до FL140');
  for (const timing of [
    '<TimeStamp><when>2026-06-15T10:00:00Z</when></TimeStamp>',
    '<TimeSpan><begin>2026-06-15</begin><end>2026-06-16</end></TimeSpan>',
    '<TimeSpan><begin>2026-06-15T10:00:00Z</begin></TimeSpan>',
  ]) {
    const d = zoned('От земли до FL140', timing);
    assert.equal(catalogRestrictions(d)[0].catalog?.timePolicy, 'unknown');
    assert.equal(catalogRestrictions(d)[0].startAt, null);
  }
  const timing = `<TimeSpan><begin>${fixture.window.start}</begin><end>${fixture.window.end}</end></TimeSpan>`;
  const d = zoned('От земли до FL140', timing);
  assert.equal(catalogRestrictions(d)[0].startAt, d.window.start);
  assert.equal(catalogRestrictions(d)[0].catalog?.timePolicy, 'interval');
});
void test('base can move under a high layer, not into a ground zone; source state remains intact', () => {
  const d = zoned('От FL100 до FL980'),
    before = canonicalStringify(d),
    base = missionBases(d)[0];
  const moved = moveMissionBase(d, base.id, [30.303, 60.033]);
  assert.deepEqual(moved.batteries, d.batteries);
  assert.equal(canonicalStringify(d), before);
  assert.deepEqual(
    missionBases(moved).find((b) => b.id === base.id)?.coordinate,
    [30.303, 60.033],
  );
  const low = zoned('От земли до FL140');
  assert.throws(
    () => moveMissionBase(low, missionBases(low)[0].id, [30.303, 60.033]),
    /Test zone/,
  );
  const ended = zoned(
    'От земли до FL140',
    '<TimeSpan><begin>2020-01-01T00:00:00Z</begin><end>2020-01-02T00:00:00Z</end></TimeSpan>',
  );
  assert.doesNotThrow(() =>
    moveMissionBase(ended, missionBases(ended)[0].id, [30.303, 60.033]),
  );
});
void test('independent 4D check respects floors, ceilings, closed boundaries and vertical climb through a layer', () => {
  const d = zoned('От 50 м AGL до 80 м AGL');
  d.scenario.clearanceM = 1;
  const p = projection(d.scenario.vehicles[0].start),
    [volume] = compileRestrictions(d, p);
  const segment = (a: number, b = a): Segment => ({
    from: d.scenario.vehicles[0].start,
    to: d.scenario.vehicles[0].start,
    startSec: 0,
    endSec: 10,
    altitudeFromM: a,
    altitudeToM: b,
    phase: 'takeoff',
    batteryFromPct: 100,
    batteryToPct: 99,
    airspeedMps: 1,
    groundSpeedMps: 0,
    distanceM: 0,
  });
  assert.equal(segmentIntersectsVolume(segment(30), volume, p.forward), false);
  assert.equal(segmentIntersectsVolume(segment(100), volume, p.forward), false);
  assert.equal(segmentIntersectsVolume(segment(50), volume, p.forward), true);
  assert.equal(segmentIntersectsVolume(segment(80), volume, p.forward), true);
  assert.equal(
    segmentIntersectsVolume(segment(volume.minAltitudeM), volume, p.forward),
    true,
  );
  assert.equal(
    segmentIntersectsVolume(segment(volume.maxAltitudeM), volume, p.forward),
    true,
  );
  assert.equal(
    segmentIntersectsVolume(segment(0, 100), volume, p.forward),
    true,
  );
  assert.equal(restrictionsInEnvelope(d, 0, 100).length, 1);
});
void test('unknown time is not called permanent; out-of-height restriction remains visible as context', () => {
  const d = zoned('От FL100 до FL980'),
    r = catalogRestrictions(d)[0],
    label = restrictionMapLabel(r, 100, Date.parse(d.window.start));
  assert.equal(label.relevant, false);
  assert.match(label.text, /FL100/);
  assert.match(label.text, /расписания нет/);
  assert.doesNotMatch(label.text, /постоянное|−500|-500/);
  d.terrainModel = {
    kind: 'flat',
    elevationM: 3000,
    source: 'High terrain test',
  };
  assert.ok(
    catalogRestrictions(d)[0].minAltitudeM < 100,
    'height reference participates in cache identity',
  );
  d.airspaceAltitudeReference = {
    kind: 'pressure-altitude-offset',
    offsetM: 100,
    uncertaintyM: 0,
    source: 'Different pressure',
  };
  assert.ok(
    catalogRestrictions(d)[0].minAltitudeM < 0,
    'pressure reference participates in cache identity',
  );
});

void test('base editing uses local buildings, not the 80-object route budget for the entire source', async () => {
  const d = parseMissionDocument(
    JSON.parse(
      await readFile(
        'public/planner/scenarios/demo-02-expert-obstacles.mission.json',
        'utf8',
      ),
    ),
  );
  d.scenario.airspace = {
    type: 'Polygon',
    coordinates: [
      [
        [38.83, 55.03],
        [38.87, 55.03],
        [38.87, 55.07],
        [38.83, 55.07],
        [38.83, 55.03],
      ],
    ],
  };
  const moved = moveMissionBase(d, missionBases(d)[0].id, [38.85, 55.05]);
  assert.deepEqual(
    missionBases(moved).find((b) => b.id === missionBases(d)[0].id)?.coordinate,
    [38.85, 55.05],
  );
});

void test('solver cannot fly through a lower layer on takeoff just because cruise is above it', async () => {
  const d = zoned('От 40 м AGL до 60 м AGL');
  d.jobs[0].job.altitudeM = 100;
  assert.ok(
    (await solveMissionDocument(d)).candidates.every(
      (c) => c.status !== 'feasible_model',
    ),
  );
});
void test('full solve, recovery, independent replay and evidence use the same high-layer semantics', async () => {
  const d = zoned('От FL100 до FL980');
  const result = await solveMissionDocument(d),
    c = result.candidates.find((c) => c.status === 'feasible_model');
  assert.ok(
    c,
    result.candidates
      .map((c) => c.checks.filter((x) => x.status === 'fail'))
      .flat()
      .map((x) => x.detail)
      .join('; '),
  );
  assert.equal(
    (await validateExportedCandidate(d, c)).find(
      (x) => x.id === 'FOUR_DIMENSIONAL',
    )?.status,
    'pass',
  );
  const s = c.sorties[0],
    seg = s.segments.find((s) => s.phase === 'survey')!;
  const time = (seg.startSec + seg.endSec) / 2;
  const recovery = recoveryOptions(d, c, {
    id: crypto.randomUUID(),
    source: 'simulation',
    kind: 'reserve',
    vehicleId: s.vehicleId,
    modelTimeSec: time,
    detectedAt: new Date().toISOString(),
    windMps: d.scenario.wind.speedMps,
    batteryPct: 100,
    stage: 'pending',
    delaySec: 0,
    policy: 'home',
    progressSec: 0,
    decision: 'none',
    events: [{ at: new Date().toISOString(), text: 'Test' }],
  });
  assert.ok(
    recovery.some((r) => r.valid),
    JSON.stringify(recovery.map((r) => r.reasons)),
  );
  const files = readStoredZip((await buildMissionArchive(d, c)).bytes);
  const normal = JSON.parse(files['data/restrictions/normalized.json']);
  assert.equal(normal.schemaVersion, '2.0');
  assert.equal(normal.zones[0].effective.minAltitudeM, 3048);
  assert.equal(normal.zones[0].altitude.conversion.flightPermission, false);
  assert.equal(
    (await verifyArchiveFiles(files)).status,
    'passes-declared-model',
  );
  const ground = zoned('От земли до FL140');
  assert.ok(
    (await validateExportedCandidate(ground, c)).some(
      (x) => x.status === 'fail',
    ),
    'source zone change invalidates the old candidate',
  );
  assert.ok(
    (await solveMissionDocument(ground)).candidates.every(
      (c) => c.status !== 'feasible_model',
    ),
  );
  assert.doesNotThrow(() =>
    parseMissionDocument({
      ...d,
      airspaceAltitudeReference: {
        kind: 'standard-atmosphere',
        source: 'Explicit ISA model',
      },
    }),
  );
});
