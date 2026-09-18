import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { createDemoQuality } from '../lib/planner/quality.ts';
import { projection } from '../lib/planner/geometry.ts';
import {
  missionJobContext,
  solveMissionDocument,
} from '../lib/planner/mission-engine.ts';
import {
  sortiesConflict,
  validateMissionCandidate,
} from '../lib/planner/mission-validation.ts';
import type { ScheduledSortie } from '../lib/planner/mission-schema.ts';

function fixture(offsetA = 0, offsetB = 0) {
  const d = demoMission(1);
  const second = structuredClone(d.jobs[0]);
  second.id = 'other-job';
  d.jobs.push(second);
  for (const [index, offset] of [offsetA, offsetB].entries()) {
    if (!offset) continue;
    d.jobs[index].job.type = 'Geophysics';
    d.jobs[index].quality = createDemoQuality('Geophysics');
    d.jobs[index].quality.sensorOffsetM = offset;
  }
  d.planning.temporalBufferSec = 0;
  d.planning.separationHorizontalM = 30;
  d.planning.separationVerticalM = 15;
  const p = projection([30, 60]);
  const sortie = (
    index: number,
    height: number,
    x: number,
  ): ScheduledSortie => ({
    id: `sortie-${index}`,
    jobId: d.jobs[index].id,
    vehicleId: d.scenario.vehicles[index].id,
    batteryId: `battery-${index}`,
    name: 'synthetic separation unit fixture',
    startSec: 100,
    endSec: 120,
    readySec: 130,
    durationSec: 20,
    distanceM: 200,
    remainingPct: 80,
    strips: 1,
    shots: null,
    segments: [
      {
        from: p.inverse([x, 0]),
        to: p.inverse([x, 200]),
        phase: 'survey',
        startSec: 100,
        endSec: 120,
        altitudeFromM: height,
        altitudeToM: height,
        airspeedMps: 10,
        groundSpeedMps: 10,
        distanceM: 200,
        batteryFromPct: 90,
        batteryToPct: 80,
        stripId: 0,
      },
    ],
  });
  return { d, sortie };
}

void test('pairwise separation includes the sensor and is symmetric', () => {
  const { d, sortie } = fixture(50, 0);
  const a = sortie(0, 140, 0),
    b = sortie(1, 100, 20);
  assert.equal(sortiesConflict(d, a, b), true);
  assert.equal(sortiesConflict(d, b, a), true);
  d.jobs[0].quality.sensorOffsetM = 0;
  assert.equal(sortiesConflict(d, a, b), false);
});

void test('separation covers cable interior, not just its two endpoints', () => {
  const { d, sortie } = fixture(100, 0);
  const a = sortie(0, 180, 0),
    b = sortie(1, 130, 20);
  // Both endpoints are 50m vertically away; the cable crosses the other height.
  assert.equal(sortiesConflict(d, a, b), true);
});

void test('two suspended volumes preserve genuine clearances and time separation', () => {
  const { d, sortie } = fixture(50, 20);
  const a = sortie(0, 140, 0),
    b = sortie(1, 80, 20);
  assert.equal(sortiesConflict(d, a, b), true); // [90,140] vs [60,80]: gap10
  b.segments[0].altitudeFromM = b.segments[0].altitudeToM = 70;
  assert.equal(sortiesConflict(d, a, b), false); // gap20
  b.segments[0].altitudeFromM = b.segments[0].altitudeToM = 100;
  b.startSec = b.segments[0].startSec = 140;
  b.endSec = b.segments[0].endSec = 160;
  assert.equal(sortiesConflict(d, a, b), false);
});

void test('suspension conflict is continuously detected during changing height', () => {
  const { d, sortie } = fixture(50, 0);
  const a = sortie(0, 180, 0),
    b = sortie(1, 100, 20);
  a.segments[0].altitudeToM = 120;
  assert.equal(sortiesConflict(d, a, b), true);
  assert.equal(sortiesConflict(d, b, a), true);
});

void test('phase checker requires turns and rejects relabelling transit as early return', async () => {
  const d = demoMission(1);
  const result = await solveMissionDocument(d);
  const contexts = result.candidates[0].jobCoverage.map((row) => {
    const job = structuredClone(d.jobs.find((j) => j.id === row.jobId)!);
    job.job.bearingDeg = row.bearingDeg;
    return missionJobContext(d, job);
  });
  const original = result.candidates[0].sorties;
  assert.equal(
    validateMissionCandidate(d, original, contexts).find(
      (c) => c.id === 'PHASES',
    )?.status,
    'pass',
  );
  const removed = structuredClone(original);
  removed[0].segments = removed[0].segments.filter((s) => s.phase !== 'turn');
  assert.equal(
    validateMissionCandidate(d, removed, contexts).find(
      (c) => c.id === 'PHASES',
    )?.status,
    'fail',
  );
  const relabelled = structuredClone(original);
  const transit = relabelled[0].segments.find((s) => s.phase === 'transit');
  assert.ok(transit);
  transit.phase = 'return';
  assert.equal(
    validateMissionCandidate(d, relabelled, contexts).find(
      (c) => c.id === 'PHASES',
    )?.status,
    'fail',
  );
});
