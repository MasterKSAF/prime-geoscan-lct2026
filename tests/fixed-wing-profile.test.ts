import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { projection } from '../lib/planner/geometry.ts';
import {
  GEOSCAN_201_PASSPORT,
  vehiclePlanningEligibility,
} from '../lib/planner/fixed-wing-profile.ts';
import {
  missionJobContext,
  solveMissionDocument,
} from '../lib/planner/mission-engine.ts';
import {
  validateExportedCandidate,
  validateMissionCandidate,
} from '../lib/planner/mission-validation.ts';
import type { MissionDocument } from '../lib/planner/mission-schema.ts';
import type { Vehicle } from '../lib/planner/schema.ts';

const aircraft = (): Vehicle => ({
  ...demoMission(1).scenario.vehicles[0],
  id: 'geoscan-201',
  name: 'Геоскан 201',
  kind: 'fixedWing',
  model: '201',
  airspeedMps: 22,
  maxWindMps: 12,
  effectiveEnduranceMin: 100,
});
function mixedRegistry(): MissionDocument {
  const d = demoMission(1),
    p = projection([30.3, 60.035]),
    v = aircraft();
  v.start = p.inverse([-250, -250]);
  v.landing = v.start;
  d.scenario.vehicles.push(v);
  d.batteries.push({ ...d.batteries[0], id: '201-current', vehicleId: v.id });
  d.planning.safetyPolicy = 'continuous-occupancy-v1';
  d.planning.maxComputeMs = 10000;
  return d;
}

void test('201 passport keeps airspeed, maxima and source separate from supported capability', () => {
  assert.equal(GEOSCAN_201_PASSPORT.minAirspeedMps, 64 / 3.6);
  assert.equal(GEOSCAN_201_PASSPORT.maxAirspeedMps, 130 / 3.6);
  assert.equal(GEOSCAN_201_PASSPORT.maxWindMps, 12);
  assert.equal(GEOSCAN_201_PASSPORT.flightPlanningSupported, true);
  assert.equal(vehiclePlanningEligibility(aircraft()).supported, false);
  assert.equal(vehiclePlanningEligibility(aircraft()).reasons.length, 1);
});

void test('201 contradicting type, minimum speed, wind and endurance are diagnosed without fabricated performance', () => {
  const v = {
      ...aircraft(),
      kind: 'multirotor' as const,
      airspeedMps: 10,
      maxWindMps: 20,
      effectiveEnduranceMin: 240,
    },
    result = vehiclePlanningEligibility(v);
  assert.equal(result.supported, false);
  assert.equal(result.reasons.length, 5);
  assert.ok(result.reasons.some((s) => s.includes('64–130')));
  assert.ok(result.reasons.some((s) => s.includes('12 м/с')));
  assert.ok(result.reasons.some((s) => s.includes('180 минут')));
});

void test('supported multirotor limits are preserved', () => {
  const v = demoMission(1).scenario.vehicles[0];
  assert.equal(vehiclePlanningEligibility(v).supported, true);
  assert.equal(
    vehiclePlanningEligibility({ ...v, airspeedMps: 16 }).supported,
    false,
  );
  assert.equal(
    vehiclePlanningEligibility({ ...v, maxWindMps: 11 }).supported,
    false,
  );
});

void test('automatic mixed registry excludes 201 but may complete using validated copters', async () => {
  const d = mixedRegistry(),
    result = await solveMissionDocument(d),
    valid = result.candidates.filter((c) => c.status === 'feasible_model');
  assert.equal(
    valid.length,
    2,
    JSON.stringify(
      result.candidates.map((c) => ({
        status: c.status,
        checks: c.checks.filter((x) => x.status === 'fail'),
      })),
    ),
  );
  for (const c of valid) {
    assert.ok(c.sorties.every((s) => s.vehicleId !== 'geoscan-201'));
    assert.ok(
      c.trace.some(
        (t) =>
          t.event === 'VEHICLE_EXCLUDED' && t.detail.includes('geoscan-201'),
      ),
    );
    assert.equal(
      (await validateExportedCandidate(d, c)).filter((x) => x.status === 'fail')
        .length,
      0,
    );
  }
});

void test('explicitly assigning only 201 remains unsupported with a concrete explanation', async () => {
  const d = mixedRegistry();
  d.jobs[0].assignedVehicleIds = ['geoscan-201'];
  const result = await solveMissionDocument(d);
  assert.ok(
    result.candidates.every(
      (c) => c.status === 'unsupported' && c.sorties.length === 0,
    ),
  );
  assert.ok(
    result.candidates.every((c) =>
      c.checks.some(
        (x) =>
          x.id.startsWith('UNSUPPORTED') && x.detail.includes('аварийного'),
      ),
    ),
  );
});

void test('excluded or disabled 201 still occupies its physical parking position', async () => {
  const d = mixedRegistry(),
    copter = d.scenario.vehicles[0],
    wing = d.scenario.vehicles.find((v) => v.id === 'geoscan-201')!;
  wing.start = [...copter.start];
  wing.landing = [...copter.start];
  wing.enabled = false;
  d.jobs[0].assignedVehicleIds = [copter.id];
  const result = await solveMissionDocument(d);
  assert.ok(result.candidates.every((c) => c.status !== 'feasible_model'));
  assert.ok(
    result.candidates.some((c) =>
      c.trace.some((t) => t.event === 'GROUND_REJECT'),
    ),
  );
});

void test('a returned copter route cannot be relabelled as fixed wing and pass independent verification', async () => {
  const d = demoMission(1),
    result = await solveMissionDocument(d),
    c = result.candidates.find((x) => x.status === 'feasible_model')!;
  assert.ok(c);
  for (const v of d.scenario.vehicles) {
    v.kind = 'fixedWing';
    v.model = '201';
  }
  const checks = validateMissionCandidate(
    d,
    c.sorties,
    d.jobs.map((j) => missionJobContext(d, j)),
  );
  assert.equal(checks.find((x) => x.id === 'COMPATIBILITY')?.status, 'fail');
});
