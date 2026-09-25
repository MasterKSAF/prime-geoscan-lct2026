import test from 'node:test';
import assert from 'node:assert/strict';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { projection } from '../lib/planner/geometry.ts';
import {
  recoveryOptions,
  createSafetySession,
  returnReserveAlert,
  recoverySnapshot,
} from '../lib/planner/mission-safety.ts';
import { firstSortieConflict } from '../lib/planner/mission-validation.ts';
import {
  occupyAfterLanding,
  stationaryRecoverySortie,
} from '../lib/planner/mission-recovery-dispatch.ts';
import type {
  MissionCandidate,
  ScheduledSortie,
} from '../lib/planner/mission-schema.ts';
import type { Coordinate } from '../lib/planner/schema.ts';

/** Synthetic geometry isolates recovery. This is not a validated survey mission. */
export function recoveryFixture() {
  const d = demoMission(1),
    p = projection([30.3, 60.035]);
  const point = (x: number, y: number): Coordinate => p.inverse([x, y]);
  d.planning.safetyPolicy = 'continuous-occupancy-v1';
  d.planning.temporalBufferSec = 1;
  d.planning.separationHorizontalM = 30;
  d.planning.separationVerticalM = 15;
  d.scenario.wind.speedMps = 1;
  d.scenario.reserveSites = [];
  const template = d.scenario.vehicles[0];
  const endpoints = [
    { from: point(100, 400), to: point(900, 400), height: 100 },
    { from: point(900, 400), to: point(100, 400), height: 100 },
    { from: point(500, 150), to: point(500, -180), height: 3 },
    { from: point(500, -60), to: point(500, -60), height: 0 },
  ];
  d.scenario.vehicles = endpoints.map((e, i) => ({
    ...structuredClone(template),
    id: `recovery-${i}`,
    name: `БВС ${i + 1}`,
    start: e.to,
    landing: e.to,
    batteryPct: 100,
    climbMps: 3,
    descentMps: 3,
    maxWindMps: 10,
    effectiveEnduranceMin: 40,
  }));
  const sorties: ScheduledSortie[] = endpoints.slice(0, 3).map((e, i) => ({
    id: `flight-${i}`,
    vehicleId: d.scenario.vehicles[i].id,
    jobId: d.jobs[0].id,
    batteryId: `battery-${i}`,
    name: `test-${i}`,
    startSec: 0,
    endSec: 1200,
    readySec: 1300,
    durationSec: 1200,
    distanceM: 0,
    remainingPct: 80,
    strips: 1,
    shots: null,
    segments: [
      {
        from: e.from,
        to: e.from,
        startSec: 0,
        endSec: 1000,
        phase: i === 2 ? 'takeoff' : 'transit',
        altitudeFromM: e.height,
        altitudeToM: e.height,
        groundSpeedMps: 0,
        airspeedMps: 0,
        distanceM: 0,
        batteryFromPct: 97 - i / 2,
        batteryToPct: 97 - i / 2,
      },
      {
        from: e.from,
        to: e.to,
        startSec: 1000,
        endSec: 1200,
        phase: 'return',
        altitudeFromM: 100,
        altitudeToM: 100,
        groundSpeedMps: 4,
        airspeedMps: 4,
        distanceM: 800,
        batteryFromPct: 95,
        batteryToPct: 80,
      },
    ],
  }));
  const candidate = {
    sorties,
    metrics: { makespanSec: 1200 },
  } as MissionCandidate;
  const row = { document: d, candidate, progressSec: 117.428 };
  const input = {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'reserve' as const,
    vehicleId: d.scenario.vehicles[0].id,
    windMps: 1,
    batteryPct: 100,
  };
  return { row, input, point };
}

void test('three-aircraft return resolves crossings and low takeoff without hiding parked UAVs', () => {
  const { row, input } = recoveryFixture();
  const before = JSON.stringify(row);
  const s = createSafetySession(row, input, new Date('2026-09-23T17:00:00Z'));
  assert.equal(s.stage, 'returning');
  assert.equal(s.batteryPct, 97);
  const options = recoveryOptions(row.document, row.candidate, s);
  const o = options.find((x) => x.valid)!;
  assert.equal(o.sorties.length, 3);
  const low = o.sorties.find((x) => x.vehicleId === 'recovery-2')!;
  const firstHorizontal = low.segments.find((x) => x.distanceM > 0)!;
  assert.ok(firstHorizontal.altitudeFromM >= 100);
  assert.ok(
    low.segments.some(
      (x) => x.phase === 'takeoff' && x.altitudeToM > x.altitudeFromM,
    ),
  );
  const occupied = o.sorties.map((x) => occupyAfterLanding(x, o.endSec));
  for (let i = 0; i < occupied.length; i++) {
    for (let j = i + 1; j < occupied.length; j++)
      assert.equal(
        firstSortieConflict(row.document, occupied[i], occupied[j]),
        null,
      );
    assert.equal(
      firstSortieConflict(
        row.document,
        occupied[i],
        stationaryRecoverySortie(
          'recovery-3',
          row.document.scenario.vehicles[3].start,
          s.modelTimeSec,
          o.endSec,
        ),
      ),
      null,
    );
  }
  assert.ok(o.diagnostics!.tested > 0);
  assert.equal(JSON.stringify(row), before);
  assert.equal(
    returnReserveAlert(row.document, row.candidate, row.progressSec),
    null,
  );
  assert.deepEqual(recoveryOptions(row.document, row.candidate, s), options);
});

