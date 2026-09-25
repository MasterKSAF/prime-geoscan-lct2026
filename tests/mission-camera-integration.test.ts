import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import type { CameraProfile } from '../lib/planner/camera-profile.ts';
import {
  migrateMissionCameraBindings,
  resolveVehicleCamera,
} from '../lib/planner/camera-profile.ts';
import type {
  MissionCandidate,
  MissionDocument,
} from '../lib/planner/mission-schema.ts';
import { parseMissionDocument, sha256 } from '../lib/planner/mission-schema.ts';
import type { Vehicle } from '../lib/planner/schema.ts';
import { createCatalogueVehicleProfile } from '../lib/planner/mission-vehicle-catalog.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { validateExportedCandidate } from '../lib/planner/mission-validation.ts';
import { plannedPhotoCoverage } from '../lib/planner/mission-photo-footprints.ts';
import { missionGeoJSON, missionKML } from '../lib/planner/mission-export.ts';
import { installedBatteryDocument } from '../lib/planner/mission-fleet-state.ts';
import { sortieJobIds } from '../lib/planner/mission-sortie-jobs.ts';
import { DEMO_IDS, prepareDemoDocument } from '../lib/planner/demo-session.ts';
import { prepareSharedDemoFleet } from '../lib/planner/demo-shared-fleet.ts';
import { fixedWingFixture } from './fixtures/fixed-wing.ts';
import { missionCoverageViews } from '../lib/planner/mission-coverage-view.ts';
import { describeMissionDelivery } from '../lib/planner/mission-delivery-manifest.ts';
import {
  analyzeMissionRobustness,
  missionAnalysisCandidateSchema,
} from '../lib/planner/mission-robustness.ts';

// These complete snapshots are deliberately operator assumptions: exercising a
// camera/lens numerically is not a claim of manufacturer calibration or payload
// installation. Catalogue/source accuracy is covered separately by core tests.
function camera(
  id: string,
  type: CameraProfile['type'],
  models: CameraProfile['supportedModels'],
  optical: [number, number, number, number, number],
): CameraProfile {
  const [
    sensorWidthMm,
    sensorHeightMm,
    focalLengthMm,
    imageWidthPx,
    imageHeightPx,
  ] = optical;
  return {
    id,
    name: `Regression ${id}`,
    type,
    supportedModels: models,
    status: 'assumed',
    source:
      'Synthetic operator snapshot for camera integration; not a passport or measured installation.',
    sensorWidthMm,
    sensorHeightMm,
    focalLengthMm,
    imageWidthPx,
    imageHeightPx,
    minimumIntervalSec: 0.1,
    shutterSec: 0.0001,
  };
}

const cases: { model: Vehicle['model']; camera: CameraProfile }[] = [
  {
    model: 'Gemini',
    camera: camera('pf1b', 'RGB', ['Gemini'], [23.5, 15.6, 20, 6000, 4000]),
  },
  {
    model: 'Gemini',
    camera: camera(
      'pollux',
      'MS',
      ['Gemini', '201', 'Custom'],
      [4.968, 3.726, 8, 1440, 1080],
    ),
  },
  {
    model: '801',
    camera: camera(
      'test-801-wide',
      'RGB',
      ['801'],
      [5.568, 4.176, 4.35, 4000, 3000],
    ),
  },
  {
    model: '801',
    camera: camera(
      'test-801-tele',
      'RGB',
      ['801'],
      [5.568, 4.176, 16, 4000, 3000],
    ),
  },
  {
    model: '801',
    camera: camera(
      'test-801-thermal',
      'IR',
      ['801'],
      [7.68, 6.144, 9.1, 640, 512],
    ),
  },
  {
    model: '201',
    camera: camera(
      'test-201-rx1rm2-35',
      'RGB',
      ['201'],
      [35.9, 24, 35, 7952, 5304],
    ),
  },
  {
    model: '201',
    camera: camera(
      'test-201-zve10-20',
      'RGB',
      ['201'],
      [23.5, 15.6, 20, 6000, 4000],
    ),
  },
  {
    model: '201',
    camera: camera(
      'pollux',
      'MS',
      ['Gemini', '201', 'Custom'],
      [4.968, 3.726, 8, 1440, 1080],
    ),
  },
];

