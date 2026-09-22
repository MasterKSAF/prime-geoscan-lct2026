import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildFixedWingGeometry,
  tangentCircularTurn,
  circularArcInside,
  circularArcPoint,
  fixedWingGeometryInside,
  sampleCircularArc,
} from '../lib/planner/fixed-wing-geometry.ts';
import { distance, segmentInside } from '../lib/planner/geometry.ts';
import type { Multi, Point } from '../lib/planner/geometry.ts';

const square = (x: number, y: number, side: number): Point[] => [
  [x, y],
  [x + side, y],
  [x + side, y + side],
  [x, y + side],
  [x, y],
];
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

void test('finite-radius 90-degree turn has tangent ends, exact arc cost and no hover', () => {
  const path = buildFixedWingGeometry({
    waypoints: [
      [0, 0],
      [100, 0],
      [100, 100],
    ],
    radiusM: 20,
    speedMps: 20,
    windMps: 0,
  });
  assert.equal(path.flightPlanningSupported, false);
  assert.equal(path.model, 'still-air-tangent-fillet-v1');
  assert.deepEqual(
    path.primitives.map((x) => x.kind),
    ['line', 'arc', 'line'],
  );
  const arc = path.primitives[1];
  assert.equal(arc.kind, 'arc');
  if (arc.kind !== 'arc') throw new Error('Expected arc');
  near(arc.from[0], 80);
  near(arc.from[1], 0);
  near(arc.to[0], 100);
  near(arc.to[1], 20);
  near(arc.center[0], 80);
  near(arc.center[1], 20);
  near(arc.sweepRad, Math.PI / 2);
  near(path.lengthM, 160 + Math.PI * 10);
  near(path.durationSec, path.lengthM / 20);
  assert.ok(path.primitives.every((p) => p.lengthM > 0 && p.durationSec > 0));
  for (let i = 1; i < path.primitives.length; i++)
    near(distance(path.primitives[i - 1].to, path.primitives[i].from), 0);
});

void test('right turns are mirrored without negative time or radius', () => {
  const turn = tangentCircularTurn([0, 0], [100, 0], [100, -100], 20, 25)!;
  near(turn.arc.sweepRad, -Math.PI / 2);
  near(turn.arc.center[1], -20);
  near(turn.arc.lengthM, Math.PI * 10);
  assert.ok(turn.arc.durationSec > 0);
});

void test('straight continuation needs no invented manoeuvre, reversal requires a real loop', () => {
  assert.equal(tangentCircularTurn([0, 0], [100, 0], [200, 0], 20, 25), null);
  assert.throws(
    () => tangentCircularTurn([0, 0], [100, 0], [0, 0], 20, 25),
    /180/,
  );
});

void test('insufficient approach, adjacent overlapping fillets and duplicate points fail closed', () => {
  assert.throws(
    () => tangentCircularTurn([0, 0], [10, 0], [10, 100], 20, 25),
    /не хватает/,
  );
  assert.throws(
    () =>
      buildFixedWingGeometry({
        waypoints: [
          [0, 0],
          [100, 0],
          [100, 30],
          [200, 30],
        ],
        radiusM: 20,
        speedMps: 25,
        windMps: 0,
      }),
    /перекрываются/,
  );
  assert.throws(
    () =>
      buildFixedWingGeometry({
        waypoints: [
          [0, 0],
          [0, 0],
        ],
        radiusM: 20,
        speedMps: 25,
        windMps: 0,
      }),
    /1 см/,
  );
});

void test('groundwork rejects wind, zero speed, zero radius and nonfinite data', () => {
  const valid = {
    waypoints: [
      [0, 0],
      [100, 0],
    ] as Point[],
    radiusM: 20,
    speedMps: 25,
    windMps: 0,
  };
  for (const bad of [
    { ...valid, windMps: 1 },
    { ...valid, windMps: NaN },
    { ...valid, radiusM: 0 },
    { ...valid, radiusM: Infinity },
    { ...valid, speedMps: 0 },
    {
      ...valid,
      waypoints: [
        [NaN, 0],
        [100, 0],
      ] as Point[],
    },
  ])
    assert.throws(() => buildFixedWingGeometry(bad));
});

