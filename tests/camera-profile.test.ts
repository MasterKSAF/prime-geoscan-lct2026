import test from 'node:test';
import assert from 'node:assert/strict';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { parseMissionDocument, sha256 } from '../lib/planner/mission-schema.ts';
import { qualityForJob } from '../lib/planner/quality.ts';
import {
  cameraProfileSchema,
  cameraGeometryKey,
  migrateMissionCameraBindings,
  resolveVehicleCamera,
} from '../lib/planner/camera-profile.ts';
import type { CameraProfile } from '../lib/planner/camera-profile.ts';
import type { Vehicle } from '../lib/planner/schema.ts';

const pf1b = (): CameraProfile => ({
  id: 'pf1b',
  name: 'PF1B',
  type: 'RGB',
  status: 'assumed',
  supportedModels: ['Gemini'],
  source: 'Operator test; cadence and shutter are assumptions.',
  sensorWidthMm: 23.5,
  sensorHeightMm: 15.6,
  focalLengthMm: 20,
  imageWidthPx: 6000,
  imageHeightPx: 4000,
  minimumIntervalSec: 1,
  shutterSec: 0.001,
});
const bound = (): Vehicle => ({
  ...demoMission().scenario.vehicles[0],
  model: 'Gemini',
  jobs: ['RGB'],
  cameraIds: ['pf1b'],
  cameraProfiles: [pf1b()],
});