void test('crossing returns can be separated by individual waiting when height cannot change', () => {
  const { row, input, point } = recoveryFixture();
  row.document.scenario.vehicles = row.document.scenario.vehicles.slice(0, 2);
  row.candidate.sorties = row.candidate.sorties.slice(0, 2);
  row.candidate.sorties[1].segments[0].from = point(500, 0);
  row.candidate.sorties[1].segments[0].to = point(500, 0);
  row.document.scenario.vehicles[1].landing = point(500, 800);
  row.document.scenario.vehicles[1].start = point(500, 800);
  row.document.flightEnvelope.maxAltitudeM = 100;
  const s = createSafetySession(row, input, new Date('2026-09-23T17:00:00Z'));
  assert.equal(s.stage, 'returning');
  const o = recoveryOptions(row.document, row.candidate, s).find(
    (x) => x.policy === 'home',
  )!;
  assert.equal(o.valid, true);
  const departure = o.sorties.map(
    (x) => x.segments.find((s) => s.distanceM > 0)!.startSec,
  );
  assert.notEqual(departure[0], departure[1]);
  assert.ok(
    o.sorties.every((x) => x.remainingPct >= row.document.scenario.reservePct),
  );
});

void test('the same occupied landing point remains blocked; a known free pad permits diversion', () => {
  const { row, input, point } = recoveryFixture();
  row.candidate.sorties = row.candidate.sorties.slice(0, 1);
  row.document.scenario.vehicles = row.document.scenario.vehicles.slice(0, 2);
  row.document.scenario.vehicles[1].start = [
    ...row.document.scenario.vehicles[0].landing,
  ];
  row.document.scenario.vehicles[1].landing = [
    ...row.document.scenario.vehicles[0].landing,
  ];
  let s = createSafetySession(row, input, new Date('2026-09-23T17:00:00Z'));
  assert.equal(s.stage, 'blocked');
  const blocked = recoveryOptions(row.document, row.candidate, s);
  assert.ok(blocked.every((x) => !x.valid));
  assert.ok(
    blocked[0].diagnostics?.conflicts.some(
      (c) => c.kind === 'occupied-pad' && c.otherVehicleId === 'recovery-1',
    ),
  );
  row.document.bases = [
    {
      id: 'shared-base',
      name: 'Общая база',
      coordinate: row.document.scenario.vehicles[0].landing,
      landingPads: [
        {
          id: 'occupied',
          coordinate: row.document.scenario.vehicles[0].landing,
          enabled: true,
          kinds: ['multirotor'],
        },
        {
          id: 'free',
          coordinate: point(900, 600),
          enabled: true,
          kinds: ['multirotor'],
        },
      ],
    },
  ];
  s = createSafetySession(row, input, new Date('2026-09-23T17:00:00Z'));
  assert.equal(s.stage, 'returning');
  assert.equal(s.policy, 'home');
  row.document.bases[0].landingPads![1].enabled = false;
  s = createSafetySession(row, input, new Date('2026-09-23T17:00:00Z'));
  assert.equal(s.stage, 'blocked');
  delete row.document.bases;
  row.document.scenario.reserveSites = [point(900, 600)];
  s = createSafetySession(row, input, new Date('2026-09-23T17:00:00Z'));
  assert.equal(s.stage, 'returning');
  assert.equal(s.policy, 'nearest');
});

void test('actual snapshot charge is saved for wind/reserve; battery event can lower but never recharge', () => {
  const { row, input } = recoveryFixture();
  const now = new Date('2026-09-23T17:00:00Z');
  assert.equal(
    recoverySnapshot(row.document, row.candidate, row.progressSec)[0]
      .batteryPct,
    97,
  );
  assert.equal(
    createSafetySession(row, { ...input, kind: 'wind', windMps: 30 }, now)
      .batteryPct,
    97,
  );
  assert.equal(
    createSafetySession(row, { ...input, kind: 'battery', batteryPct: 99 }, now)
      .batteryPct,
    97,
  );
  const empty = createSafetySession(
    row,
    { ...input, kind: 'battery', batteryPct: 1 },
    now,
  );
  assert.equal(empty.batteryPct, 1);
  assert.equal(empty.stage, 'blocked');
});
