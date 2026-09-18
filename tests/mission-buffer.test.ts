import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoScenario } from '../lib/planner/demo.ts';
import {
  conservativeBuffer,
  inside,
  prepareGeometry,
  projection,
  segmentClearance,
} from '../lib/planner/geometry.ts';
import type { Multi, Point } from '../lib/planner/geometry.ts';
import type { Coordinate, Polygon } from '../lib/planner/schema.ts';

const square = (min: number, max: number): Point[] => [
  [min, min],
  [max, min],
  [max, max],
  [min, max],
  [min, min],
];
function metricPolygon(rings: Point[][], at: Coordinate = [30, 60]) {
  const project = projection(at);
  const polygon: Polygon = {
    type: 'Polygon',
    coordinates: rings.map((ring) => ring.map(project.inverse)),
  };
  const original: Multi = [
    polygon.coordinates.map((ring) => ring.map(project.forward)),
  ];
  return { polygon, original, project };
}
function boundaryClearance(buffered: Multi, original: Multi): number {
  let minimum = Infinity;
  for (const polygon of buffered)
    for (const ring of polygon)
      for (let i = 1; i < ring.length; i++)
        minimum = Math.min(
          minimum,
          segmentClearance(ring[i - 1], ring[i], original),
        );
  return minimum;
}

void test('circumscribed metric buffer guarantees complete-edge clearance, including former arc deficit', () => {
  const source = demoScenario(),
    g = prepareGeometry(source);
  const original: Multi = [
    source.exclusions[0].coordinates.map((ring) => ring.map(g.forward)),
  ];
  const buffered = conservativeBuffer(
    source.exclusions[0],
    source.clearanceM,
    g.forward,
  );
  assert.ok(
    boundaryClearance(buffered, original) >= source.clearanceM,
    'Every full boundary segment is at least r from source, not just vertices',
  );
  const formerUnsafe = g.forward([30.30159548678421, 60.03538485687872]);
  assert.equal(
    inside(formerUnsafe, g.free),
    false,
    '13.858m gap may not pass a 15m clearance',
  );
});

void test('metric clearance is conservative for rotated convex and concave polygons at bounded latitudes', () => {
  const templates: Point[][] = [
    square(-100, 100),
    [
      [-150, -150],
      [150, -150],
      [150, -20],
      [20, -20],
      [20, 150],
      [-150, 150],
      [-150, -150],
    ],
  ];
  for (const latitude of [-69.8, 0, 69.8])
    for (const angle of [0, 0.11, 0.45, 0.99, 1.54])
      for (const template of templates) {
        const ring = template.map(
          ([x, y]): Point => [
            x * Math.cos(angle) - y * Math.sin(angle),
            x * Math.sin(angle) + y * Math.cos(angle),
          ],
        );
        const { polygon, original, project } = metricPolygon(
          [ring],
          [30, latitude],
        );
        for (const clearance of [2, 15, 100]) {
          const buffered = conservativeBuffer(
            polygon,
            clearance,
            project.forward,
          );
          assert.ok(
            boundaryClearance(buffered, original) >= clearance - 1e-7,
            `${latitude}/${angle}/${clearance}`,
          );
          assert.ok(buffered.flat(2).length < 200);
        }
      }
});

void test('holes shrink without dropping identity, small holes close through geometric union', () => {
  const { polygon, original, project } = metricPolygon([
    square(-200, 200),
    square(-80, 80),
  ]);
  const result = conservativeBuffer(polygon, 15, project.forward);
  assert.equal(result.length, 1);
  assert.equal(result[0].length, 2);
  assert.equal(inside([0, 0], result), false);
  assert.equal(inside([70, 0], result), true);
  assert.ok(boundaryClearance(result, original) >= 15 - 1e-7);
  const small = metricPolygon([square(-200, 200), square(-5, 5)]);
  const filled = conservativeBuffer(small.polygon, 15, small.project.forward);
  assert.equal(filled[0].length, 1);
  assert.equal(inside([0, 0], filled), true);
});

void test('analytic segment clearance catches crossing and degenerate endpoints without sampling', () => {
  const obstacle: Multi = [[square(-10, 10)]];
  assert.equal(segmentClearance([-20, 0], [20, 0], obstacle), 0);
  assert.equal(segmentClearance([0, 0], [0, 0], obstacle), 0);
  assert.equal(segmentClearance([-30, 20], [30, 20], obstacle), 10);
  assert.ok(
    Math.abs(segmentClearance([20, 20], [20, 20], obstacle) - Math.sqrt(200)) <
      1e-10,
  );
});

void test('buffer input complexity, local radius and invalid topology fail closed', () => {
  const basic = metricPolygon([square(-100, 100)]);
  for (const invalid of [-1, 0, 101, Infinity, NaN])
    assert.throws(
      () => conservativeBuffer(basic.polygon, invalid, basic.project.forward),
      /Защитный запас/,
    );
  const bowtie = metricPolygon([
    [
      [0, 0],
      [100, 100],
      [0, 100],
      [100, 0],
      [0, 0],
    ],
  ]);
  assert.throws(() =>
    conservativeBuffer(bowtie.polygon, 15, bowtie.project.forward),
  );
  const far = metricPolygon([
    [
      [15001, 0],
      [16001, 0],
      [16001, 100],
      [15001, 100],
      [15001, 0],
    ],
  ]);
  assert.throws(
    () => conservativeBuffer(far.polygon, 15, far.project.forward),
    /15 км/,
  );
  const tooMany = metricPolygon([
    Array.from(
      { length: 72 },
      (_, i): Point => [
        Math.cos((i * 2 * Math.PI) / 71) * 100,
        Math.sin((i * 2 * Math.PI) / 71) * 100,
      ],
    ),
  ]);
  assert.throws(
    () => conservativeBuffer(tooMany.polygon, 15, tooMany.project.forward),
    /сложный/,
  );
  const ring: Point[] = Array.from({ length: 69 }, (_, i) => [
    Math.cos((i * 2 * Math.PI) / 69) * 1000,
    Math.sin((i * 2 * Math.PI) / 69) * 1000,
  ]);
  ring.push([...ring[0]]);
  const bounded = metricPolygon([ring]);
  const buffered = conservativeBuffer(
    bounded.polygon,
    100,
    bounded.project.forward,
  );
  assert.ok(buffered.flat(2).length <= 3000);
  assert.ok(boundaryClearance(buffered, bounded.original) >= 100 - 1e-7);
});