function fixture(model: Vehicle['model'], profile: CameraProfile) {
  const { d, p, square } = fixedWingFixture(0);
  const position = p.inverse(model === '201' ? [-1000, -1000] : [-150, -150]);
  const base = createCatalogueVehicleProfile(model);
  const v: Vehicle = {
    ...base,
    id: `camera-${model.toLowerCase()}`,
    name: `Test ${model}`,
    start: position,
    landing: [...position],
    jobs: [profile.type],
    cameraProfiles: [structuredClone(profile)],
    cameraIds: [profile.id],
    ...(model === '201' ? {} : { airspeedMps: 3 }),
  };
  d.id = `integration-${profile.id}`;
  d.scenario.vehicles = [v];
  d.scenario.area = square(0, 0, 150);
  d.jobs = [
    {
      ...d.jobs[0],
      id: 'work-camera',
      area: structuredClone(d.scenario.area),
      job: {
        ...d.jobs[0].job,
        type: profile.type,
        altitudeM: 100,
        sideOverlap: 0.3,
      },
      quality: {
        mode: 'camera',
        status: 'assumed',
        source: 'Legacy job optics trap: must not override installed camera.',
        altitudeMode: 'gsd',
        maximumGsdCm:
          profile.type === 'MS' ? 6 : profile.type === 'IR' ? 20 : 3,
        forwardOverlap: 0.6,
        maximumBlurPx: 1,
        sensorWidthMm: 50,
        sensorHeightMm: 50,
        focalLengthMm: 1,
        imageWidthPx: 1000,
        imageHeightPx: 1000,
        minimumIntervalSec: 60,
        shutterSec: 1,
      },
    },
  ];
  d.scenario.job = structuredClone(d.jobs[0].job);
  d.batteries = [
    {
      ...d.batteries[0],
      id: `${v.id}-current`,
      vehicleId: v.id,
      initialPct: 100,
    },
  ];
  d.planning.maxComputeMs = 3000;
  d.planning.areaTransferPolicy = 'compatible-work-v1';
  d.planning.preparationSec = 0;
  return { d: installedBatteryDocument(parseMissionDocument(d)), p, square };
}

const failed = (c: MissionCandidate) =>
  c.checks.filter((check) => check.status === 'fail');
async function solveFeasible(d: MissionDocument) {
  const before = JSON.stringify(d);
  const result = await solveMissionDocument(d);
  assert.equal(
    JSON.stringify(d),
    before,
    'Camera binding must not mutate the input.',
  );
  const c = result.candidates.find(
    (candidate) => candidate.status === 'feasible_model',
  );
  assert.ok(
    c,
    JSON.stringify(
      result.candidates.map((candidate) => ({
        status: candidate.status,
        failures: failed(candidate),
      })),
    ),
  );
  const replay = await validateExportedCandidate(d, c);
  assert.deepEqual(
    replay.filter((check) => check.status === 'fail'),
    [],
  );
  for (const id of [
    'ENERGY',
    'BATTERIES',
    'SEPARATION',
    'TRACK_ALTITUDE',
    'FOUR_DIMENSIONAL',
  ])
    assert.equal(
      replay.find((check) => check.id === id)?.status,
      'pass',
      `Independent ${id} check must remain present.`,
    );
  return c;
}

