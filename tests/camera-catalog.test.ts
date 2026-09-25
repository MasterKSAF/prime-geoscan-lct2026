import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAMERA_CATALOG,
  cameraProfilesForModel,
  missingCameraFields,
  modelCameraProfile,
} from '../lib/planner/camera-catalog.ts';
import {
  cameraProfileSchema,
  resolveVehicleCamera,
} from '../lib/planner/camera-profile.ts';
import {
  MISSION_VEHICLE_CATALOG,
  createCatalogueVehicleProfile,
  installedVehicleConfiguration,
} from '../lib/planner/mission-vehicle-catalog.ts';
import type { Vehicle } from '../lib/planner/schema.ts';
import { parseMissionDocument } from '../lib/planner/mission-schema.ts';
import { fixedWingFixture } from './fixtures/fixed-wing.ts';

const matrix = {
  pf1b: ['Gemini'],
  pollux: ['Gemini', '201'],
  '801-wide': ['801'],
  '801-tele': ['801'],
  '801-thermal': ['801'],
  'sony-rx1rm2': ['201'],
  'sony-zv-e10': ['201'],
  'riebo-r4': ['201'],
  'riebo-r6': ['201'],
};

void test('camera catalogue: nine unique payloads retain the documented aircraft matrix', () => {
  assert.equal(CAMERA_CATALOG.length, 9);
  assert.deepEqual(
    new Set(CAMERA_CATALOG.map((c) => c.id)),
    new Set(Object.keys(matrix)),
  );
  for (const c of CAMERA_CATALOG) {
    assert.deepEqual(c.supportedModels, matrix[c.id as keyof typeof matrix]);
    assert.equal(c.status, 'documented');
    assert.ok(c.source.includes('https://'));
    assert.ok(c.source.length <= 1000);
    assert.deepEqual(cameraProfileSchema.parse(c), c);
    assert.equal(
      c.minimumIntervalSec,
      undefined,
      'No undocumented camera/autopilot cadence is a passport fact.',
    );
    assert.equal(
      c.shutterSec,
      undefined,
      'A simulated shutter is not a measured installation.',
    );
  }
  assert.deepEqual(cameraProfilesForModel('Custom'), []);
});

void test('camera catalogue: physical focal lengths and multispectral channels are not equivalent zoom or thermal data', () => {
  const pf1b = modelCameraProfile('pf1b');
  assert.equal(pf1b.focalLengthMm, 20);
  assert.notEqual(pf1b.focalLengthMm, 30);
  const pollux = modelCameraProfile('pollux');
  assert.equal(pollux.type, 'MS');
  assert.equal(pollux.focalLengthMm, 8);
  assert.equal(pollux.imageWidthPx, 1440);
  assert.equal(pollux.imageHeightPx, 1080);
  assert.ok(Math.abs(pollux.sensorWidthMm! - 1440 * 0.00345) < 1e-12);
  assert.ok(Math.abs(pollux.sensorHeightMm! - 1080 * 0.00345) < 1e-12);
  assert.equal(modelCameraProfile('801-thermal').type, 'IR');
  assert.equal(modelCameraProfile('801-thermal').focalLengthMm, 9.1);
});

void test('camera catalogue: stand assumptions remain explicit and never fill unknown optical dimensions', () => {
  const opticalKeys = [
    'sensorWidthMm',
    'sensorHeightMm',
    'focalLengthMm',
    'imageWidthPx',
    'imageHeightPx',
  ] as const;
  for (const original of CAMERA_CATALOG) {
    const snapshot = modelCameraProfile(original.id);
    assert.equal(snapshot.status, 'assumed');
    assert.equal(snapshot.minimumIntervalSec, 1);
    assert.equal(snapshot.shutterSec, 0.001);
    assert.match(snapshot.source, /допущения симуляции/);
    assert.ok(snapshot.source.length <= 1000);
    assert.deepEqual(cameraProfileSchema.parse(snapshot), snapshot);
    for (const key of opticalKeys)
      assert.equal(snapshot[key], original[key], `${original.id}/${key}`);
  }
  assert.deepEqual(missingCameraFields(modelCameraProfile('pf1b')), []);
  assert.deepEqual(missingCameraFields(modelCameraProfile('pollux')), []);
  assert.deepEqual(missingCameraFields(modelCameraProfile('sony-rx1rm2')), []);
  assert.deepEqual(missingCameraFields(modelCameraProfile('sony-zv-e10')), [
    'focalLengthMm',
  ]);
  assert.deepEqual(missingCameraFields(modelCameraProfile('801-thermal')), [
    'sensorWidthMm',
    'sensorHeightMm',
  ]);
  for (const id of ['801-wide', '801-tele', 'riebo-r4', 'riebo-r6'])
    assert.deepEqual(missingCameraFields(modelCameraProfile(id)), [
      'sensorWidthMm',
      'sensorHeightMm',
      'imageWidthPx',
      'imageHeightPx',
    ]);
});

