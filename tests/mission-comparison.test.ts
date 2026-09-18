import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { validateExportedCandidate } from '../lib/planner/mission-validation.ts';
import {
  buildMissionRecommendation,
  sameMissionPlan,
} from '../lib/planner/mission-comparison.ts';
import type { MissionCandidate } from '../lib/planner/mission-schema.ts';

const document = demoMission(1);
const solved = await solveMissionDocument(document);
const base = solved.candidates[0];

// Cost fixtures isolate the ranking policy; they are not exported flight proofs.
// The integration test below checks actual solver-produced recommendation proofs.
function costFixture(
  id: string,
  makespanSec: number,
  flightTimeSec: number,
): MissionCandidate {
  const candidate = structuredClone(base);
  candidate.id = id;
  candidate.metrics.makespanSec = makespanSec;
  candidate.metrics.flightTimeSec = flightTimeSec;
  candidate.sorties[0].endSec = makespanSec;
  candidate.sorties[0].durationSec = flightTimeSec;
  return candidate;
}

void test('balanced recommendation retains two required objectives and an independently valid exported candidate', async () => {
  assert.equal(solved.candidates.length, 2);
  assert.deepEqual(
    solved.candidates.map((candidate) => candidate.objective),
    ['makespan', 'flightTime'],
  );
  const recommendation = solved.recommendation;
  assert.ok(recommendation);
  assert.equal(recommendation.candidate.id, 'balanced');
  assert.equal(recommendation.candidate.status, 'feasible_model');
  assert.equal(recommendation.policy, 'balanced-normalized-v1');
  assert.equal(recommendation.resourceProxy, 'flightTimeSec');
  assert.match(
    recommendation.explanation,
    /50\/50.*налёт.*не физический износ/,
  );
  assert.ok(
    recommendation.candidate.assumptions.includes(recommendation.explanation),
  );
  assert.equal(
    (
      await validateExportedCandidate(document, recommendation.candidate)
    ).filter((check) => check.status === 'fail').length,
    0,
  );
  assert.deepEqual(
    recommendation.samePlanAs,
    solved.candidates
      .filter((candidate) =>
        sameMissionPlan(candidate, recommendation.candidate),
      )
      .map((candidate) => candidate.objective),
  );
});

void test('50/50 normalized compromise may select an interior option from the full existing pool', () => {
  const fast = costFixture('fast', 100, 300);
  const economical = costFixture('economical', 300, 100);
  const compromise = costFixture('interior', 160, 160);
  const result = buildMissionRecommendation(
    document,
    [fast, economical, compromise],
    [fast, economical],
  );
  assert.ok(result);
  assert.equal(result.candidate.metrics.makespanSec, 160);
  assert.equal(result.candidate.metrics.flightTimeSec, 160);
  assert.ok(Math.abs(result.score - 0.3) < 1e-12);
  assert.deepEqual(result.ranges, {
    makespanSec: { min: 100, max: 300 },
    flightTimeSec: { min: 100, max: 300 },
  });
  assert.equal(result.poolSize, 3);
  assert.equal(result.distinctPlanCount, 3);
  assert.equal(result.samePlan, false);
  assert.deepEqual(result.samePlanAs, []);
  assert.equal(
    compromise.id,
    'interior',
    'Recommendation must not mutate the original pool.',
  );
  assert.equal(compromise.assumptions.includes(result.explanation), false);
});

void test('unsafe or incomplete cheap plans never participate in normalization or recommendation', () => {
  const complete = costFixture('complete', 100, 300);
  const partial = costFixture('partial', 1, 1);
  partial.status = 'partial';
  const unsafe = costFixture('unsafe', 2, 2);
  unsafe.checks.push({
    id: 'SYNTHETIC_FAIL',
    status: 'fail',
    title: 'Failure',
    detail: 'Test gate',
  });
  const incomplete = costFixture('incomplete', 3, 3);
  incomplete.jobCoverage = [];
  const missingReserve = costFixture('reserve', 4, 4);
  missingReserve.metrics.minimumRemainingPct = 10;
  const result = buildMissionRecommendation(
    document,
    [partial, unsafe, incomplete, missingReserve, complete],
    [complete],
  );
  assert.ok(result);
  assert.equal(result.poolSize, 1);
  assert.equal(result.candidate.metrics.makespanSec, 100);
  assert.equal(result.score, 0);
  assert.equal(
    buildMissionRecommendation(
      document,
      [partial, unsafe, incomplete, missingReserve],
      [],
    ),
    undefined,
  );
});