function assertCameraRoute(
  d: MissionDocument,
  c: MissionCandidate,
  profile: CameraProfile,
) {
  const q = d.jobs[0].quality;
  const expectedHeight =
    Math.floor(
      Math.min(
        (q.maximumGsdCm! / 100) *
          profile.focalLengthMm! *
          Math.min(
            profile.imageWidthPx! / profile.sensorWidthMm!,
            profile.imageHeightPx! / profile.sensorHeightMm!,
          ),
        149,
        d.flightEnvelope.maxAltitudeM,
      ) * 1000,
    ) / 1000;
  const width =
    (expectedHeight * profile.sensorWidthMm!) / profile.focalLengthMm!;
  const length =
    (expectedHeight * profile.sensorHeightMm!) / profile.focalLengthMm!;
  const step = length * (1 - q.forwardOverlap!);
  const gsdM = Math.max(
    width / profile.imageWidthPx!,
    length / profile.imageHeightPx!,
  );
  assert.ok(c.sorties.length > 0);
  for (const sortie of c.sorties) {
    assert.equal(sortie.cameraId, profile.id);
    assert.ok(sortie.remainingPct >= d.scenario.reservePct);
    for (const segment of sortie.segments) {
      assert.ok(segment.altitudeFromM < 150 && segment.altitudeToM < 150);
      assert.ok(segment.batteryToPct <= segment.batteryFromPct + 1e-8);
      if (segment.phase === 'survey') {
        assert.ok(Math.abs(segment.altitudeFromM - expectedHeight) < 1e-6);
        assert.ok(
          step / segment.groundSpeedMps >= profile.minimumIntervalSec! - 1e-8,
        );
        assert.ok(
          (segment.groundSpeedMps * profile.shutterSec!) / gsdM <=
            q.maximumBlurPx! + 1e-8,
        );
      }
    }
  }
  const footprints = plannedPhotoCoverage(d, c.sorties);
  assert.ok(footprints.length > 0);
  for (const row of footprints) {
    assert.equal(row.status, 'calculated');
    assert.ok(row.plannedFrames > 0);
    assert.ok(row.coveredM2 / row.requestedM2 >= 0.999999);
    assert.deepEqual(
      row.checks.filter((check) => check.status === 'fail'),
      [],
    );
  }
  const delivery = describeMissionDelivery(d, c);
  for (const job of delivery.jobs) {
    const expected = footprints.find((row) => row.jobId === job.jobId)!;
    assert.equal(
      job.expectedCaptureEvents,
      expected.plannedFrames,
      'Delivery must count triggers of the installed camera, not the legacy job optics.',
    );
    assert.equal(job.acquisitionConfirmed, false);
  }
  for (const view of missionCoverageViews(d, c)) {
    assert.equal(view.status, 'calculated', JSON.stringify(view.details));
    assert.equal(
      view.qualityStatus,
      'unknown',
      'Synthetic operator optics must not become documented survey quality.',
    );
    assert.ok(view.coveredM2 / view.requestedM2 >= 0.999999);
  }
  const strictCopy = missionAnalysisCandidateSchema.parse(
    JSON.parse(JSON.stringify(c)),
  );
  assert.deepEqual(
    strictCopy.sorties.map((s) => s.cameraId),
    c.sorties.map((s) => s.cameraId),
  );
  assert.deepEqual(
    strictCopy.jobCoverage.map((row) => [
      row.cameraVehicleId,
      row.cameraProfileId,
    ]),
    c.jobCoverage.map((row) => [row.cameraVehicleId, row.cameraProfileId]),
  );
  const geo = missionGeoJSON(d, c);
  for (const job of geo.properties.jobs) {
    assert.equal(job.cameraId, profile.id);
    assert.deepEqual(job.cameraProfile, profile);
  }
  for (const f of geo.features.filter((f) => f.properties.kind === 'sortie')) {
    assert.ok('cameraId' in f.properties);
    assert.equal(f.properties.cameraId, profile.id);
  }
  const effective = geo.properties.jobs[0].effectiveJob;
  assert.ok(effective);
  assert.equal(effective.altitudeM, expectedHeight);
  assert.ok(Math.abs(effective.swathM - width) < 1e-6);
  assert.ok(Math.abs(effective.triggerDistanceM! - step) < 1e-6);
  assert.match(JSON.stringify(geo), new RegExp(profile.id));
  assert.match(missionKML(d, c), new RegExp(profile.id));
}

for (const row of cases) {
  void test(`camera integration: ${row.model}/${row.camera.id} binds solver, footprints, energy and exports`, async () => {
    const { d } = fixture(row.model, row.camera);
    assertCameraRoute(d, await solveFeasible(d), row.camera);
  });
}

