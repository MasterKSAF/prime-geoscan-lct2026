import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projection } from '../lib/planner/geometry.ts';
import type { Multi, Point } from '../lib/planner/geometry.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import type { ScheduledSortie } from '../lib/planner/mission-schema.ts';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import {
  compileRestrictions,
  segmentIntersectsVolume,
  segmentSeparation,
  sortiesConflict,
  validateExportedCandidate,
} from '../lib/planner/mission-validation.ts';
import type { Segment } from '../lib/planner/schema.ts';

const plane = projection([30, 60]);
const repeatMission = () =>
  SHOWCASE_SCENARIOS.find(
    (scenario) => scenario.id === 'repeat-sorties',
  )!.create();

/** Synthetic metre-plane trajectories make no energy or coverage claims. */
function segment(
  from: Point,
  to: Point,
  startSec = 0,
  endSec = 10,
  altitudeFromM = 100,
  altitudeToM = altitudeFromM,
): Segment {
  const distanceM = Math.hypot(to[0] - from[0], to[1] - from[1]);
  return {
    from: plane.inverse(from),
    to: plane.inverse(to),
    phase: 'transit',
    startSec,
    endSec,
    altitudeFromM,
    altitudeToM,
    airspeedMps: distanceM / (endSec - startSec),
    groundSpeedMps: distanceM / (endSec - startSec),
    distanceM,
    batteryFromPct: 100,
    batteryToPct: 99,
  };
}

function sortie(s: Segment, vehicleId: string): ScheduledSortie {
  return {
    id: `sortie-${vehicleId}`,
    jobId: 'rgb-1',
    vehicleId,
    batteryId: `${vehicleId}-battery-1`,
    name: 'Synthetic continuous-separation regression',
    startSec: s.startSec,
    endSec: s.endSec,
    readySec: s.endSec,
    durationSec: s.endSec - s.startSec,
    distanceM: s.distanceM,
    remainingPct: 99,
    strips: 1,
    shots: null,
    segments: [s],
  };
}

function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Independent sampling oracle: interpolate metre coordinates and height directly. */
function sampleState(s: Segment, timeSec: number) {
  const from = plane.forward(s.from),
    to = plane.forward(s.to),
    fraction = (timeSec - s.startSec) / (s.endSec - s.startSec);
  return {
    x: from[0] + (to[0] - from[0]) * fraction,
    y: from[1] + (to[1] - from[1]) * fraction,
    z: s.altitudeFromM + (s.altitudeToM - s.altitudeFromM) * fraction,
  };
}

function sampledConflict(a: Segment, b: Segment, steps: number) {
  const begin = Math.max(a.startSec, b.startSec),
    end = Math.min(a.endSec, b.endSec);
  if (end < begin) return false;
  for (let i = 0; i <= steps; i++) {
    const t = begin + ((end - begin) * i) / steps,
      first = sampleState(a, t),
      second = sampleState(b, t);
    if (
      Math.hypot(first.x - second.x, first.y - second.y) < 30 - 1e-6 &&
      Math.abs(first.z - second.z) <= 15 - 1e-6
    )
      return true;
  }
  return false;
}

void test('standalone separation is symmetric across a 20 km north-south segment', () => {
  const a = segment([0, -10000], [0, 10000], 0, 200),
    b = segment([29.99, 0], [29.99, 0], 0, 200),
    ab = segmentSeparation(a, b, 30, 15),
    ba = segmentSeparation(b, a, 30, 15);
  assert.equal(ab?.conflict, true);
  assert.equal(ba?.conflict, true);
  assert.ok(Math.abs(ab!.distanceM - ba!.distanceM) < 1e-7);
  assert.ok(Math.abs(ab!.atSec - 100) < 1e-7);
  assert.ok(Math.abs(ab!.atSec - ba!.atSec) < 1e-7);
});

