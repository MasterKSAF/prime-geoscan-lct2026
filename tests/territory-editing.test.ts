import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closedDrawing,
  firstDrawingLoop,
  ellipseDrawing,
  simplifyDrawing,
  moveAreaVertex,
} from '../lib/planner/territory-editing.ts';
import { projection, area } from '../lib/planner/geometry.ts';
import { demoMission } from '../lib/planner/mission-demo.ts';
import type { Coordinate } from '../lib/planner/schema.ts';
const p = projection([30.3, 60.03]);
const coords = (points: number[][]): Coordinate[] =>
  points.map((v) => p.inverse(v as Coordinate));

void test('crossing closes first loop and removes both tails', () => {
  const points = coords([
    [-50, 0],
    [100, 0],
    [100, 100],
    [0, 100],
    [0, -50],
    [-30, -100],
  ]);
  const loop = firstDrawingLoop(points)!;
  assert.equal(loop.length, 5);
  assert.ok(Math.abs(p.forward(loop[0])[0]) < 0.001);
  assert.ok(
    Math.abs(
      area([closedDrawing(points).coordinates.map((r) => r.map(p.forward))]) -
        10000,
    ) < 0.01,
  );
});
void test('closure at first vertex produces one closing coordinate', () => {
  const shape = closedDrawing(
    coords([
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 0],
    ]),
  );
  assert.equal(shape.coordinates[0].length, 4);
  assert.deepEqual(shape.coordinates[0][0], shape.coordinates[0].at(-1));
});
void test('open polygon closes on apply, collinear drawing rejected', () => {
  assert.equal(
    closedDrawing(
      coords([
        [0, 0],
        [30, 0],
        [30, 30],
        [0, 30],
      ]),
    ).coordinates[0].length,
    5,
  );
  assert.throws(() =>
    closedDrawing(
      coords([
        [0, 0],
        [30, 0],
        [60, 0],
      ]),
    ),
  );
});
void test('oval and circle use metric dimensions with bounded geometry', () => {
  const ends = coords([
    [0, 0],
    [200, 100],
  ]);
  for (const circle of [true, false]) {
    const polygon = closedDrawing(ellipseDrawing(ends[0], ends[1], circle));
    assert.equal(polygon.coordinates[0].length, 49);
    const actual = area([
      polygon.coordinates.map((ring) => ring.map(p.forward)),
    ]);
    assert.ok(
      Math.abs(actual / (Math.PI * 50 * (circle ? 50 : 100)) - 1) < 0.005,
    );
  }
});
void test('dense freehand is simplified without dropping last end', () => {
  const points = Array.from({ length: 501 }, (_, i) =>
    p.inverse([
      100 * Math.cos((i * Math.PI) / 250),
      100 * Math.sin((i * Math.PI) / 250),
    ]),
  );
  const simplified = simplifyDrawing(points);
  assert.ok(simplified.length <= 69);
  assert.deepEqual(simplified.at(-1), points.at(-1));
  assert.doesNotThrow(() => closedDrawing(simplified));
});
void test('vertex drag preserves holes and closure; invalid geometry is rejected', () => {
  const outer = coords([
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ]);
  const hole = coords([
    [20, 20],
    [40, 20],
    [40, 40],
    [20, 40],
    [20, 20],
  ]);
  const shape = closedDrawing(outer, [hole]);
  const moved = moveAreaVertex(shape, 0, 0, p.inverse([-10, -10]));
  assert.deepEqual(moved.coordinates[1], hole);
  assert.deepEqual(moved.coordinates[0][0], moved.coordinates[0].at(-1));
  assert.deepEqual(shape.coordinates[0][0], outer[0]);
  assert.throws(() => moveAreaVertex(shape, 0, 1, p.inverse([-30, 70])));
  assert.throws(() =>
    closedDrawing(
      coords([
        [50, 50],
        [90, 50],
        [90, 90],
        [50, 90],
      ]),
      [hole],
    ),
  );
});
void test('Gemini full-charge demonstration uses 105 minutes, never 75 to 100%', () => {
  const d = demoMission(10);
  assert.ok(d.batteries.every((b) => b.rechargeSec === 6300));
  assert.ok(d.batteries.every((b) => b.source.includes('95%')));
});