void test('analytic curve check catches small obstacle missed by the straight chord', () => {
  const arc = tangentCircularTurn([0, 0], [100, 0], [100, 100], 20, 25)!.arc,
    p = circularArcPoint(arc, 0.5),
    free: Multi = [
      [square(-10, -10, 150), square(p[0] - 0.2, p[1] - 0.2, 0.4)],
    ];
  assert.equal(segmentInside(arc.from, arc.to, free), true);
  assert.equal(circularArcInside(arc, free), false);
  assert.equal(circularArcInside(arc, [[square(-10, -10, 150)]]), true);
});

void test('entire smooth path checks lines as well as turns and rejects crossing outside permitted space', () => {
  const path = buildFixedWingGeometry({
    waypoints: [
      [0, 0],
      [100, 0],
      [100, 100],
    ],
    radiusM: 20,
    speedMps: 25,
    windMps: 0,
  });
  assert.equal(fixedWingGeometryInside(path, [[square(-10, -10, 150)]]), true);
  assert.equal(
    fixedWingGeometryInside(path, [[square(-10, -10, 150), square(30, -2, 4)]]),
    false,
  );
  assert.equal(fixedWingGeometryInside(path, [[square(0, 0, 90)]]), false);
});

void test('display chords have a known error bound and are not used for analytical verification', () => {
  const arc = tangentCircularTurn([0, 0], [100, 0], [100, 100], 20, 25)!.arc,
    points = sampleCircularArc(arc, 0.05);
  for (let i = 1; i < points.length; i++) {
    const midpoint: Point = [
      (points[i][0] + points[i - 1][0]) / 2,
      (points[i][1] + points[i - 1][1]) / 2,
    ];
    assert.ok(arc.radiusM - distance(midpoint, arc.center) <= 0.05 + 1e-8);
  }
  assert.throws(() => sampleCircularArc(arc, 0));
  assert.throws(() => sampleCircularArc(arc, 1e-20));
});

void test('analytic intersections detect thin obstacles across 120 deterministic angles and radii', () => {
  let seed = 29152026;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let i = 0; i < 120; i++) {
    const heading = random() * Math.PI * 2,
      delta = (0.2 + random() * 2.2) * (i % 2 ? -1 : 1),
      radius = 5 + random() * 95,
      corner: Point = [random() * 1000, random() * 1000],
      before: Point = [
        corner[0] - Math.cos(heading) * 1000,
        corner[1] - Math.sin(heading) * 1000,
      ],
      after: Point = [
        corner[0] + Math.cos(heading + delta) * 1000,
        corner[1] + Math.sin(heading + delta) * 1000,
      ],
      arc = tangentCircularTurn(before, corner, after, radius, 25)!.arc,
      point = circularArcPoint(arc, 0.05 + random() * 0.9),
      half = 0.001,
      free: Multi = [
        [
          square(-3000, -3000, 8000),
          square(point[0] - half, point[1] - half, half * 2),
        ],
      ];
    assert.equal(
      circularArcInside(arc, free),
      false,
      `Thin obstacle case ${i}`,
    );
  }
});

void test('tampered arc endpoints, nonfinite angles and zero-length geometry are rejected', () => {
  const arc = tangentCircularTurn([0, 0], [100, 0], [100, 100], 20, 25)!.arc;
  assert.throws(() =>
    circularArcInside({ ...arc, from: [0, 0] }, [[square(-10, -10, 150)]]),
  );
  assert.throws(() => circularArcPoint({ ...arc, sweepRad: NaN }, 0.5));
  assert.throws(() => circularArcPoint(arc, 2));
});