void test('continuous-occupancy sorties share the mission plane in either argument order', () => {
  const d = repeatMission();
  d.planning.temporalBufferSec = 0;
  d.planning.separationHorizontalM = 30;
  d.planning.separationVerticalM = 15;
  d.scenario.area.coordinates[0][0] = [30, 60];
  const a = sortie(segment([0, -10000], [0, 10000], 0, 200), 'first');
  for (const [offset, expected] of [
    [29.99, true],
    [30.05, false],
  ] as const) {
    const b = sortie(segment([offset, 0], [offset, 0], 0, 200), 'second');
    assert.equal(sortiesConflict(d, a, b), expected, `a/b at ${offset} m`);
    assert.equal(sortiesConflict(d, b, a), expected, `b/a at ${offset} m`);
  }
});

void test('analytic separation misses no conflicts found by a deterministic dense-sample oracle', () => {
  const random = randomSource(0x51afe),
    makeSegment = () => {
      const point = (): Point => [random() * 240 - 120, random() * 240 - 120],
        start = random() * 8;
      return segment(
        point(),
        point(),
        start,
        start + 2 + random() * 18,
        40 + random() * 120,
        40 + random() * 120,
      );
    };
  let sampledHits = 0,
    sampledMisses = 0;
  for (let i = 0; i < 256; i++) {
    const a = makeSegment(),
      b = makeSegment(),
      sampled = sampledConflict(a, b, 2000),
      analytic = segmentSeparation(a, b, 30, 15, plane.forward),
      reversed = segmentSeparation(b, a, 30, 15, plane.forward);
    assert.equal(analytic?.conflict, reversed?.conflict, `pair ${i}: symmetry`);
    if (sampled) {
      sampledHits++;
      assert.equal(
        analytic?.conflict,
        true,
        `pair ${i}: missed sampled conflict`,
      );
    } else sampledMisses++;
    if (analytic?.conflict) {
      const first = sampleState(a, analytic.atSec),
        second = sampleState(b, analytic.atSec);
      assert.ok(analytic.atSec >= Math.max(a.startSec, b.startSec) - 1e-7);
      assert.ok(analytic.atSec <= Math.min(a.endSec, b.endSec) + 1e-7);
      assert.ok(Math.hypot(first.x - second.x, first.y - second.y) < 30);
      assert.ok(Math.abs(first.z - second.z) <= 15 + 1e-7);
    }
  }
  assert.ok(sampledHits > 10, 'The oracle must exercise actual conflicts');
  assert.ok(
    sampledMisses > 10,
    'The oracle must also exercise clear trajectories',
  );
});

void test('a collision between animation frames is caught continuously', () => {
  const a = segment([-101, 0], [99, 0], 0, 0.1),
    b = segment([0, -101], [0, 99], 0, 0.1),
    result = segmentSeparation(a, b, 30, 15, plane.forward);
  assert.equal(sampledConflict(a, b, 1), false);
  assert.equal(result?.conflict, true);
  assert.ok(Math.abs(result!.atSec - 0.0505) < 1e-7);
});

void test('head-on and overtaking trajectories use relative motion', () => {
  const headOn = segmentSeparation(
    segment([-100, 0], [100, 0]),
    segment([100, 0], [-100, 0]),
    30,
    15,
    plane.forward,
  );
  assert.equal(headOn?.conflict, true);
  assert.ok(Math.abs(headOn!.atSec - 5) < 1e-7);
  const overtaking = segmentSeparation(
    segment([0, 0], [200, 0]),
    segment([50, 0], [150, 0]),
    30,
    15,
    plane.forward,
  );
  assert.equal(overtaking?.conflict, true);
  assert.ok(Math.abs(overtaking!.atSec - 5) < 1e-7);
});

void test('changing height is intersected with the horizontal encounter interval', () => {
  const a = segment([-100, 0], [100, 0]);
  assert.equal(
    segmentSeparation(
      a,
      segment([0, 0], [0, 0], 0, 10, 50, 150),
      30,
      15,
      plane.forward,
    )?.conflict,
    true,
  );
  assert.equal(
    segmentSeparation(
      a,
      segment([0, 0], [0, 0], 0, 10, 100, 200),
      30,
      15,
      plane.forward,
    )?.conflict,
    false,
  );
  assert.equal(
    segmentSeparation(
      a,
      segment([0, 0], [0, 0], 0, 10, 115, 115),
      30,
      15,
      plane.forward,
    )?.conflict,
    true,
  );
  assert.equal(
    segmentSeparation(
      a,
      segment([0, 0], [0, 0], 0, 10, 115.01, 115.01),
      30,
      15,
      plane.forward,
    ),
    null,
  );
});

