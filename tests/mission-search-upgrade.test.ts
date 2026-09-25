import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOWCASE_SCENARIOS,
  DEMONSTRATION_SCENARIOS,
} from '../lib/planner/mission-showcase.ts';
import {
  solveMissionDocument,
  solveMissionParallelBaseline,
  solveMissionSmallAssignmentOracle,
} from '../lib/planner/mission-engine.ts';
import {
  benchmarkCandidate,
  compareBenchmarkCandidates,
  missionSearchHoldoutCases,
} from '../lib/planner/mission-benchmark.ts';
import { benchmarkCases } from '../scripts/benchmark-missions.ts';
import { canonicalStringify, sha256 } from '../lib/planner/mission-schema.ts';
import { validateExportedCandidate } from '../lib/planner/mission-validation.ts';
import { projection } from '../lib/planner/geometry.ts';
import { migrateMissionCameraBindings } from '../lib/planner/camera-profile.ts';

void test('search: unchanged north-wind input uses viable pass orientation, without inventing airspeed', async () => {
  const d = benchmarkCases().find((x) => x.id === 'parameter-grid-1')!.document;
  const before = canonicalStringify(d),
    result = await solveMissionDocument(d);
  assert.equal(canonicalStringify(d), before);
  assert.equal(
    result.inputHash,
    await sha256(migrateMissionCameraBindings(d).document),
  );
  for (const c of result.candidates) {
    assert.equal(c.status, 'feasible_model');
    assert.ok(c.metrics.grossCoveragePct >= 99.99);
    for (const s of c.sorties) {
      const v = d.scenario.vehicles.find((v) => v.id === s.vehicleId)!;
      for (const seg of s.segments.filter((x) => x.phase === 'survey'))
        assert.ok(seg.airspeedMps <= v.airspeedMps + 1e-6);
    }
    assert.deepEqual(
      (await validateExportedCandidate(d, c)).filter(
        (x) => x.status === 'fail',
      ),
      [],
    );
  }
});

void test('search: real detour clears a closed buffered obstacle instead of grazing its boundary', async () => {
  const d = DEMONSTRATION_SCENARIOS.find(
    (x) => x.id === 'demo-02-obstacles',
  )!.create();
  const r = await solveMissionDocument(d);
  for (const c of r.candidates) {
    assert.equal(c.status, 'feasible_model');
    assert.ok(
      c.sorties.some(
        (s) => s.segments.filter((seg) => seg.phase === 'transit').length > 2,
      ),
    );
    assert.deepEqual(
      (await validateExportedCandidate(d, c)).filter(
        (x) => x.status === 'fail',
      ),
      [],
    );
  }
});

void test('search: parallel baseline uses same input, is independently checked and cannot be forged by ordinary trace', async () => {
  const d = SHOWCASE_SCENARIOS[0].create();
  const r = await solveMissionDocument(d);
  const b = await solveMissionParallelBaseline(d, 'makespan');
  const comparison = await compareBenchmarkCandidates(
    d,
    r.candidates[0],
    b,
    'parallel',
  );
  assert.equal(comparison.comparable, true);
  assert.equal(comparison.baselineRole, 'parallel');
  assert.ok(comparison.improvement!.absoluteSec >= -1e-6);
  assert.equal(b.plan.inputHash, r.inputHash);
  const forged = structuredClone(b);
  forged.trace = forged.trace.filter(
    (x) => x.event !== 'PARALLEL_BASELINE_PROTOCOL',
  );
  forged.plan.trace = forged.trace;
  assert.ok(
    (await benchmarkCandidate(d, forged, 'parallel')).failures.includes(
      'BENCHMARK_PARALLEL',
    ),
  );
});

void test('search: bounded solver never labels low charge or absent payload as completed', async () => {
  for (const entry of missionSearchHoldoutCases().filter(
    (x) => x.expectation === 'must-reject',
  )) {
    const r = await solveMissionDocument(entry.document);
    assert.ok(
      r.candidates.every((c) => c.status !== 'feasible_model'),
      entry.id,
    );
    assert.ok(
      r.candidates.every((c) => c.metrics.grossCoveragePct < 99),
      entry.id,
    );
  }
});

void test('search: smaller parallel packs close a short window where maximum-prefix baseline finds no plan', async () => {
  const d = missionSearchHoldoutCases().find(
    (x) => x.id === 'holdout-short-window',
  )!.document;
  const before = canonicalStringify(d);
  const baseline = await solveMissionParallelBaseline(d, 'makespan');
  const result = await solveMissionDocument(d);
  assert.equal(baseline.status, 'not_found');
  assert.equal(result.candidates[0].status, 'feasible_model');
  assert.ok(result.candidates[0].metrics.vehicleCount >= 2);
  assert.ok(result.candidates[0].metrics.makespanSec <= 900);
  assert.equal(canonicalStringify(d), before);
  assert.deepEqual(
    (await validateExportedCandidate(d, result.candidates[0])).filter(
      (x) => x.status === 'fail',
    ),
    [],
  );
});

void test('search: fixed public holdouts retain all six inputs and independent mutations', () => {
  const a = missionSearchHoldoutCases(),
    b = missionSearchHoldoutCases();
  assert.equal(a.length, 6);
  assert.deepEqual(a, b);
  a[0].document.batteries[0].initialPct = 1;
  assert.notEqual(
    a[0].document.batteries[0].initialPct,
    b[0].document.batteries[0].initialPct,
  );
});

void test('search: small whole-job oracle enumerates all assignments/orders with original input hash', async () => {
  const d = SHOWCASE_SCENARIOS.find((x) => x.id === 'repeat-sorties')!.create();
  d.jobs = d.jobs.slice(0, 2);
  const p = projection(d.scenario.vehicles[0].start);
  const v = structuredClone(d.scenario.vehicles[0]);
  v.id = 'rgb-2';
  v.name = 'Второй БВС';
  v.start = p.inverse([500, 0]);
  v.landing = v.start;
  d.scenario.vehicles.push(v);
  d.scenario.reserveSites.push(v.landing);
  d.batteries.push({ ...d.batteries[0], id: 'rgb-2-current', vehicleId: v.id });
  d.jobs.forEach((j) => {
    j.assignedVehicleIds = [];
    j.job.autoBearing = false;
  });
  const r = await solveMissionDocument(d);
  const oracle = await solveMissionSmallAssignmentOracle(d, 'makespan');
  assert.equal(oracle.familySize, 8); // 2^2 assignments × 2! orders.
  assert.equal(oracle.examined, 8);
  assert.equal(oracle.exhaustive, true);
  assert.equal(oracle.inputHash, r.inputHash);
  assert.equal(oracle.candidate?.status, 'feasible_model');
  assert.ok(
    r.candidates[0].metrics.makespanSec <=
      oracle.candidate!.metrics.makespanSec + 1e-6,
  );
  assert.deepEqual(
    (await validateExportedCandidate(d, oracle.candidate!)).filter(
      (x) => x.status === 'fail',
    ),
    [],
  );
});

void test('search: oracle explicitly rejects a case outside its finite family', async () => {
  await assert.rejects(
    solveMissionSmallAssignmentOracle(
      SHOWCASE_SCENARIOS[0].create(),
      'makespan',
    ),
    /восемью полосами/,
  );
});

void test('search: invalid objective is rejected by both reference solvers', async () => {
  const d = SHOWCASE_SCENARIOS[0].create();
  await assert.rejects(
    solveMissionParallelBaseline(d, 'other' as never),
    /критерий/,
  );
  await assert.rejects(
    solveMissionSmallAssignmentOracle(d, 'other' as never),
    /критерий/,
  );
});