void test('camera snapshot schema is strict; incomplete optics may be stored but cannot run', () => {
  assert.equal(
    cameraProfileSchema.safeParse({ ...pf1b(), surprise: true }).success,
    false,
  );
  const v = bound();
  delete v.cameraProfiles![0].focalLengthMm;
  assert.equal(
    cameraProfileSchema.safeParse(v.cameraProfiles![0]).success,
    true,
  );
  assert.match(resolveVehicleCamera(v, 'RGB').reason!, /заблокирован/);
});
void test('known payload model compatibility cannot be forged through supportedModels', () => {
  for (const model of ['801', '201', 'Custom'] as const) {
    const v = { ...bound(), model };
    v.cameraProfiles![0].supportedModels = [model];
    assert.equal(resolveVehicleCamera(v, 'RGB').camera, undefined);
  }
  const v = bound();
  v.model = '201';
  v.jobs = ['MS'];
  v.cameraIds = ['pollux'];
  v.cameraProfiles = [
    {
      ...pf1b(),
      id: 'pollux',
      name: 'Pollux',
      type: 'MS',
      supportedModels: ['Gemini', '201'],
    },
  ];
  assert.ok(resolveVehicleCamera(v, 'MS').camera);
});
void test('installation is explicit: no camera, inactive camera and ambiguous active lens fail', () => {
  const v = bound();
  v.cameraIds = [];
  assert.equal(resolveVehicleCamera(v, 'RGB').camera, undefined);
  v.cameraProfiles!.push({ ...pf1b(), id: 'another' });
  v.cameraIds = ['pf1b', 'another'];
  assert.match(resolveVehicleCamera(v, 'RGB').reason!, /ровно одну/);
  v.cameraIds = ['pf1b'];
  assert.equal(resolveVehicleCamera(v, 'RGB', 'another').camera, undefined);
  assert.equal(resolveVehicleCamera(v, 'MS').camera, undefined);
});
void test('actual optics override legacy job fields without mutating requirements', () => {
  const d = demoMission(),
    j = d.jobs[0],
    v = bound();
  j.quality.altitudeMode = 'gsd';
  j.quality.maximumGsdCm = 2;
  const before = JSON.stringify(j),
    a = qualityForJob(j, v, d.flightEnvelope);
  assert.equal(a.job.altitudeM, 102.127);
  assert.equal(JSON.stringify(j), before);
  j.quality.sensorWidthMm = 90;
  j.quality.focalLengthMm = 1;
  j.quality.imageHeightPx = 2;
  const b = qualityForJob(j, v, d.flightEnvelope);
  assert.equal(a.job.altitudeM, b.job.altitudeM);
  assert.equal(a.job.swathM, b.job.swathM);
  assert.equal(a.job.triggerDistanceM, b.job.triggerDistanceM);
  delete v.cameraProfiles![0].focalLengthMm;
  assert.ok(
    qualityForJob(j, v, d.flightEnvelope).checks.some(
      (c) => c.id.endsWith('_CAMERA') && c.status === 'fail',
    ),
  );
});
void test('unknown optical provenance blocks, assumed is never presented as documented', () => {
  const d = demoMission(),
    v = bound();
  assert.equal(
    qualityForJob(d.jobs[0], v).checks.find((c) => c.id.endsWith('_SOURCE'))!
      .status,
    'unknown',
  );
  v.cameraProfiles![0].status = 'unknown';
  assert.ok(
    qualityForJob(d.jobs[0], v).checks.some((c) => c.status === 'fail'),
  );
});
void test('camera exposure is never inherited from a job optics trap', () => {
  const d = demoMission(),
    v = bound();
  d.jobs[0].quality.shutterSec = 0.000001;
  v.cameraProfiles![0].shutterSec = 1;
  assert.equal(
    qualityForJob(d.jobs[0], v).checks.find((c) => c.id.endsWith('_BLUR'))!
      .status,
    'fail',
  );
  delete v.cameraProfiles![0].shutterSec;
  assert.equal(
    qualityForJob(d.jobs[0], v).checks.find((c) => c.id.endsWith('_BLUR'))!
      .status,
    'unknown',
  );
});
void test('camera geometry key detects changed optics even under the same profile ID', () => {
  assert.notEqual(
    cameraGeometryKey(pf1b()),
    cameraGeometryKey({ ...pf1b(), focalLengthMm: 35 }),
  );
});
void test('explicit legacy migration is deterministic, immutable and leaves parsing/hash unchanged', async () => {
  const d = demoMission();
  for (const v of d.scenario.vehicles) {
    delete v.cameraProfiles;
    delete v.cameraIds;
  }
  const original = JSON.stringify(d),
    hash = await sha256(d);
  assert.equal(await sha256(parseMissionDocument(d)), hash);
  const a = migrateMissionCameraBindings(d),
    b = migrateMissionCameraBindings(d);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(d), original);
  assert.deepEqual(
    migrateMissionCameraBindings(a.document).document,
    a.document,
  );
  assert.equal(migrateMissionCameraBindings(a.document).warnings.length, 0);
  assert.ok(
    a.document.scenario.vehicles
      .filter((v) => v.model === 'Gemini')
      .every((v) => v.cameraProfiles?.every((c) => c.status === 'assumed')),
  );
});
void test('legacy PF1B is not installed on 801 or 201; Custom receives an explicit assumed snapshot', () => {
  for (const model of ['801', '201', 'Custom'] as const) {
    const d = demoMission();
    d.scenario.vehicles = [{ ...d.scenario.vehicles[0], model, jobs: ['RGB'] }];
    delete d.scenario.vehicles[0].cameraProfiles;
    delete d.scenario.vehicles[0].cameraIds;
    const m = migrateMissionCameraBindings(d);
    assert.equal(
      m.document.scenario.vehicles[0].cameraProfiles!.length,
      model === 'Custom' ? 1 : 0,
    );
    if (model !== 'Custom')
      assert.match(m.warnings.join(' '), /нужен явный выбор/);
  }
});

void test('legacy unknown optics never become assumed or runnable during migration', () => {
  const d = demoMission();
  for (const v of d.scenario.vehicles) {
    delete v.cameraProfiles;
    delete v.cameraIds;
  }
  d.jobs[0].quality.status = 'unknown';
  const migrated = migrateMissionCameraBindings(d).document;
  for (const vehicle of migrated.scenario.vehicles) {
    assert.equal(vehicle.cameraProfiles![0].status, 'unknown');
    assert.equal(resolveVehicleCamera(vehicle, 'RGB').camera, undefined);
  }
});
