import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareDemoDocument } from '../lib/planner/demo-session.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { validateExportedCandidate } from '../lib/planner/mission-validation.ts';
import { parseMissionDocument } from '../lib/planner/mission-schema.ts';
import {
  concurrentVehicleCount,
  missionFleetLabel,
} from '../lib/planner/mission-alternatives.ts';
import {
  isVehicleReserved,
  withMissionReservations,
} from '../lib/planner/mission-resource-reservations.ts';
import { createCatalogueVehicleProfile } from '../lib/planner/mission-vehicle-catalog.ts';
import {
  fleetStateFromDocument,
  refreshMissionFleetState,
} from '../lib/planner/mission-fleet-state.ts';

const document = prepareDemoDocument(
  parseMissionDocument(
    JSON.parse(
      await readFile(
        'public/planner/scenarios/demo-01-survey.mission.json',
        'utf8',
      ),
    ),
  ),
);
document.planning.maxComputeMs = 5000;
const result = await solveMissionDocument(document);
const [fast, economical] = result.candidates;

void test('same input distinguishes fast from economical and deduplicates deadline choice', async () => {
  assert.equal(fast.status, 'feasible_model');
  assert.equal(economical.status, 'feasible_model');
  const balanced = result.recommendation!.candidate;
  assert.equal(balanced.status, 'feasible_model');
  assert.ok(fast.metrics.makespanSec < economical.metrics.makespanSec * 0.8);
  assert.ok(economical.metrics.flightTimeSec < fast.metrics.flightTimeSec);
  assert.ok(concurrentVehicleCount(fast) >= 2);
  assert.equal(economical.metrics.vehicleCount, 1);
  assert.ok(balanced.metrics.makespanSec > fast.metrics.makespanSec);
  assert.ok(balanced.metrics.makespanSec <= economical.metrics.makespanSec);
  assert.ok(balanced.metrics.flightTimeSec < fast.metrics.flightTimeSec);
  assert.equal(
    balanced.metrics.flightTimeSec,
    economical.metrics.flightTimeSec,
  );
  assert.equal(balanced.metrics.vehicleCount, economical.metrics.vehicleCount);
  assert.equal(result.recommendation!.policy, 'deadline-min-flight-v1');
  for (const c of [fast, economical, balanced]) {
    assert.deepEqual(
      (await validateExportedCandidate(document, c)).filter(
        (v) => v.status === 'fail',
      ),
      [],
    );
    assert.ok(c.metrics.minimumRemainingPct >= document.scenario.reservePct);
    assert.equal(
      c.metrics.flightTimeSec,
      c.sorties.reduce((sum, s) => sum + s.durationSec, 0),
    );
    assert.equal(
      c.metrics.makespanSec,
      Math.max(...c.sorties.map((s) => s.endSec)),
    );
  }
});

void test('parallel count measures overlapping intervals, not the total fleet', () => {
  const sample = structuredClone(fast);
  let time = 0;
  for (const s of sample.sorties) {
    s.startSec = time;
    time += s.durationSec;
    s.endSec = time;
  }
  assert.equal(concurrentVehicleCount(sample), 1);
  assert.equal(concurrentVehicleCount({ sorties: [] }), 0);
  assert.match(missionFleetLabel(document, fast), /Геоскан Gemini/);
});

const other = {
  id: 'other-run',
  status: 'running' as const,
  startedAt: document.window.start,
  document: { ...structuredClone(document), id: 'other-mission' },
  candidate: economical,
};

void test('active and paused runs reserve aircraft; a changed date does not free an airborne vehicle', async () => {
  const later = structuredClone(document);
  later.window.start = '2026-06-17T06:00:00Z';
  later.window.end = '2026-06-17T17:00:00Z';
  for (const status of ['running', 'paused'] as const) {
    const d = withMissionReservations(later, [{ ...other, status }]);
    assert.equal(isVehicleReserved(d, economical.sorties[0].vehicleId), true);
  }
  const d = withMissionReservations(document, [other]);
  const next = await solveMissionDocument(d);
  for (const c of next.candidates) {
    assert.equal(c.status, 'feasible_model');
    assert.ok(
      c.sorties.every((s) => s.vehicleId !== economical.sorties[0].vehicleId),
    );
    assert.deepEqual(
      (await validateExportedCandidate(d, c)).filter(
        (v) => v.status === 'fail',
      ),
      [],
    );
  }
  const forged = structuredClone(economical);
  const checks = await validateExportedCandidate(d, forged);
  assert.ok(
    checks.some((c) => c.id === 'FLEET_RESERVATIONS' && c.status === 'fail'),
  );
});

