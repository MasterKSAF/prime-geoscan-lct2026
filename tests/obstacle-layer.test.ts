import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  parseObstacleKml,
  checkExternalObstacles,
  obstacleFootprints,
  relevantObstacles,
} from '../lib/planner/obstacle-layer.ts';
import { createObstacleDemo } from '../lib/planner/obstacle-demo.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import {
  parseMissionText,
  serializeMissionJson,
} from '../lib/planner/mission-io.ts';
import {
  buildMissionArchive,
  readStoredZip,
  verifyArchiveFiles,
  createStoredZip,
} from '../lib/planner/mission-archive.ts';
import { projection } from '../lib/planner/geometry.ts';
import type { Segment } from '../lib/planner/schema.ts';
import { IDBFactory } from 'fake-indexeddb';
import { createMissionOperations } from '../lib/planner/mission-operations.ts';
import { sha256, sha256Text } from '../lib/planner/mission-schema.ts';
import { compileRestrictions } from '../lib/planner/mission-validation.ts';
import {
  listObstacleSources,
  saveObstacleSource,
} from '../lib/planner/obstacle-store.ts';

const source: string = JSON.parse(
  readFileSync(
    'public/planner/scenarios/demo-02-expert-obstacles.mission.json',
    'utf8',
  ),
).obstacleLayer.sourceText;
const kml = (geometry: string) =>
  `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark id="one"><name>test</name>${geometry}</Placemark></Document></kml>`;