void test('camera integration: unknown or incomplete snapshots never fall back to PF1B job optics', async () => {
  for (const mode of ['unknown', 'missing-lens', 'not-installed'] as const) {
    const { d } = fixture('Gemini', cases[0].camera);
    const v = d.scenario.vehicles[0];
    if (mode === 'unknown') v.cameraProfiles![0].status = 'unknown';
    if (mode === 'missing-lens') delete v.cameraProfiles![0].focalLengthMm;
    if (mode === 'not-installed') v.cameraIds = [];
    const result = await solveMissionDocument(d);
    assert.ok(result.candidates.length);
    for (const c of result.candidates) {
      assert.notEqual(c.status, 'feasible_model', mode);
      assert.ok(failed(c).length > 0, mode);
    }
  }
});

void test('camera integration: fixed-route robustness keeps the selected optical layout, not the first eligible camera', async () => {
  const { d, p } = fixture('801', cases[3].camera);
  const selectedVehicle = d.scenario.vehicles[0];
  const first: Vehicle = {
    ...structuredClone(selectedVehicle),
    id: 'first-low-charge',
    name: 'Different optics, insufficient battery',
    start: p.inverse([-400, -400]),
    landing: p.inverse([-400, -400]),
    batteryPct: 26,
    cameraProfiles: [structuredClone(cases[2].camera)],
    cameraIds: [cases[2].camera.id],
  };
  d.scenario.vehicles.unshift(first);
  d.batteries.unshift({
    ...structuredClone(d.batteries[0]),
    id: 'first-current',
    vehicleId: first.id,
    initialPct: 26,
  });
  const c = await solveFeasible(d);
  assert.ok(c.sorties.every((s) => s.vehicleId === selectedVehicle.id));
  assert.ok(
    c.jobCoverage.every(
      (row) =>
        row.cameraVehicleId === selectedVehicle.id &&
        row.cameraProfileId === cases[3].camera.id,
    ),
  );
  assertCameraRoute(d, c, cases[3].camera);
  const before = JSON.stringify({ d, c });
  const report = await analyzeMissionRobustness({
    document: d,
    candidate: c,
    perturbations: [{ id: 'unchanged-camera', label: 'Без изменений' }],
    maxComputeMs: 5000,
  });
  assert.equal(
    report.baseline.status,
    'verified',
    JSON.stringify(report.baseline),
  );
  assert.equal(report.cases[0].status, 'safe', JSON.stringify(report.cases[0]));
  assert.ok(
    Math.abs(report.cases[0].metrics!.makespanSec - c.metrics.makespanSec) <
      1e-5,
  );
  assert.ok(
    Math.abs(report.cases[0].metrics!.flightTimeSec - c.metrics.flightTimeSec) <
      1e-5,
  );
  assert.equal(JSON.stringify({ d, c }), before);
});

void test('camera integration: RGB capability cannot assign an installed MS-only aircraft to RGB', async () => {
  const { d } = fixture('Gemini', cases[0].camera);
  const v = d.scenario.vehicles[0];
  v.jobs = ['RGB', 'MS'];
  v.cameraProfiles = [structuredClone(cases[1].camera)];
  v.cameraIds = ['pollux'];
  const result = await solveMissionDocument(d);
  assert.ok(result.candidates.every((c) => c.status !== 'feasible_model'));
  assert.ok(result.candidates.every((c) => c.sorties.length === 0));
});

void test('camera integration: cadence and blur constraints cannot be bypassed by permissive job fields', async () => {
  for (const constraint of ['cadence', 'blur'] as const) {
    const { d } = fixture('Gemini', cases[0].camera);
    const installed = d.scenario.vehicles[0].cameraProfiles![0];
    if (constraint === 'cadence') installed.minimumIntervalSec = 60;
    else installed.shutterSec = 1;
    d.jobs[0].quality.minimumIntervalSec = 0.01;
    d.jobs[0].quality.shutterSec = 0.000001;
    const result = await solveMissionDocument(d);
    assert.ok(
      result.candidates.every((c) => c.status !== 'feasible_model'),
      constraint,
    );
  }
});

