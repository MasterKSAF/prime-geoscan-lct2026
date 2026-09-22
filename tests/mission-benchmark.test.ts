import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import {
  solveMissionDocument,
  solveMissionSerialBaseline,
} from '../lib/planner/mission-engine.ts';
import {
  benchmarkCandidate,
  benchmarkDistribution,
  compareBenchmarkCandidates,
  completeBenchmarkRunMatrix,
} from '../lib/planner/mission-benchmark.ts';
import { benchmarkCases } from '../scripts/benchmark-missions.ts';
import { sha256 } from '../lib/planner/mission-schema.ts';

const fixture = (async () => {
  const document = SHOWCASE_SCENARIOS.find(
    (entry) => entry.id === 'repeat-sorties',
  )!.create();
  const planned = (await solveMissionDocument(document)).candidates[0];
  const serial = await solveMissionSerialBaseline(document, 'makespan');
  return { document, planned, serial };
})();

void test('benchmark: same complete input and full serial routes are independently rechecked', async () => {
  const { document, planned, serial } = await fixture;
  const result = await compareBenchmarkCandidates(document, planned, serial);
  assert.equal(result.comparable, true);
  assert.equal(result.planned.failures.length, 0);
  assert.equal(result.serial.failures.length, 0);
  assert.equal(result.inputHash, await sha256(document));
  assert.equal(
    result.improvement!.absoluteSec,
    serial.metrics.makespanSec - planned.metrics.makespanSec,
  );
  assert.ok(serial.trace.some((row) => row.event === 'BASELINE_PROTOCOL'));
});

void test('benchmark: partial result is retained but cannot produce an improvement percentage', async () => {
  const { document, planned, serial } = await fixture;
  const partial = structuredClone(planned);
  partial.status = 'partial';
  const comparison = await compareBenchmarkCandidates(
    document,
    partial,
    serial,
  );
  assert.equal(comparison.planned.status, 'partial');
  assert.equal(comparison.comparable, false);
  assert.equal(comparison.improvement, null);
});

void test('benchmark: altered metric and forged saved pass flags do not prove efficiency', async () => {
  const { document, planned, serial } = await fixture;
  const altered = structuredClone(planned);
  altered.metrics.makespanSec = 1;
  altered.checks.forEach((check) => {
    check.status = 'pass';
  });
  const comparison = await compareBenchmarkCandidates(
    document,
    altered,
    serial,
  );
  assert.equal(comparison.comparable, false);
  assert.ok(comparison.planned.failures.includes('METRICS'));
  assert.equal(comparison.improvement, null);
});

void test('benchmark: changing resources invalidates comparison input even when routes are untouched', async () => {
  const { document, planned, serial } = await fixture;
  const changed = structuredClone(document);
  changed.batteries[0].initialPct = 99;
  const comparison = await compareBenchmarkCandidates(changed, planned, serial);
  assert.equal(comparison.comparable, false);
  assert.ok(comparison.serial.failures.includes('BENCHMARK_INPUT'));
});

void test('benchmark: distinct objectives cannot be compared as one improvement', async () => {
  const { document, planned, serial } = await fixture;
  const other = structuredClone(serial);
  other.objective = 'flightTime';
  const comparison = await compareBenchmarkCandidates(document, planned, other);
  assert.equal(comparison.comparable, false);
  assert.ok(comparison.reason.some((reason) => reason.includes('Критерии')));
});

void test('benchmark: ordinary candidate cannot masquerade as the serial protocol', async () => {
  const { document, planned } = await fixture;
  const checked = await benchmarkCandidate(document, planned, 'serial');
  assert.equal(checked.acceptedComplete, false);
  assert.ok(checked.failures.includes('BENCHMARK_SERIAL'));
});

void test('benchmark: fixed dataset includes refusal and stress cases with current batteries only', async () => {
  const first = benchmarkCases(),
    second = benchmarkCases();
  assert.equal(first.length, 21);
  assert.deepEqual(first, second);
  assert.ok(first.some((entry) => entry.id === 'wind-limit'));
  assert.ok(first.some((entry) => entry.id === 'insufficient-energy'));
  assert.ok(first.some((entry) => entry.id === 'stress-100km2'));
  for (const entry of first) {
    assert.equal(
      entry.document.planning.safetyPolicy,
      'continuous-occupancy-v1',
    );
    assert.equal(entry.document.planning.batteryPolicy, 'installed-current-v1');
    for (const vehicle of entry.document.scenario.vehicles)
      assert.equal(
        entry.document.batteries.filter(
          (battery) => battery.vehicleId === vehicle.id,
        ).length,
        1,
      );
  }
  first[0].document.name = 'mutated';
  assert.notEqual(second[0].document.name, first[0].document.name);
});

void test('benchmark: percentile summary preserves losses and handles empty comparable set', () => {
  assert.deepEqual(benchmarkDistribution([]), {
    count: 0,
    min: null,
    p50: null,
    p95: null,
    max: null,
  });
  assert.deepEqual(benchmarkDistribution([-10, 0, 20, 50]), {
    count: 4,
    min: -10,
    p50: 0,
    p95: 50,
    max: 50,
  });
});

void test('benchmark: dropping a failed case or repeat cannot leave a complete run matrix', () => {
  const ids = ['feasible', 'not-found'],
    runs = [
      { caseId: 'feasible', repeat: 0 },
      { caseId: 'feasible', repeat: 1 },
      { caseId: 'not-found', repeat: 0 },
      { caseId: 'not-found', repeat: 1 },
    ];
  assert.equal(completeBenchmarkRunMatrix(ids, runs, 2), true);
  assert.equal(completeBenchmarkRunMatrix(ids, runs.slice(0, 2), 2), false);
  assert.equal(completeBenchmarkRunMatrix(ids, runs.slice(0, 3), 2), false);
  assert.equal(completeBenchmarkRunMatrix(ids, [...runs, runs[0]], 2), false);
  assert.equal(completeBenchmarkRunMatrix(ids, runs, 1e12), false);
});