void test('increasing temporal guard never removes a conflict, including endpoint holds', () => {
  const d = repeatMission();
  d.scenario.area.coordinates[0][0] = [30, 60];
  d.planning.separationHorizontalM = 30;
  d.planning.separationVerticalM = 15;
  const first = sortie(segment([0, 0], [0, 0]), 'first'),
    second = sortie(segment([0, 0], [0, 0], 12, 20), 'second');
  d.planning.temporalBufferSec = 0;
  assert.equal(sortiesConflict(d, first, second), false);
  d.planning.temporalBufferSec = 1;
  assert.equal(sortiesConflict(d, first, second), true);
  assert.equal(
    sortiesConflict(
      d,
      first,
      sortie(segment([0, 0], [0, 0], 12.01, 20), 'second'),
    ),
    false,
  );

  const random = randomSource(0x61afe);
  for (let i = 0; i < 80; i++) {
    const a = sortie(
        segment([-80, 0], [80, 0], 0, 10, 100, 100 + random() * 30),
        'first',
      ),
      delay = random() * 20,
      b = sortie(
        segment([0, -80], [0, 80], delay, delay + 10, 100, 130),
        'second',
      );
    let alreadyConflicting = false;
    for (const guard of [0, 0.25, 0.5, 1, 2, 5]) {
      d.planning.temporalBufferSec = guard;
      const conflict = sortiesConflict(d, a, b);
      if (alreadyConflicting)
        assert.equal(conflict, true, `pair ${i}, guard ${guard}`);
      alreadyConflicting ||= conflict;
      assert.equal(sortiesConflict(d, b, a), conflict);
    }
  }
});

void test('4D restrictions include simultaneous footprint, altitude and time boundaries', () => {
  const volume = {
    footprint: [
      [
        [
          [-5, -5],
          [5, -5],
          [5, 5],
          [-5, 5],
          [-5, -5],
        ],
      ],
    ] as Multi,
    minAltitudeM: 90,
    maxAltitudeM: 110,
    startSec: 10,
    endSec: 20,
  };
  const intersects = (s: Segment) =>
    segmentIntersectsVolume(s, volume, plane.forward);
  assert.equal(intersects(segment([5, 5], [5, 5], 9, 10, 90)), true);
  assert.equal(intersects(segment([5, 5], [5, 5], 20, 21, 110)), true);
  for (const s of [
    segment([5.01, 0], [5.01, 0], 10, 20),
    segment([0, 0], [0, 0], 10, 20, 89.99),
    segment([0, 0], [0, 0], 10, 20, 110.01),
    segment([0, 0], [0, 0], 9, 9.99),
    segment([0, 0], [0, 0], 20.01, 21),
  ])
    assert.equal(intersects(s), false);
});

void test('continuous-occupancy 4D time guards extend both closed boundaries', () => {
  const d = repeatMission(),
    instant = (sec: number) =>
      new Date(Date.parse(d.window.start) + sec * 1000).toISOString();
  d.planning.temporalBufferSec = 2;
  d.restrictions = [
    {
      id: 'guarded-volume',
      name: 'Synthetic timed volume',
      kind: 'noFlight',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-5, -5],
            [5, -5],
            [5, 5],
            [-5, 5],
            [-5, -5],
          ].map((p) => plane.inverse(p as Point)),
        ],
      },
      minAltitudeM: 90,
      maxAltitudeM: 110,
      startAt: instant(20),
      endAt: instant(30),
      source: 'Synthetic regression',
    },
  ];
  const [guarded] = compileRestrictions(d, plane);
  assert.equal(guarded.startSec, 18);
  assert.equal(guarded.endSec, 32);
  for (const [start, end, expected] of [
    [17, 18, true],
    [32, 33, true],
    [17, 17.99, false],
    [32.01, 33, false],
  ] as const)
    assert.equal(
      segmentIntersectsVolume(
        segment([0, 0], [0, 0], start, end),
        guarded,
        plane.forward,
      ),
      expected,
    );
  delete d.planning.safetyPolicy;
  const [legacy] = compileRestrictions(d, plane);
  assert.equal(legacy.startSec, 20);
  assert.equal(legacy.endSec, 30);
});

