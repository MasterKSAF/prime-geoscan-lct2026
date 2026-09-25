import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMONSTRATION_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import {
  plannedPhotoCoverage,
  photoCoverageGeoJSON,
} from '../lib/planner/mission-photo-footprints.ts';

void test('planned frame rectangles cover simple mission, including edges, and preserve correct shot count', async () => {
  const d = DEMONSTRATION_SCENARIOS[0].create(),
    c = (await solveMissionDocument(d)).candidates[0];
  const result = plannedPhotoCoverage(d, c.sorties);
  assert.ok(result.length > 0);
  for (const r of result) {
    assert.equal(r.status, 'calculated');
    assert.ok(r.missingM2 < 0.05, JSON.stringify(r.checks));
    assert.equal(
      r.plannedFrames,
      c.sorties
        .filter((s) => s.jobId === r.jobId)
        .reduce((n, s) => n + (s.shots ?? 0), 0),
    );
  }
  assert.equal(
    photoCoverageGeoJSON(d, c.sorties).properties.acquiredData,
    false,
  );
});
void test('removed or absent survey strips cannot be called complete image coverage', async () => {
  const d = DEMONSTRATION_SCENARIOS[0].create(),
    c = (await solveMissionDocument(d)).candidates[0];
  const broken = c.sorties.map((s) => ({
    ...s,
    segments: s.segments.filter(
      (seg) => seg.phase !== 'survey' || seg.stripId !== 0,
    ),
  }));
  assert.ok(
    plannedPhotoCoverage(d, broken).some((r) =>
      r.checks.some((c) => c.status === 'fail'),
    ),
  );
  assert.ok(
    plannedPhotoCoverage(d, []).every(
      (r) => r.coveredM2 === 0 && r.missingM2 > 0,
    ),
  );
});
void test('unknown terrain and incomplete camera never issue a pass', () => {
  const d = DEMONSTRATION_SCENARIOS[0].create();
  d.terrainModel = { kind: 'unknown', source: 'No DEM' };
  assert.ok(
    plannedPhotoCoverage(d, []).every((r) => r.status === 'not_checked'),
  );
  d.terrainModel = { kind: 'flat', elevationM: 0, source: 'test' };
  for (const vehicle of d.scenario.vehicles)
    for (const camera of vehicle.cameraProfiles ?? [])
      delete camera.sensorHeightMm;
  assert.equal(plannedPhotoCoverage(d, [])[0].status, 'not_checked');
});