void test('expert source preserved, every polygon and line accounted for', () => {
  assert.equal(
    createHash('sha256').update(source).digest('hex'),
    '58b7fc12f8870ac434d2ae3f3a4dd0627878aa41e5afc862c5fd74da22f420a8',
  );
  const c = parseObstacleKml(source);
  assert.equal(c.total, 3201);
  assert.equal(c.accepted, 3201);
  assert.equal(c.repaired, 15);
  assert.equal(c.rejected, 0);
  assert.equal(c.objects.filter((o) => o.kind === 'LineString').length, 56);
  assert.equal(
    c.objects.filter((o) => o.altitudeMode === 'absolute').length,
    2777,
  );
  assert.equal(
    c.objects.filter((o) => o.altitudeMode === 'relativeToGround').length,
    424,
  );
});
void test('unsafe XML and remote resources rejected', () => {
  assert.throws(
    () =>
      parseObstacleKml(
        '<!DOCTYPE kml [<!ENTITY x SYSTEM "file:///secret">]><kml/>',
      ),
    /DTD/,
  );
  assert.throws(
    () =>
      parseObstacleKml(
        kml(
          '<NetworkLink><Link><href>https://bad.invalid</href></Link></NetworkLink>',
        ),
      ),
    /NetworkLink/,
  );
  assert.throws(() => parseObstacleKml('<kml><broken></kml>'));
});
void test('invalid geometries are accounted for, not silently dropped', () => {
  const c = parseObstacleKml(
    kml(
      '<Polygon><outerBoundaryIs><LinearRing><coordinates>30,60,100 30.001,60.001,100 30,60.001,100 30.001,60,100 30,60,100</coordinates></LinearRing></outerBoundaryIs></Polygon>',
    ),
  );
  assert.equal(c.total, 1);
  assert.equal(c.rejected, 1);
});
void test('original altitude samples on a varying-height line remain intact', () => {
  const c = parseObstacleKml(
    kml(
      '<LineString><altitudeMode>relativeToGround</altitudeMode><coordinates>30,60,7 30.001,60,80 30.002,60,9</coordinates></LineString>',
    ),
  );
  assert.deepEqual(
    c.objects[0].coordinates[0].map((p) => p[2]),
    [7, 80, 9],
  );
});
void test('large immutable attachment round-trips without relaxing normal mission limit', () => {
  const d = createObstacleDemo(source),
    text = serializeMissionJson(d);
  assert.deepEqual(parseMissionText(text), d);
  assert.throws(() =>
    parseMissionText(
      JSON.stringify({
        ...d,
        obstacleLayer: undefined,
        notes: 'x'.repeat(205000),
      }),
    ),
  );
});
void test('full-catalog validator catches crossing obstacle outside work area at any altitude', () => {
  const d = createObstacleDemo(source),
    objects = relevantObstacles(d);
  assert.equal(objects.length, 1);
  const b = objects[0].bounds!,
    p = projection([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
  for (const altitude of [0, 100, 5999]) {
    const segment = {
      from: p.inverse([-100, 0]),
      to: p.inverse([100, 0]),
      altitudeFromM: altitude,
      altitudeToM: altitude,
      startSec: 0,
      endSec: 20,
      phase: 'transit',
    } as Segment;
    assert.equal(checkExternalObstacles(d, [segment])[0].status, 'fail');
  }
  assert.ok(obstacleFootprints(d).length);
});
void test(
  'expert obstacle demo solves, independently checks and archives reproducibly',
  { timeout: 90000 },
  async () => {
    const d = createObstacleDemo(source),
      result = await solveMissionDocument(d);
    const candidate = result.candidates.find(
      (c) => c.status === 'feasible_model',
    );
    assert.ok(
      candidate,
      JSON.stringify(
        result.candidates.map((c) => ({
          status: c.status,
          checks: c.checks.filter((x) => x.status === 'fail'),
          trace: c.trace?.slice(-4),
        })),
      ),
    );
    assert.equal(
      checkExternalObstacles(
        d,
        candidate.sorties.flatMap((s) => s.segments),
      )[0].status,
      'pass',
    );
    const archive = await buildMissionArchive(d, candidate);
    const files = readStoredZip(archive.bytes);
    assert.equal(files['data/sources/obstacles.kml'], source);
    assert.equal(
      (await verifyArchiveFiles(files)).status,
      'passes-declared-model',
    );
    const forged = { ...files },
      unsafe = structuredClone(candidate);
    const b = relevantObstacles(d)[0].bounds!;
    const p = projection([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
    unsafe.sorties[0].segments[0].from = p.inverse([-100, 0]);
    unsafe.sorties[0].segments[0].to = p.inverse([100, 0]);
    forged['data/plan/candidate.json'] = JSON.stringify(unsafe, null, 2) + '\n';
    forged['manifest-sha256.txt'] =
      (
        await Promise.all(
          Object.entries(forged)
            .filter(([path]) => path.startsWith('data/'))
            .map(
              async ([path, value]) => `${await sha256Text(value)}  ${path}`,
            ),
        )
      ).join('\n') + '\n';
    forged['tagmanifest-sha256.txt'] =
      (
        await Promise.all(
          ['bagit.txt', 'bag-info.txt', 'manifest-sha256.txt'].map(
            async (path) => `${await sha256Text(forged[path])}  ${path}`,
          ),
        )
      ).join('\n') + '\n';
    await assert.rejects(() => verifyArchiveFiles(forged), /Маршрут отвергнут/);
    const factory = new IDBFactory(),
      operations = createMissionOperations({ indexedDB: factory });
    let run = await operations.enqueue({
      id: 'run-expert-test',
      document: d,
      candidate,
      approval: {
        inputHash: result.inputHash,
        planHash: await sha256(candidate),
        candidateId: candidate.id,
        approvedAt: new Date().toISOString(),
      },
    });
    run = await operations.start(run.id, run.revision);
    run = await operations.advance(
      run.id,
      run.revision,
      candidate.metrics.makespanSec,
    );
    assert.equal(run.status, 'completed');
    const executed = await buildMissionArchive(d, candidate, run);
    assert.equal(
      (await verifyArchiveFiles(readStoredZip(executed.bytes))).status,
      'passes-declared-model',
    );
    operations.close();
    files['data/sources/obstacles.kml'] += '\n';
    await assert.rejects(() => verifyArchiveFiles(files));
    const corrupted = archive.bytes.slice();
    corrupted[40] ^= 1;
    assert.throws(() => readStoredZip(corrupted));
  },
);
void test('line corridor clearance includes physical half-width and full segment, including return', () => {
  const d = createObstacleDemo(source),
    origin = d.scenario.area.coordinates[0][0],
    p = projection(origin);
  const a = p.inverse([-40, 0]),
    b = p.inverse([40, 0]);
  d.obstacleLayer!.sourceText = kml(
    `<LineString><altitudeMode>absolute</altitudeMode><coordinates>${a.join(',')},900 ${b.join(',')},1200</coordinates></LineString>`,
  );
  const segment = (y: number, phase = 'return') =>
    ({
      from: p.inverse([-30, y]),
      to: p.inverse([30, y]),
      startSec: 0,
      endSec: 10,
      altitudeFromM: 100,
      altitudeToM: 100,
      phase,
    }) as Segment;
  assert.equal(checkExternalObstacles(d, [segment(11)])[0].status, 'fail');
  assert.equal(checkExternalObstacles(d, [segment(13)])[0].status, 'pass');
  d.obstacleLayer!.bufferM = 14;
  assert.equal(checkExternalObstacles(d, [segment(13)])[0].status, 'fail');
  d.obstacleLayer!.bufferM = 10;
  assert.equal(
    checkExternalObstacles(d, [
      {
        ...segment(13),
        fixedWing: {
          kind: 'straight',
          headingFromRad: 0,
          headingToRad: 0,
          tubeRadiusM: 5,
        },
      },
    ])[0].status,
    'fail',
  );
});
void test('external compiled restrictions are active at all heights and times', () => {
  const d = createObstacleDemo(source),
    p = projection(d.scenario.area.coordinates[0][0]),
    volumes = compileRestrictions(d, p);
  assert.ok(volumes.length);
  assert.ok(
    volumes.every(
      (v) =>
        v.minAltitudeM === -Infinity &&
        v.maxAltitudeM === Infinity &&
        v.startSec === -Infinity &&
        v.endSec === Infinity,
    ),
  );
});

void test('an obstacle over the requested work cannot become false full coverage', async () => {
  const d = createObstacleDemo(source);
  const ring = d.scenario.area.coordinates[0]
    .map((p) => `${p.join(',')},1000`)
    .join(' ');
  d.obstacleLayer!.sourceText = kml(
    `<Polygon><altitudeMode>absolute</altitudeMode><outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs></Polygon>`,
  );
  const result = await solveMissionDocument(d);
  assert.ok(result.candidates.every((c) => c.status !== 'feasible_model'));
});
void test('new bad source or exhausted regional budget cannot silently use subset', () => {
  const d = createObstacleDemo(source);
  assert.equal(
    checkExternalObstacles(d, Array(4000).fill({} as Segment))[0].status,
    'fail',
  );
  d.obstacleLayer!.sourceText = kml(
    '<Point><coordinates>invalid</coordinates></Point>',
  );
  assert.throws(() => obstacleFootprints(d));
  const base = parseObstacleKml(source).objects.find(
    (o) => o.id === relevantObstacles(createObstacleDemo(source))[0].id,
  )!;
  const ring = base.coordinates[0].map((p) => p.join(',')).join(' ');
  d.obstacleLayer!.sourceText = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${Array.from({ length: 81 }, (_, i) => `<Placemark id="n${i}"><Polygon><outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`).join('')}</Document></kml>`;
  assert.throws(() => obstacleFootprints(d), /80/);
});
void test('ZIP paths cannot escape and unreferenced payload is rejected', () => {
  assert.throws(() => createStoredZip({ '../x': 'no' }));
  assert.throws(() => createStoredZip({ '/root': 'no' }));
  assert.deepEqual(
    { ...readStoredZip(createStoredZip({ 'data/test.txt': 'Привет' })) },
    { 'data/test.txt': 'Привет' },
  );
});

void test('catalog deduplicates bytes, versions changed sources and preserves mission snapshot', async () => {
  const previous = globalThis.indexedDB;
  globalThis.indexedDB = new IDBFactory();
  try {
    const d = createObstacleDemo(source),
      original = d.obstacleLayer!;
    const hash = await saveObstacleSource(original);
    assert.equal(
      await saveObstacleSource({ ...original, filename: 'renamed.kml' }),
      hash,
    );
    assert.equal((await listObstacleSources()).length, 1);
    const changed = { ...original, sourceText: original.sourceText + '\n' };
    assert.notEqual(await saveObstacleSource(changed), hash);
    assert.equal((await listObstacleSources()).length, 2);
    assert.equal(d.obstacleLayer!.sourceText, source);
    assert.notEqual(
      await sha256(d),
      await sha256({ ...d, obstacleLayer: changed }),
    );
    for (let i = 2; i < 10; i++)
      await saveObstacleSource({
        ...original,
        sourceText: source + '\n'.repeat(i),
      });
    await assert.rejects(
      () =>
        saveObstacleSource({
          ...original,
          sourceText: source + '\n'.repeat(11),
        }),
      /10 слоёв/,
    );
    assert.equal((await listObstacleSources()).length, 10);
  } finally {
    globalThis.indexedDB = previous;
  }
});