void test('queue reserves overlapping windows; completion releases only the reservation, never invents charge', () => {
  const queued = { ...other, status: 'scheduled' as const, startedAt: null };
  const blocked = withMissionReservations(document, [queued]);
  assert.equal(blocked.resourceReservations?.length, 1);
  const later = structuredClone(document);
  later.window.start = '2026-06-17T06:00:00Z';
  later.window.end = '2026-06-17T17:00:00Z';
  assert.equal(
    withMissionReservations(later, [queued]).resourceReservations,
    undefined,
  );
  const state = fleetStateFromDocument(
    document,
    economical.sorties[0].vehicleId,
    document.window.start,
  );
  state.vehicle.batteryPct = 42;
  state.battery.initialPct = 42;
  const free = withMissionReservations(
    refreshMissionFleetState(blocked, [state]),
    [{ ...other, status: 'completed' }],
  );
  assert.equal(free.resourceReservations, undefined);
  assert.equal(
    free.scenario.vehicles.find((v) => v.id === state.id)!.batteryPct,
    42,
  );
});

void test('all reserved aircraft cannot produce an approved plan and reservations survive JSON', async () => {
  const d = withMissionReservations(document, [{ ...other, candidate: fast }]);
  const parsed = parseMissionDocument(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(parsed.resourceReservations, d.resourceReservations);
  const r = await solveMissionDocument(parsed);
  assert.ok(r.candidates.every((c) => c.status !== 'feasible_model'));
  assert.equal(r.recommendation, undefined);
  assert.ok(
    parsed.scenario.vehicles.every((v) => v.enabled),
    'operator selections are not destroyed',
  );
  assert.throws(() =>
    parseMissionDocument({
      ...d,
      resourceReservations: [
        { ...d.resourceReservations![0], vehicleId: 'missing' },
      ],
    }),
  );
});

void test('heterogeneous compatible fleet can work together; incompatible payload is excluded', async () => {
  const mixed = structuredClone(document);
  const center = mixed.scenario.vehicles[0];
  const optical = structuredClone(center.cameraProfiles![0]);
  Object.assign(center, createCatalogueVehicleProfile('801', 'rgb-ir'), {
    airspeedMps: 9,
    batteryPct: center.batteryPct,
  });
  const unknownCamera = await solveMissionDocument(mixed);
  assert.ok(
    unknownCamera.candidates.every((c) =>
      c.sorties.every((s) => s.vehicleId !== center.id),
    ),
    'Catalogue 801 optics are incomplete and cannot inherit PF1B from a work.',
  );
  center.cameraProfiles = [
    {
      ...optical,
      id: 'test-801-rgb',
      name: 'Synthetic operator RGB geometry',
      status: 'assumed',
      supportedModels: ['801'],
      source:
        'Synthetic regression only; no claim of actual 801 optical calibration.',
    },
  ];
  center.cameraIds = ['test-801-rgb'];
  const r = await solveMissionDocument(mixed);
  const c = r.candidates[0];
  assert.equal(c.status, 'feasible_model');
  assert.ok(c.sorties.some((s) => s.vehicleId === center.id));
  assert.ok(concurrentVehicleCount(c) >= 2);
  assert.match(missionFleetLabel(mixed, c), /801/);
  assert.match(missionFleetLabel(mixed, c), /Gemini/);
  assert.deepEqual(
    (await validateExportedCandidate(mixed, c)).filter(
      (v) => v.status === 'fail',
    ),
    [],
  );
  center.jobs = ['IR'];
  const restricted = await solveMissionDocument(mixed);
  assert.ok(
    restricted.candidates.every((c) =>
      c.sorties.every((s) => s.vehicleId !== center.id),
    ),
  );
});
