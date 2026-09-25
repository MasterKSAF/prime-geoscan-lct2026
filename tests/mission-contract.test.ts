import test from 'node:test';
import assert from 'node:assert/strict';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { parseMissionDocument, sha256 } from '../lib/planner/mission-schema.ts';
import { qualityForJob, createDemoQuality } from '../lib/planner/quality.ts';
import { area, prepareGeometry } from '../lib/planner/geometry.ts';
import { migrateMissionCameraBindings } from '../lib/planner/camera-profile.ts';

void test('v2 examples have exact nominal areas and explicit synthetic sources', () => {
  for (const size of [1, 10, 100] as const) {
    const d = demoMission(size);
    assert.equal(d.schemaVersion, '2.0');
    assert.ok(
      Math.abs(area(prepareGeometry(d.scenario).gross) / 1e6 - size) < 1e-7,
    );
    assert.equal(d.terrainModel.kind, 'flat');
    assert.equal(d.batteries.length, size === 1 ? 6 : size === 10 ? 32 : 80);
  }
});
void test('v2 strict semantic validation prevents unknown refs and malformed windows', () => {
  const d = demoMission();
  d.batteries[0].vehicleId = 'unknown';
  assert.throws(() => parseMissionDocument(d), /неизвестный/);
  const bad = demoMission();
  bad.window.end = bad.window.start;
  assert.throws(() => parseMissionDocument(bad), /Окно/);
  const duplicates = demoMission();
  duplicates.jobs.push(structuredClone(duplicates.jobs[0]));
  assert.throws(() => parseMissionDocument(duplicates), /повторяющиеся/);
  assert.throws(() =>
    parseMissionDocument({ ...demoMission(), unexpected: true }),
  );
});
void test('canonical hashes ignore key ordering but invalidate changed constraints', async () => {
  const d = demoMission();
  assert.equal(
    await sha256(d),
    await sha256(Object.fromEntries(Object.entries(d).reverse())),
  );
  const changed = structuredClone(d);
  changed.planning.separationHorizontalM++;
  assert.notEqual(await sha256(d), await sha256(changed));
});
void test('camera formulas derive physical footprint and detect insufficient capture interval', () => {
  const d = migrateMissionCameraBindings(demoMission()).document,
    j = d.jobs[0],
    v = d.scenario.vehicles[0];
  const q = qualityForJob(j, v);
  assert.ok(Math.abs(q.job.swathM - 117.5) < 1e-8);
  assert.ok(Math.abs(q.job.triggerDistanceM - 23.4) < 1e-8);
  assert.ok(!q.checks.some((c) => c.status === 'fail'));
  v.cameraProfiles![0].minimumIntervalSec = 10;
  assert.ok(
    qualityForJob(j, v).checks.some(
      (c) => c.id.endsWith('CADENCE') && c.status === 'fail',
    ),
  );
});
void test('five work models are explicit and sensor-specific; missing sensor never becomes camera', () => {
  const d = demoMission();
  for (const type of ['RGB', 'MS', 'IR', 'LiDAR', 'Geophysics'] as const) {
    const j = structuredClone(d.jobs[0]);
    j.job.type = type;
    j.quality = createDemoQuality(type);
    const v = structuredClone(d.scenario.vehicles[0]);
    v.model = 'Custom';
    v.jobs = [type];
    delete v.cameraProfiles;
    delete v.cameraIds;
    const configured = migrateMissionCameraBindings({
      ...d,
      jobs: [j],
      scenario: { ...d.scenario, vehicles: [v] },
    }).document.scenario.vehicles[0];
    const r = qualityForJob(j, configured);
    assert.ok(
      !r.checks.some((c) => c.status === 'fail'),
      `${type}: ${JSON.stringify(r.checks)}`,
    );
    assert.ok(r.assumptions.length);
  }
  const j = structuredClone(d.jobs[0]);
  j.job.type = 'LiDAR';
  j.quality = createDemoQuality('RGB');
  assert.ok(qualityForJob(j).checks.some((c) => c.status === 'fail'));
});
