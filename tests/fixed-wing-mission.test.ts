import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareGeometry, distance } from '../lib/planner/geometry.ts';
import { fixedWingTurnRadius } from '../lib/planner/fixed-wing-profile.ts';
import {
  angleDifference,
  capsuleInside,
  dubinsCandidates,
  fixedWingLoiter,
} from '../lib/planner/fixed-wing-dubins.ts';
import {
  buildFixedWingSortie,
  buildFixedWingRecoverySegments,
  fixedWingSegmentKinematics,
  validateFixedWingSortie,
} from '../lib/planner/fixed-wing-mission.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import {
  validateExportedCandidate,
  segmentSeparation,
  sortiesConflict,
  positionAt,
} from '../lib/planner/mission-validation.ts';
import { recoveryOptions } from '../lib/planner/mission-safety.ts';
import type { SafetySession } from '../lib/planner/mission-safety.ts';

import { fixedWingFixture } from './fixtures/fixed-wing.ts';

void test('Dubins CSC connectors close 180 degree reversals with finite moving turns', () => {
  const candidates = dubinsCandidates(
    { point: [0, 0], headingRad: 0 },
    { point: [0, 100], headingRad: Math.PI },
    100,
  );
  assert.ok(candidates.length >= 2);
  for (const path of candidates) {
    assert.ok(
      path.every(
        (piece) => piece.lengthM > 0 && distance(piece.from, piece.to) > 0,
      ),
    );
    assert.ok(distance(path.at(-1)!.to, [0, 100]) < 1e-3);
    assert.ok(angleDifference(path.at(-1)!.headingToRad, Math.PI) < 1e-6);
    for (let i = 1; i < path.length; i++)
      assert.ok(
        angleDifference(path[i - 1].headingToRad, path[i].headingFromRad) <
          1e-6,
      );
  }
});

void test('Dubins endpoints are independently checked over 100 deterministic inputs', () => {
  for (let i = 0; i < 100; i++) {
    const end = {
      point: [150 + i * 7, Math.sin(i) * 500] as [number, number],
      headingRad: i / 7,
    };
    const candidates = dubinsCandidates(
      { point: [0, 0], headingRad: i / 13 },
      end,
      70 + i,
    );
    assert.ok(candidates.length > 0, String(i));
    assert.ok(
      candidates.every((path) => distance(path.at(-1)!.to, end.point) < 0.001),
    );
  }
});

void test('loiter is a moving closed circle, not a stationary wait', () => {
  const loop = fixedWingLoiter({ point: [0, 0], headingRad: 0 }, 100);
  assert.ok(loop.length >= 36);
  assert.ok(distance(loop.at(-1)!.to, [0, 0]) < 1e-6);
  assert.ok(
    Math.abs(loop.reduce((sum, p) => sum + p.lengthM, 0) - 200 * Math.PI) <
      1e-6,
  );
});

void test('capsules catch complete thin obstacles and corridors narrower than the tube', () => {
  const exterior = [
    [-100, -100],
    [200, -100],
    [200, 100],
    [-100, 100],
    [-100, -100],
  ] as [number, number][];
  const hole = [
    [40, 2],
    [41, 2],
    [41, 3],
    [40, 3],
    [40, 2],
  ] as [number, number][];
  assert.equal(capsuleInside([0, 0], [100, 0], 5, [[exterior, hole]]), false);
  assert.equal(capsuleInside([0, 0], [100, 0], 1, [[exterior, hole]]), true);
  assert.equal(capsuleInside([0, 99], [100, 99], 5, [[exterior]]), false);
  assert.equal(capsuleInside([0, 0], [100, 0], NaN, [[exterior]]), false);
  assert.equal(capsuleInside([0, 0], [100, 0], Infinity, [[exterior]]), false);
});

void test('201 sorties include forward launch, real U-turns, battery use and wind-drift parachute', () => {
  const { d, context, strips, v } = fixedWingFixture();
  const sortie = buildFixedWingSortie(
    d,
    context,
    { vehicle: v, position: context.geometry.forward(v.start) },
    { id: 'wing-installed', pct: 100 },
    strips,
    'wing-sortie',
  );
  assert.ok(sortie, 'expected model sortie');
  assert.ok(sortie.segments[0].distanceM > 500);
  assert.ok(
    sortie.segments.some(
      (s) => s.phase === 'turn' && s.fixedWing?.kind === 'arc',
    ),
  );
  assert.equal(sortie.segments.at(-1)!.fixedWing?.kind, 'parachute');
  assert.ok(sortie.segments.at(-1)!.distanceM > 0);
  assert.ok(sortie.remainingPct < 100 && sortie.remainingPct > 20);
  assert.deepEqual(
    validateFixedWingSortie(d, sortie, context).filter(
      (c) => c.status === 'fail',
    ),
    [],
  );
  assert.ok(
    validateFixedWingSortie(d, sortie, context).some(
      (c) => c.status === 'unknown',
    ),
  );
});