const delayedDocument = repeatMission();
delayedDocument.planning.temporalBufferSec = 7;
delayedDocument.restrictions = [
  {
    id: 'temporary-airspace',
    name: 'Synthetic complete-airspace closure',
    kind: 'noFlight',
    geometry: structuredClone(delayedDocument.scenario.airspace),
    minAltitudeM: 0,
    maxAltitudeM: null,
    startAt: delayedDocument.window.start,
    endAt: new Date(
      Date.parse(delayedDocument.window.start) + 900000,
    ).toISOString(),
    source: 'Synthetic continuous-occupancy regression',
  },
];
let delayedResult: ReturnType<typeof solveMissionDocument> | undefined;
const solveDelayed = () =>
  (delayedResult ??= solveMissionDocument(delayedDocument));

void test('full solver delays repeat sorties beyond the guarded closure and export validation agrees', async () => {
  assert.equal(
    delayedDocument.planning.safetyPolicy,
    'continuous-occupancy-v1',
  );
  const result = await solveDelayed();
  for (const candidate of result.candidates) {
    assert.equal(candidate.status, 'feasible_model');
    assert.ok(candidate.sorties.length >= 3);
    assert.ok(candidate.sorties.every((s) => s.startSec > 907));
    const checks = await validateExportedCandidate(delayedDocument, candidate);
    assert.deepEqual(
      checks.filter((check) => check.status === 'fail'),
      [],
    );
    for (const id of [
      'FOUR_DIMENSIONAL',
      'SEPARATION',
      'GROUND_SEPARATION',
      'TIME',
      'ENDPOINTS',
    ])
      assert.equal(checks.find((check) => check.id === id)?.status, 'pass', id);
  }
});

void test('export validation rejects an advanced start that re-enters the guarded closure', async () => {
  const candidate = structuredClone((await solveDelayed()).candidates[0]),
    first = [...candidate.sorties].sort((a, b) => a.startSec - b.startSec)[0];
  first.startSec -= 200;
  first.endSec -= 200;
  first.readySec -= 200;
  for (const s of first.segments) {
    s.startSec -= 200;
    s.endSec -= 200;
  }
  candidate.plan.missions = structuredClone(candidate.sorties);
  const checks = await validateExportedCandidate(delayedDocument, candidate);
  assert.equal(
    checks.find((check) => check.id === 'FOUR_DIMENSIONAL')?.status,
    'fail',
  );
});

void test('export validation rejects a changed trajectory height with matching map data', async () => {
  const candidate = structuredClone((await solveDelayed()).candidates[0]),
    survey = candidate.sorties[0].segments.find((s) => s.phase === 'survey')!;
  survey.altitudeToM += 50;
  candidate.plan.missions = structuredClone(candidate.sorties);
  const checks = await validateExportedCandidate(delayedDocument, candidate);
  assert.equal(
    checks.find((check) => check.id === 'ENDPOINTS')?.status,
    'fail',
  );
});

void test('export validation rejects a changed trajectory coordinate with matching map data', async () => {
  const candidate = structuredClone((await solveDelayed()).candidates[0]),
    transit = candidate.sorties[0].segments.find((s) => s.phase === 'transit')!;
  transit.to[0] += 0.001;
  candidate.plan.missions = structuredClone(candidate.sorties);
  const checks = await validateExportedCandidate(delayedDocument, candidate);
  assert.equal(
    checks.find((check) => check.id === 'ENDPOINTS')?.status,
    'fail',
  );
  assert.equal(checks.find((check) => check.id === 'TIME')?.status, 'fail');
});
