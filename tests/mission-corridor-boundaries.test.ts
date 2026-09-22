import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoScenario } from '../lib/planner/demo.ts';
import {
  area,
  inside,
  prepareGeometry,
  projection,
  router,
  segmentInside,
} from '../lib/planner/geometry.ts';
import type { Multi, Point } from '../lib/planner/geometry.ts';
import type { Coordinate, Polygon } from '../lib/planner/schema.ts';

const rectangle = (
  left: number,
  bottom: number,
  right: number,
  top: number,
): Point[] => [
  [left, bottom],
  [right, bottom],
  [right, top],
  [left, top],
  [left, bottom],
];
function metricScenario(rings: Point[][], origin: Coordinate = [30, 60]) {
  const project = projection(origin);
  const polygon = (coordinates: Point[][]): Polygon => ({
    type: 'Polygon',
    coordinates: coordinates.map((ring) => ring.map(project.inverse)),
  });
  const scenario = demoScenario();
  scenario.area = polygon([rings[0]]);
  scenario.airspace = polygon(rings);
  scenario.exclusions = [];
  scenario.reserveSites = [];
  scenario.vehicles = scenario.vehicles.map((vehicle) => ({
    ...vehicle,
    start: origin,
    landing: origin,
  }));
  return { scenario, polygon, origin };
}

// Independent analytical reference: check each complete pair of boundary edges,
// including crossings and perpendicular minima in the interior of an edge.
function referenceBoundaryDistance(a: Multi, b: Multi): number {
  const pointDistance = (p: Point, q: Point, r: Point) => {
    const dx = r[0] - q[0],
      dy = r[1] - q[1];
    const length2 = dx * dx + dy * dy;
    const t =
      length2 === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / length2),
          );
    return Math.hypot(p[0] - q[0] - t * dx, p[1] - q[1] - t * dy);
  };
  const orientation = (p: Point, q: Point, r: Point) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  let minimum = Infinity;
  for (const ringA of a.flat())
    for (const ringB of b.flat())
      for (let i = 1; i < ringA.length; i++)
        for (let j = 1; j < ringB.length; j++) {
          const p = ringA[i - 1],
            q = ringA[i],
            r = ringB[j - 1],
            s = ringB[j];
          if (
            orientation(p, q, r) * orientation(p, q, s) < 0 &&
            orientation(r, s, p) * orientation(r, s, q) < 0
          )
            return 0;
          minimum = Math.min(
            minimum,
            pointDistance(p, r, s),
            pointDistance(q, r, s),
            pointDistance(r, p, q),
            pointDistance(s, p, q),
          );
        }
  return minimum;
}

void test('a 2.2 m² narrow hole cannot be crossed beside its long boundary edges', () => {
  const rings = [
    rectangle(-10, -10, 10, 210),
    rectangle(-0.0055, 0, 0.0055, 200),
  ];
  const raw: Multi = [rings];
  assert.equal(inside([0, 100], raw), false);
  assert.equal(segmentInside([-1, 100], [1, 100], raw), false);
  const { scenario, origin } = metricScenario(rings);
  const geometry = prepareGeometry(scenario, 0, origin);
  assert.equal(segmentInside([-1, 100], [1, 100], geometry.free), false);
  assert.ok(area(geometry.free) > 10);
});

void test('a long obstacle edge does not turn an insufficient clearance into a boundary point', () => {
  const { scenario, polygon, origin } = metricScenario([
    rectangle(-100, -100, 200, 2100),
  ]);
  scenario.exclusions = [polygon([rectangle(0, 0, 100, 2000)])];
  scenario.clearanceM = 15;
  const geometry = prepareGeometry(scenario, 0, origin);
  assert.equal(inside([-14.99, 1000], geometry.free), false);
  assert.equal(
    segmentInside([-14.99, 900], [-14.99, 1100], geometry.free),
    false,
  );
  assert.equal(
    segmentInside([-15.02, 900], [-15.02, 1100], geometry.free),
    true,
  );
});