void test('201 works with still air and nonzero wind, and radius grows conservatively', () => {
  for (const wind of [0, 2, 8, 12]) {
    const { d, context, strips, v } = fixedWingFixture(wind);
    const sortie = buildFixedWingSortie(
      d,
      context,
      { vehicle: v, position: context.geometry.forward(v.start) },
      { id: 'wing-installed', pct: 100 },
      strips,
      'wing-sortie',
    );
    assert.ok(sortie, `wind=${wind}`);
  }
  const { v } = fixedWingFixture();
  assert.ok(fixedWingTurnRadius(v, 12) > fixedWingTurnRadius(v, 2));
});

void test('201 rejects insufficient battery, unsupported hover profile and forbidden launch corridor', () => {
  const { d, context, strips, v, square } = fixedWingFixture();
  const build = () =>
    buildFixedWingSortie(
      d,
      context,
      { vehicle: v, position: context.geometry.forward(v.start) },
      { id: 'wing-installed', pct: v.batteryPct },
      strips,
      'wing-sortie',
    );
  v.batteryPct = 20;
  assert.equal(build(), null);
  v.batteryPct = 100;
  v.airspeedMps = 5;
  assert.equal(build(), null);
  v.airspeedMps = 22;
  d.scenario.exclusions = [square(-1050, -600, 100)];
  context.geometry = prepareGeometry(d.scenario);
  assert.equal(build(), null);
});

void test('201 independent validator rejects tampered radius, understated tube and fake hover', () => {
  const { d, context, strips, v } = fixedWingFixture();
  const sortie = buildFixedWingSortie(
    d,
    context,
    { vehicle: v, position: context.geometry.forward(v.start) },
    { id: 'wing-installed', pct: 100 },
    strips,
    'wing-sortie',
  )!;
  assert.ok(sortie);
  const original = sortie.segments.find((s) => s.fixedWing?.kind === 'arc')!;
  for (const change of ['radius', 'tube', 'hover']) {
    const seg = structuredClone(original);
    if (change === 'radius') seg.fixedWing!.radiusM = 1;
    if (change === 'tube') seg.fixedWing!.tubeRadiusM = 0;
    if (change === 'hover') seg.to = [...seg.from];
    assert.ok(
      fixedWingSegmentKinematics(d, v, seg, context.geometry.forward).errors
        .length > 0,
      change,
    );
  }
});

void test('recovery preserves airborne heading, uses actual charge and ends at wind-corrected landing', () => {
  const { d, context, v, p } = fixedWingFixture();
  const start = {
    coordinate: p.inverse([200, 200]),
    altitudeM: 120,
    headingRad: Math.PI / 2,
    batteryPct: 72,
    timeSec: 100,
  };
  const segments = buildFixedWingRecoverySegments(
    d,
    v,
    context.geometry,
    start,
    v.landing,
  );
  assert.ok(segments);
  assert.ok(
    angleDifference(segments[0].fixedWing!.headingFromRad, start.headingRad) <
      1e-6,
  );
  assert.ok(segments.at(-1)!.batteryToPct < 72);
  assert.equal(segments.at(-1)!.altitudeToM, 0);
  assert.ok(
    distance(
      context.geometry.forward(segments.at(-1)!.to),
      context.geometry.forward(v.landing),
    ) < 0.01,
  );
  assert.equal(
    buildFixedWingRecoverySegments(
      d,
      v,
      context.geometry,
      { ...start, batteryPct: 20 },
      v.landing,
    ),
    null,
  );
});