void test('camera integration: camera identity and rehashed optical tampering fail independent replay', async () => {
  const { d } = fixture('Gemini', cases[0].camera);
  const c = await solveFeasible(d);
  const wrongId = structuredClone(c);
  wrongId.sorties[0].cameraId = 'missing-camera';
  assert.ok(
    (await validateExportedCandidate(d, wrongId)).some(
      (check) => check.status === 'fail',
    ),
  );
  const changed = structuredClone(d);
  changed.scenario.vehicles[0].cameraProfiles![0].focalLengthMm = 5;
  const rehashed = structuredClone(c);
  rehashed.plan.inputHash = await sha256(changed);
  assert.ok(
    (await validateExportedCandidate(changed, rehashed)).some(
      (check) => check.status === 'fail',
    ),
    'A newly calculated hash is not evidence that old routes satisfy changed optics.',
  );
});

void test('camera integration: two compatible RGB areas retain one continuous flight and both job exports', async () => {
  const profile = cases[0].camera;
  const { d, square } = fixture('Gemini', profile);
  d.jobs.push({
    ...structuredClone(d.jobs[0]),
    id: 'work-camera-second',
    name: 'Second RGB area',
    area: square(240, 0, 150),
  });
  const c = await solveFeasible(d);
  assert.equal(c.sorties.length, 1);
  assert.equal(
    c.sorties[0].segments.filter((s) => s.phase === 'takeoff').length,
    1,
  );
  assert.equal(
    c.sorties[0].segments.filter((s) => s.phase === 'landing').length,
    1,
  );
  assert.deepEqual(
    sortieJobIds(c.sorties[0]).sort(),
    d.jobs.map((j) => j.id).sort(),
  );
  assertCameraRoute(d, c, profile);
  const geo = missionGeoJSON(d, c);
  for (const job of d.jobs)
    assert.ok(
      geo.features.some(
        (f) =>
          f.properties.jobId === job.id && f.properties.kind === 'waypoint',
      ),
    );
});

void test('camera integration: good optics do not bypass the current battery reserve', async () => {
  const { d } = fixture('Gemini', cases[0].camera);
  d.scenario.reservePct = 25;
  d.scenario.vehicles[0].batteryPct = 26;
  d.batteries[0].initialPct = 26;
  const result = await solveMissionDocument(d);
  assert.ok(result.candidates.every((c) => c.status !== 'feasible_model'));
  assert.equal(d.batteries[0].initialPct, 26);
});

let shippedDocuments: Promise<MissionDocument[]> | undefined;
function sharedDocuments() {
  shippedDocuments ??= Promise.all(
    DEMO_IDS.map(async (id) =>
      prepareDemoDocument(
        parseMissionDocument(
          JSON.parse(
            await readFile(
              new URL(
                `../public/planner/scenarios/${id}.mission.json`,
                import.meta.url,
              ),
              'utf8',
            ),
          ),
        ),
      ),
    ),
  ).then(prepareSharedDemoFleet);
  return shippedDocuments;
}

for (const [index, id] of DEMO_IDS.entries()) {
  void test(`camera integration: shipped shared-fleet ${id} retains its acceptance outcome`, async () => {
    const original = (await sharedDocuments())[index];
    const before = JSON.stringify(original);
    const { document: d } = migrateMissionCameraBindings(original);
    assert.equal(JSON.stringify(original), before);
    const result = await solveMissionDocument(d);
    if (id !== 'demo-03-repair') {
      assert.ok(
        result.candidates.every((c) => c.status === 'feasible_model'),
        JSON.stringify(
          result.candidates.map((c) => ({
            status: c.status,
            failures: failed(c),
          })),
        ),
      );
      for (const c of result.candidates) {
        assert.deepEqual(
          (await validateExportedCandidate(d, c)).filter(
            (check) => check.status === 'fail',
          ),
          [],
        );
        assert.ok(c.sorties.every((s) => !!s.cameraId));
      }
    } else {
      const assigned = d.scenario.vehicles.find((v) => v.id === 'demo-07')!;
      assert.equal(assigned.batteryPct, 26);
      assert.ok(
        resolveVehicleCamera(assigned, 'RGB').camera,
        'Demo 3 must reject its energy budget, not a missing-camera migration.',
      );
      assert.ok(result.candidates.every((c) => c.status !== 'feasible_model'));
      assert.ok(
        result.candidates.every((c) =>
          failed(c).some((check) =>
            /STRIPS|COVERAGE|ENERGY|BATTERIES/.test(check.id),
          ),
        ),
      );
    }
  });
}