void test('zero metric ranges and identical routes are explicit without inventing a third plan', () => {
  const fast = structuredClone(base);
  const economical = structuredClone(base);
  fast.id = 'makespan';
  fast.objective = 'makespan';
  economical.id = 'flightTime';
  economical.objective = 'flightTime';
  economical.plan.scenario.objective = 'flightTime';
  const result = buildMissionRecommendation(
    document,
    [fast, economical],
    [fast, economical],
  );
  assert.ok(result);
  assert.equal(result.score, 0);
  assert.deepEqual(result.normalized, { makespan: 0, flightTime: 0 });
  assert.equal(result.poolSize, 2);
  assert.equal(result.distinctPlanCount, 1);
  assert.equal(result.samePlan, true);
  assert.deepEqual(result.samePlanAs, ['makespan', 'flightTime']);
  assert.ok(sameMissionPlan(result.candidate, fast));
});

void test('equal compromise scores break ties by reserve, then sorties, then deterministic plan content', () => {
  const lowReserve = costFixture('low-reserve', 100, 100);
  const highReserve = structuredClone(lowReserve);
  highReserve.id = 'high-reserve';
  highReserve.metrics.minimumRemainingPct =
    lowReserve.metrics.minimumRemainingPct + 1;
  assert.equal(
    buildMissionRecommendation(document, [lowReserve, highReserve], [])
      ?.candidate.metrics.minimumRemainingPct,
    highReserve.metrics.minimumRemainingPct,
  );
  const fewer = structuredClone(highReserve);
  fewer.sorties = fewer.sorties.slice(0, 1);
  assert.equal(
    buildMissionRecommendation(document, [highReserve, fewer], [])?.candidate
      .sorties.length,
    1,
  );
  const other = structuredClone(fewer);
  other.sorties[0].batteryId = 'different-battery';
  const a = buildMissionRecommendation(document, [fewer, other], [])!;
  const b = buildMissionRecommendation(document, [other, fewer], [])!;
  assert.deepEqual(a.candidate.sorties, b.candidate.sorties);
});

void test('same-plan comparison ignores presentation metadata, but includes geometry, timing and battery assignment', () => {
  const renamed = structuredClone(base);
  renamed.id = 'another-card';
  renamed.objective = 'flightTime';
  renamed.plan.createdAt = '2030-01-01T00:00:00Z';
  renamed.trace = [];
  renamed.sorties.reverse();
  renamed.sorties.forEach((sortie, index) => {
    sortie.id = `renamed-${index}`;
    sortie.name = 'Display name';
  });
  assert.equal(sameMissionPlan(base, renamed), true);
  for (const mutate of [
    (candidate: MissionCandidate) => {
      candidate.sorties[0].segments[0].to[0] += 0.000001;
    },
    (candidate: MissionCandidate) => {
      candidate.sorties[0].startSec += 1;
    },
    (candidate: MissionCandidate) => {
      candidate.sorties[0].batteryId = 'other-battery';
    },
  ]) {
    const changed = structuredClone(base);
    mutate(changed);
    assert.equal(sameMissionPlan(base, changed), false);
  }
});

void test('no recommendation is emitted when the actual solver has no complete safe plan', async () => {
  const invalid = demoMission(1);
  invalid.batteries = invalid.batteries.slice(0, 1);
  invalid.planning.maxSortiesPerVehicle = 1;
  const result = await solveMissionDocument(invalid);
  assert.equal(result.candidates.length, 2);
  assert.ok(
    result.candidates.every(
      (candidate) => candidate.status !== 'feasible_model',
    ),
  );
  assert.equal(result.recommendation, undefined);
});