void test('201 end-to-end solve, independent replay, runtime recovery and tamper rejection', async () => {
  const { d } = fixedWingFixture();
  d.planning.safetyPolicy = 'continuous-occupancy-v1';
  d.planning.batteryPolicy = 'installed-current-v1';
  d.planning.maxComputeMs = 10000;
  const result = await solveMissionDocument(d),
    candidate = result.candidates.find((c) => c.status === 'feasible_model');
  assert.ok(
    candidate,
    JSON.stringify(
      result.candidates.map((c) => ({
        status: c.status,
        fails: c.checks.filter((x) => x.status === 'fail'),
        trace: c.trace.slice(-4),
      })),
    ),
  );
  const replay = await validateExportedCandidate(d, candidate);
  assert.deepEqual(
    replay.filter((c) => c.status === 'fail'),
    [],
  );
  const survey = candidate.sorties[0].segments.find(
    (s) => s.phase === 'survey',
  )!;
  const time = (survey.startSec + survey.endSec) / 2;
  const session: SafetySession = {
    id: crypto.randomUUID(),
    source: 'simulation',
    kind: 'sensor',
    vehicleId: 'wing-201',
    modelTimeSec: time,
    detectedAt: new Date().toISOString(),
    windMps: 2,
    batteryPct: positionAt(survey, time).batteryPct,
    stage: 'pending',
    delaySec: 60,
    policy: 'home',
    progressSec: time,
    decision: 'none',
    events: [{ at: new Date().toISOString(), text: 'Тест отказа сенсора.' }],
  };
  assert.ok(
    recoveryOptions(d, candidate, session).every((o) => !o.valid),
    'A 60-second hover must not be fabricated for fixed wing',
  );
  session.delaySec = 0;
  const options = recoveryOptions(d, candidate, session);
  assert.ok(
    options.some((o) => o.valid),
    JSON.stringify(options.map((o) => o.reasons)),
  );
  const parachute = candidate.sorties[0].segments.find(
    (s) => s.fixedWing?.kind === 'parachute',
  )!;
  assert.ok(
    recoveryOptions(d, candidate, {
      ...session,
      modelTimeSec: parachute.startSec,
    }).every(
      (o) => !o.valid && o.reasons.some((reason) => reason.includes('парашют')),
    ),
    'Already deployed parachute cannot become a powered aircraft again',
  );
  const cloudy = structuredClone(d);
  cloudy.environment = {
    cloudBaseM: survey.altitudeFromM + 10,
    cloudClearanceM: 0,
    visibilityM: null,
    minVisibilityM: null,
    source:
      'Тест: центр под облаками, но маневренная трубка пересекает облачный потолок.',
  };
  assert.ok(
    recoveryOptions(cloudy, candidate, session).every((o) => !o.valid),
    'All return tubes, not only initial altitude, must clear the cloud limit',
  );
  for (const option of options.filter((o) => o.valid))
    assert.ok(
      option.sorties
        .flatMap((s) => s.segments)
        .every((s) => s.fixedWing?.kind === 'parachute' || s.distanceM > 0),
    );
  for (const fault of ['missing', 'tube']) {
    const copy = structuredClone(candidate),
      seg = copy.sorties[0].segments.find((s) => s.fixedWing?.kind === 'arc')!;
    if (fault === 'missing') delete seg.fixedWing;
    else seg.fixedWing!.tubeRadiusM = 0;
    assert.ok(
      (await validateExportedCandidate(d, copy)).some(
        (c) => c.status === 'fail',
      ),
      fault,
    );
  }
});

void test('separation rejects intersecting conservative tubes despite noncolliding centerlines', () => {
  const { d, context, strips, v } = fixedWingFixture();
  const sortie = buildFixedWingSortie(
    d,
    context,
    { vehicle: v, position: context.geometry.forward(v.start) },
    { id: 'wing-installed', pct: 100 },
    strips,
    'wing-sortie',
  )!;
  const first = sortie.segments.find((s) => s.fixedWing?.kind === 'arc')!;
  const second = structuredClone(first),
    p = context.geometry;
  const offset = d.planning.separationHorizontalM + 1;
  second.from = p.inverse([
    p.forward(first.from)[0] + offset,
    p.forward(first.from)[1],
  ]);
  second.to = p.inverse([
    p.forward(first.to)[0] + offset,
    p.forward(first.to)[1],
  ]);
  assert.equal(
    segmentSeparation(
      first,
      second,
      d.planning.separationHorizontalM,
      d.planning.separationVerticalM,
      p.forward,
    )?.conflict,
    false,
  );
  d.planning.temporalBufferSec = 0;
  assert.equal(
    sortiesConflict(
      d,
      { ...sortie, segments: [first] },
      {
        ...sortie,
        id: 'other-sortie',
        vehicleId: 'other-wing',
        segments: [second],
      },
    ),
    true,
  );
});
