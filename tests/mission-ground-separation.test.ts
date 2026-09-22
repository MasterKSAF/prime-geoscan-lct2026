import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { projection } from '../lib/planner/geometry.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { groundSeparationConflicts } from '../lib/planner/mission-validation.ts';
import type { ScheduledSortie } from '../lib/planner/mission-schema.ts';
import type { Coordinate, Segment } from '../lib/planner/schema.ts';

const projected = projection([30.3, 60.035]);
const point = (x: number, y = 0): Coordinate => projected.inverse([x, y]);

function fixture() {
  const document = demoMission(1);
  document.planning.safetyPolicy = 'continuous-occupancy-v1';
  document.planning.temporalBufferSec = 0;
  document.planning.separationHorizontalM = 30;
  document.planning.separationVerticalM = 15;
  document.scenario.vehicles[0].start = point(-200);
  document.scenario.vehicles[0].landing = point(-200);
  document.scenario.vehicles[1].start = point(200);
  document.scenario.vehicles[1].landing = point(200);
  return document;
}

/** Synthetic trajectories isolate occupancy; no energy or coverage claims. */
function flight(
  vehicleId: string,
  from: Coordinate,
  to: Coordinate,
  startSec: number,
  id = `${vehicleId}-${startSec}`,
): ScheduledSortie {
  const endSec = startSec + 40;
  const segment = (
    phase: Segment['phase'],
    a: Coordinate,
    b: Coordinate,
    start: number,
    end: number,
    heightA: number,
    heightB: number,
  ): Segment => ({
    phase,
    from: a,
    to: b,
    startSec: start,
    endSec: end,
    altitudeFromM: heightA,
    altitudeToM: heightB,
    airspeedMps: 10,
    groundSpeedMps: 10,
    distanceM: 100,
    batteryFromPct: 90,
    batteryToPct: 80,
  });
  return {
    id,
    vehicleId,
    jobId: 'rgb-01',
    batteryId: `${vehicleId}-battery-1`,
    name: 'Synthetic ground-occupancy regression',
    startSec,
    endSec,
    readySec: endSec + 180,
    durationSec: 40,
    distanceM: 100,
    remainingPct: 80,
    strips: 1,
    shots: null,
    segments: [
      segment('takeoff', from, from, startSec, startSec + 10, 0, 100),
      segment('transit', from, to, startSec + 10, endSec - 10, 100, 100),
      segment('landing', to, to, endSec - 10, endSec, 100, 0),
    ],
  };
}

function hasPair(
  conflicts: ReturnType<typeof groundSeparationConflicts>,
  first = 'gemini-1',
  second = 'gemini-2',
) {
  return conflicts.some(
    (conflict) =>
      (conflict.vehicleId === first && conflict.otherVehicleId === second) ||
      (conflict.vehicleId === second && conflict.otherVehicleId === first),
  );
}

void test('occupancy rejects a shared physical base even with separated flight intervals', () => {
  const d = fixture();
  for (const vehicle of d.scenario.vehicles) {
    vehicle.start = point(0);
    vehicle.landing = point(0);
  }
  const flights = [
    flight('gemini-1', point(0), point(0), 100),
    flight('gemini-2', point(0), point(0), 200),
  ];
  assert.equal(hasPair(groundSeparationConflicts(d, flights)), true);
});

void test('landing cannot occupy the position of a UAV awaiting its first takeoff', () => {
  const d = fixture();
  d.scenario.vehicles[0].landing = point(200);
  const flights = [
    flight('gemini-1', point(-200), point(200), 100),
    flight('gemini-2', point(200), point(400), 240),
  ];
  assert.equal(hasPair(groundSeparationConflicts(d, flights)), true);
});

void test('a UAV remains physically present after its final landing', () => {
  const d = fixture();
  d.scenario.vehicles[0].landing = point(0);
  d.scenario.vehicles[1].landing = point(0);
  const flights = [
    flight('gemini-1', point(-200), point(0), 100),
    flight('gemini-2', point(200), point(0), 240),
  ];
  assert.equal(hasPair(groundSeparationConflicts(d, flights)), true);
});

void test('ground occupancy persists during the interval between repeated sorties', () => {
  const d = fixture();
  d.scenario.vehicles[0].landing = point(0);
  d.scenario.vehicles[1].landing = point(0);
  const flights = [
    flight('gemini-1', point(-200), point(0), 100),
    flight('gemini-1', point(0), point(-200), 400),
    flight('gemini-2', point(200), point(0), 240),
  ];
  assert.equal(hasPair(groundSeparationConflicts(d, flights)), true);
});

void test('an unassigned UAV is not invisible to a landing aircraft', () => {
  const d = fixture();
  d.scenario.vehicles[0].landing = point(200);
  assert.equal(
    hasPair(
      groundSeparationConflicts(d, [
        flight('gemini-1', point(-200), point(200), 100),
      ]),
    ),
    true,
  );
});

void test('separate bases permit sequential or simultaneous flights and repeat departures', () => {
  const d = fixture();
  const flights = [
    flight('gemini-1', point(-200), point(-200), 100),
    flight('gemini-2', point(200), point(200), 100),
    flight('gemini-1', point(-200), point(-200), 400),
    flight('gemini-2', point(200), point(200), 500),
  ];
  assert.deepEqual(groundSeparationConflicts(d, flights), []);
});

void test('ground separation retains vertical clearance for a high transit over a parked UAV', () => {
  const d = fixture();
  d.scenario.vehicles[0].landing = point(600);
  assert.deepEqual(
    groundSeparationConflicts(d, [
      flight('gemini-1', point(-200), point(600), 100),
    ]),
    [],
  );
});

void test('the full solver cannot certify two aircraft sharing the same occupied pad', async () => {
  const d = fixture();
  const first = d.scenario.vehicles[0];
  for (const vehicle of d.scenario.vehicles) {
    vehicle.start = [...first.start];
    vehicle.landing = [...first.start];
  }
  d.jobs[0].assignedVehicleIds = [first.id];
  d.jobs[0].daylight = 'none';
  const second = structuredClone(d.jobs[0]);
  second.id = 'other-job';
  second.assignedVehicleIds = [d.scenario.vehicles[1].id];
  d.jobs.push(second);
  const result = await solveMissionDocument(d);
  for (const candidate of result.candidates) {
    assert.notEqual(candidate.status, 'feasible_model');
    assert.ok(
      candidate.checks.some(
        (check) => check.id === 'GROUND_SEPARATION' && check.status === 'fail',
      ) || candidate.trace.some((event) => event.event === 'GROUND_REJECT'),
    );
  }
});