void test('corridor margin is opt-in and shared origins keep independently prepared planes identical', () => {
  const { scenario, polygon, origin } = metricScenario([
    rectangle(-200, -200, 300, 200),
  ]);
  scenario.area = polygon([rectangle(-100, -100, 100, 100)]);
  scenario.exclusions = [polygon([rectangle(-30, -30, 30, 30)])];
  const defaultGeometry = prepareGeometry(scenario);
  assert.deepEqual(defaultGeometry.free, prepareGeometry(scenario, 0).free);
  assert.deepEqual(
    defaultGeometry.forward(scenario.area.coordinates[0][0]),
    [0, 0],
  );

  const first = prepareGeometry(scenario, 15, origin);
  const other = structuredClone(scenario);
  other.area = polygon([rectangle(0, -100, 200, 100)]);
  const second = prepareGeometry(other, 15, origin);
  assert.deepEqual(first.free, second.free);
  assert.deepEqual(
    first.forward([30.001, 60.001]),
    second.forward([30.001, 60.001]),
  );
  assert.deepEqual(first.inverse([0, 0]), origin);
});

void test('insetting protects exterior edges and expands airspace holes with full-edge clearance', () => {
  const templates: Point[][][] = [
    [rectangle(-250, -250, 250, 250), rectangle(-60, -60, 60, 60)],
    [
      [
        [-250, -250],
        [250, -250],
        [250, -50],
        [50, -50],
        [50, 250],
        [-250, 250],
        [-250, -250],
      ],
    ],
  ];
  for (const latitude of [-69.8, 0, 69.8])
    for (const angle of [0, 0.17, 0.67])
      for (const rings of templates) {
        const rotated = rings.map((ring) =>
          ring.map(
            ([x, y]): Point => [
              x * Math.cos(angle) - y * Math.sin(angle),
              x * Math.sin(angle) + y * Math.cos(angle),
            ],
          ),
        );
        const { scenario, origin } = metricScenario(rotated, [30, latitude]);
        for (const margin of [2, 15, 70]) {
          const geometry = prepareGeometry(scenario, margin, origin);
          const boundary: Multi = [
            scenario.airspace.coordinates.map((ring) =>
              ring.map(geometry.forward),
            ),
          ];
          assert.ok(
            referenceBoundaryDistance(geometry.free, boundary) >= margin - 1e-7,
            `Complete edges must clear ${margin} m at ${latitude}/${angle}`,
          );
          for (const ring of geometry.free.flat())
            for (let i = 1; i < ring.length; i++)
              assert.equal(segmentInside(ring[i - 1], ring[i], boundary), true);
          assert.ok(area(geometry.free) < area(boundary));
          if (rings.length > 1) {
            assert.equal(inside([0, 0], geometry.free), false);
            assert.equal(geometry.free[0].length, 2);
          }
        }
      }
});

void test('margin rejects routes too near exterior or hole boundaries and closes narrow corridors', () => {
  const { scenario, origin } = metricScenario([
    rectangle(-100, -100, 100, 100),
    rectangle(-20, -20, 20, 20),
  ]);
  const geometry = prepareGeometry(scenario, 15, origin);
  assert.equal(segmentInside([-90, -50], [-90, 50], geometry.free), false);
  assert.equal(segmentInside([34.99, -10], [34.99, 10], geometry.free), false);
  assert.equal(segmentInside([35.02, -10], [35.02, 10], geometry.free), true);
  assert.equal(inside([84.98, 0], geometry.free), true);
  assert.equal(inside([85.01, 0], geometry.free), false);

  // Two substantial rooms remain, but their 10 m neck is too narrow for 6 m on each side.
  const neck: Point[] = [
    [-100, -50],
    [-20, -50],
    [-20, -5],
    [20, -5],
    [20, -50],
    [100, -50],
    [100, 50],
    [20, 50],
    [20, 5],
    [-20, 5],
    [-20, 50],
    [-100, 50],
    [-100, -50],
  ];
  const narrow = metricScenario([neck]);
  assert.equal(
    segmentInside(
      [-60, 0],
      [60, 0],
      prepareGeometry(narrow.scenario, 0, narrow.origin).free,
    ),
    true,
  );
  const closed = prepareGeometry(narrow.scenario, 6, narrow.origin);
  assert.equal(closed.free.length, 2);
  assert.equal(router(closed)([-60, 0], [60, 0]), null);
});

void test('empty corridors and invalid margin inputs fail closed', () => {
  for (const width of [5, 29.99, 30, 30.01]) {
    const { scenario, origin } = metricScenario([rectangle(0, 0, width, 200)]);
    assert.throws(
      () => prepareGeometry(scenario, 15, origin),
      /коридор.*пуст|меньше 10 м²/,
    );
  }
  const { scenario, origin } = metricScenario([
    rectangle(-100, -100, 100, 100),
  ]);
  for (const invalid of [-1, NaN, Infinity, 101])
    assert.throws(
      () => prepareGeometry(scenario, invalid, origin),
      /Защитный запас воздушного коридора/,
    );
});