void test('camera catalogue: snapshots are independent clones and unknown IDs do not become PF1B', () => {
  const before = JSON.stringify(CAMERA_CATALOG);
  const profile = modelCameraProfile('pf1b');
  profile.focalLengthMm = 100;
  profile.supportedModels.push('801');
  const entries = cameraProfilesForModel('201');
  entries[0].source = 'edited';
  entries[0].supportedModels.push('Custom');
  assert.equal(JSON.stringify(CAMERA_CATALOG), before);
  assert.equal(modelCameraProfile('pf1b').focalLengthMm, 20);
  assert.throws(() => modelCameraProfile('unknown'), /Неизвестная камера/);
});

void test('camera catalogue: every configuration survives mission JSON roundtrip without claiming all cameras installed', () => {
  for (const entry of MISSION_VEHICLE_CATALOG)
    for (const configuration of entry.configurations) {
      const { d } = fixedWingFixture(0);
      const vehicle: Vehicle = {
        ...createCatalogueVehicleProfile(entry.model, configuration.id),
        id: 'catalogue-test',
        name: 'Catalogue roundtrip',
        start: d.scenario.vehicles[0].start,
        landing: d.scenario.vehicles[0].landing,
      };
      d.scenario.vehicles = [vehicle];
      d.batteries = [
        { ...d.batteries[0], id: 'catalogue-battery', vehicleId: vehicle.id },
      ];
      d.jobs[0].assignedVehicleIds = [];
      const restored = parseMissionDocument(JSON.parse(JSON.stringify(d)))
        .scenario.vehicles[0];
      assert.deepEqual(restored.cameraIds, configuration.cameraIds);
      assert.deepEqual(restored.cameraProfiles, vehicle.cameraProfiles);
      assert.equal(installedVehicleConfiguration(restored), configuration.id);
      for (const id of restored.cameraIds!)
        assert.ok(restored.cameraProfiles!.some((c) => c.id === id));
      for (const type of restored.jobs)
        assert.ok(
          restored.cameraProfiles!.filter(
            (c) => restored.cameraIds!.includes(c.id) && c.type === type,
          ).length <= 1,
        );
    }
});

void test('camera catalogue: incomplete standard payloads require operator optics and cannot borrow job parameters', () => {
  for (const [model, configuration, type] of [
    ['801', 'rgb-ir', 'RGB'],
    ['801', 'rgb-ir', 'IR'],
    ['801', 'tele-ir', 'RGB'],
    ['201', 'rgb', 'RGB'],
    ['201', 'sony-zv-e10', 'RGB'],
    ['201', 'riebo-r4', 'RGB'],
    ['201', 'riebo-r6', 'RGB'],
  ] as const) {
    const v: Vehicle = {
      ...createCatalogueVehicleProfile(model, configuration),
      id: 'test',
      name: 'test',
      start: [37, 55],
      landing: [37, 55],
    };
    assert.equal(
      resolveVehicleCamera(v, type).camera,
      undefined,
      `${model}/${configuration}/${type}`,
    );
    assert.ok(resolveVehicleCamera(v, type).reason);
  }
  for (const [model, configuration, type, id] of [
    ['Gemini', 'rgb', 'RGB', 'pf1b'],
    ['Gemini', 'ms', 'MS', 'pollux'],
    ['201', 'ms', 'MS', 'pollux'],
    ['201', 'sony-rx1rm2', 'RGB', 'sony-rx1rm2'],
  ] as const) {
    const v: Vehicle = {
      ...createCatalogueVehicleProfile(model, configuration),
      id: 'test',
      name: 'test',
      start: [37, 55],
      landing: [37, 55],
    };
    assert.equal(resolveVehicleCamera(v, type).camera?.id, id);
  }
});

void test('camera catalogue: imported supported-model metadata cannot install PF1B on 801 or 201', () => {
  for (const model of ['801', '201'] as const) {
    const v: Vehicle = {
      ...createCatalogueVehicleProfile(model),
      id: 'test',
      name: 'test',
      start: [37, 55],
      landing: [37, 55],
      jobs: ['RGB'],
      cameraIds: ['pf1b'],
      cameraProfiles: [
        { ...modelCameraProfile('pf1b'), supportedModels: [model] },
      ],
    };
    assert.equal(resolveVehicleCamera(v, 'RGB').camera, undefined);
    assert.match(resolveVehicleCamera(v, 'RGB').reason!, /не совместима/);
  }
});
