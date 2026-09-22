import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupMissionCandidates,
  groupMissionChecks,
} from '../lib/planner/mission-presentation.ts';
import type { MissionCandidate } from '../lib/planner/mission-schema.ts';
import { canonicalStringify } from '../lib/planner/mission-schema.ts';
import type { Check } from '../lib/planner/schema.ts';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';

const solved = solveMissionDocument(
  SHOWCASE_SCENARIOS.find(
    (scenario) => scenario.id === 'automatic-tradeoff',
  )!.create(),
);

function equivalent(candidate: MissionCandidate): MissionCandidate {
  const copy = structuredClone(candidate);
  copy.id = 'identical-execution-different-objective';
  copy.objective = copy.objective === 'makespan' ? 'flightTime' : 'makespan';
  copy.plan.scenario.objective = copy.objective;
  copy.plan.createdAt = '2026-09-20T00:00:00.000Z';
  copy.plan.computationMs += 100;
  copy.trace = [{ event: 'SEARCH', detail: 'Different search trace' }];
  copy.plan.trace = copy.trace;
  return copy;
}

void test('presentation groups exactly identical execution across objectives without changing original candidates', async () => {
  const candidate = (await solved).candidates[0];
  assert.equal(candidate.status, 'feasible_model');
  const other = equivalent(candidate);
  const before = canonicalStringify([candidate, other]);
  const groups = groupMissionCandidates([candidate, other]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].representative, candidate);
  assert.deepEqual(groups[0].candidateIds, [candidate.id, other.id]);
  assert.deepEqual(groups[0].objectives, [
    candidate.objective,
    other.objective,
  ]);
  assert.equal(canonicalStringify([candidate, other]), before);
});

void test('selected original candidate remains the representative, preserving its exact evidence identity', async () => {
  const candidate = (await solved).candidates[0];
  const other = equivalent(candidate);
  const groups = groupMissionCandidates([candidate, other], other.id);
  assert.equal(groups[0].representative, other);
  assert.equal(
    groups[0].representative.plan.inputHash,
    candidate.plan.inputHash,
  );
  assert.equal(groupMissionCandidates([], 'absent').length, 0);
});

void test('equal metrics never hide different geometry, assignments, timing, battery, events, status, checks or assumptions', async (t) => {
  const candidate = (await solved).candidates[0];
  const changes: [string, (copy: MissionCandidate) => void][] = [
    ['position', (copy) => (copy.sorties[0].segments[0].from[0] += 1e-10)],
    [
      'altitude',
      (copy) => (copy.sorties[0].segments[0].altitudeFromM += 0.001),
    ],
    ['timing', (copy) => (copy.sorties[0].segments[0].endSec += 0.001)],
    ['sortie start', (copy) => (copy.sorties[0].startSec += 0.001)],
    ['vehicle', (copy) => (copy.sorties[0].vehicleId = 'different-uav')],
    ['job', (copy) => (copy.sorties[0].jobId = 'different-job')],
    ['battery', (copy) => (copy.sorties[0].batteryId = 'different-battery')],
    ['remaining charge', (copy) => (copy.sorties[0].remainingPct -= 0.001)],
    ['coverage', (copy) => (copy.jobCoverage[0].grossCoveragePct -= 0.001)],
    ['metric precision', (copy) => (copy.metrics.flightTimeSec += 1e-10)],
    ['event', (copy) => (copy.events[0].detail += ' changed')],
    ['status', (copy) => (copy.status = 'partial')],
    ['check status', (copy) => (copy.checks[0].status = 'fail')],
    ['check detail', (copy) => (copy.checks[0].detail += ' new limitation')],
    ['assumption', (copy) => copy.assumptions.push('Different uncertainty')],
    ['input hash', (copy) => (copy.plan.inputHash = 'different-hash')],
    ['legacy view', (copy) => (copy.plan.metrics.distanceM += 1)],
  ];
  for (const [label, change] of changes) {
    await t.test(label, () => {
      const copy = equivalent(candidate);
      change(copy);
      assert.equal(groupMissionCandidates([candidate, copy]).length, 2);
    });
  }
});

void test('invalid nonfinite payloads cannot collapse to an equivalent null through JSON serialization', async () => {
  const candidate = equivalent((await solved).candidates[0]);
  candidate.metrics.distanceM = Number.NaN;
  const copy = structuredClone(candidate);
  copy.id = 'another-invalid-plan';
  assert.equal(groupMissionCandidates([candidate, copy]).length, 2);
});

const check = (id: string, status: Check['status'] = 'pass'): Check => ({
  id,
  status,
  title: `Title of ${id}`,
  detail: `Exact detail of ${id}`,
});

void test('all source checks including unfamiliar IDs survive exactly once, preserving source references', () => {
  const checks = [
    check('GEOMETRY'),
    check('FOUR_DIMENSIONAL'),
    check('SEPARATION'),
    check('GROUND_SEPARATION'),
    check('FORECAST_WIND_LIMIT'),
    check('CLOUD_CEILING', 'unknown'),
    check('BATTERIES'),
    check('ENERGY'),
    check('job-1:QUALITY_job-1_SOURCE', 'unknown'),
    check('sortie-1:QUALITY_job-1_CADENCE'),
    check('COVERAGE_job-1'),
    check('EXPORTED_QUALITY_job-1_SOURCE', 'unknown'),
    check('UNKNOWN_FUTURE_VALIDATOR', 'fail'),
    check('AIRSPACE_PERMISSION', 'unknown'),
  ];
  const before = canonicalStringify(checks);
  const summary = groupMissionChecks(checks);
  const all = summary.groups.flatMap((group) => group.checks);
  assert.equal(all.length, checks.length);
  assert.ok(
    checks.every(
      (source) => all.filter((item) => item === source).length === 1,
    ),
  );
  assert.equal(
    summary.counts.pass + summary.counts.fail + summary.counts.unknown,
    checks.length,
  );
  assert.equal(summary.counts.fail, 1);
  assert.equal(summary.counts.unknown, 4);
  assert.equal(summary.status, 'fail');
  assert.equal(
    summary.groups.find((group) => group.id === 'separation')!.checks.length,
    2,
  );
  assert.equal(
    summary.groups.find((group) => group.id === 'survey')!.checks.length,
    4,
  );
  assert.equal(
    summary.groups.find((group) => group.id === 'other')!.checks.length,
    2,
  );
  assert.equal(canonicalStringify(checks), before);
});

void test('aggregated failures dominate uncertainty; uncertainty never turns into a successful category', () => {
  const summary = groupMissionChecks([
    check('ENERGY'),
    check('CALIBRATION', 'unknown'),
    check('BATTERIES', 'fail'),
    check('GEOMETRY'),
    check('TERRAIN', 'unknown'),
    check('SEPARATION'),
    check('GROUND_SEPARATION'),
  ]);
  assert.equal(
    summary.groups.find((group) => group.id === 'battery')!.status,
    'fail',
  );
  assert.equal(
    summary.groups.find((group) => group.id === 'routes')!.status,
    'unknown',
  );
  assert.equal(
    summary.groups.find((group) => group.id === 'separation')!.status,
    'pass',
  );
  assert.deepEqual(
    summary.nonpasses.map((item) => item.id),
    ['CALIBRATION', 'BATTERIES', 'TERRAIN'],
  );
});

void test('unrecognized IDs matching object properties cannot disappear from Other', () => {
  const checks = ['constructor', '__proto__', 'toString'].map((id) =>
    check(id, 'fail'),
  );
  const summary = groupMissionChecks(checks);
  assert.deepEqual(
    summary.groups.find((group) => group.id === 'other')!.checks,
    checks,
  );
  assert.equal(summary.counts.fail, 3);
});

void test('empty categories are explicit unknowns and create no invented checks or count inflation', () => {
  const empty = groupMissionChecks([]);
  assert.equal(empty.groups.length, 5);
  assert.ok(empty.groups.every((group) => group.status === 'unknown'));
  assert.equal(empty.status, 'unknown');
  assert.deepEqual(empty.counts, { pass: 0, fail: 0, unknown: 0 });
  const some = groupMissionChecks([check('GEOMETRY')]);
  assert.equal(some.status, 'unknown');
  assert.equal(
    some.groups.find((group) => group.id === 'weather')!.status,
    'unknown',
  );
  assert.equal(
    some.groups.find((group) => group.id === 'weather')!.checks.length,
    0,
  );
});

void test('actual model limitations and lack of airspace permission remain visible in summary nonpasses', async () => {
  const candidate = (await solved).candidates[0];
  const summary = groupMissionChecks(candidate.checks);
  assert.equal(summary.counts.fail, 0);
  assert.ok(summary.counts.unknown > 0);
  assert.equal(summary.status, 'unknown');
  for (const id of [
    'ALTERNATE_ESCAPE',
    'CALIBRATION',
    'IMAGE_FOOTPRINTS',
    'AIRSPACE_PERMISSION',
  ])
    assert.ok(summary.nonpasses.some((item) => item.id === id));
  assert.equal(
    summary.groups.flatMap((group) => group.checks).length,
    candidate.checks.length,
  );
});
