import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { missionEvidence } from '../lib/planner/mission-export.ts';
import { verifyMissionEvidence } from './verify-mission-evidence.ts';
import type {
  MissionDocument,
  MissionResult,
} from '../lib/planner/mission-schema.ts';

const base = process.argv[2] ?? 'http://127.0.0.1:3016';
const output = process.argv[3] ?? 'output/collision-safety';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))
  throw new Error('Local stand only.');
await mkdir(output, { recursive: true });
const rows: unknown[] = [];
async function solve(d: MissionDocument) {
  const response = await fetch(`${base}/api/planner/missions/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(d),
    signal: AbortSignal.timeout(45000),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()) as MissionResult;
}
for (const scenario of SHOWCASE_SCENARIOS) {
  const result = await solve(scenario.create());
  const valid = result.candidates.filter((c) => c.status === 'feasible_model');
  assert.equal(
    valid.length > 0,
    scenario.expected === 'feasible_model',
    scenario.id,
  );
  await writeFile(
    `${output}/${scenario.id}.result.json`,
    JSON.stringify(result, null, 2),
  );
  const evidenceRows: unknown[] = [];
  for (const candidate of valid) {
    const evidence = await missionEvidence(result, candidate);
    const verified = await verifyMissionEvidence(evidence);
    assert.equal(
      verified.filter((c) => c.status === 'fail').length,
      0,
      `${scenario.id}/${candidate.id}`,
    );
    assert.equal(
      candidate.checks.find((c) => c.id === 'GROUND_SEPARATION')?.status,
      'pass',
    );
    await writeFile(
      `${output}/${scenario.id}-${candidate.id}.evidence.json`,
      JSON.stringify(evidence, null, 2),
    );
    await writeFile(
      `${output}/${scenario.id}-${candidate.id}.verification.json`,
      JSON.stringify(verified, null, 2),
    );
    evidenceRows.push({
      candidateId: candidate.id,
      checks: verified.length,
      unknown: verified.filter((c) => c.status === 'unknown').map((c) => c.id),
    });
  }
  rows.push({
    scenario: scenario.id,
    expected: scenario.expected,
    statuses: result.candidates.map((c) => c.status),
    evidence: evidenceRows,
  });
}
const shared = SHOWCASE_SCENARIOS.find((s) => s.id === 'mixed-fleet')!.create();
shared.id = 'occupied-common-pad';
shared.name = 'Отрицательная проверка: занятая общая площадка';
for (const vehicle of shared.scenario.vehicles) {
  vehicle.start = [...shared.scenario.vehicles[0].start];
  vehicle.landing = [...shared.scenario.vehicles[0].start];
}
const rejected = await solve(shared);
assert.ok(rejected.candidates.every((c) => c.status !== 'feasible_model'));
assert.ok(
  rejected.candidates.every((c) =>
    c.trace.some((e) => e.event === 'GROUND_REJECT'),
  ),
);
await writeFile(
  `${output}/occupied-common-pad.mission.json`,
  JSON.stringify(shared, null, 2),
);
await writeFile(
  `${output}/occupied-common-pad.result.json`,
  JSON.stringify(rejected, null, 2),
);
rows.push({
  scenario: shared.id,
  expected: 'rejected',
  statuses: rejected.candidates.map((c) => c.status),
});
const sourceFiles = [
  'lib/planner/geometry.ts',
  'lib/planner/mission-engine.ts',
  'lib/planner/mission-validation.ts',
  'lib/planner/mission-operations.ts',
  'lib/planner/mission-safety.ts',
  'lib/planner/mission-schema.ts',
  'lib/planner/mission-export.ts',
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(async (p) => [
      p,
      createHash('sha256')
        .update(await readFile(p))
        .digest('hex'),
    ]),
  ),
);
const summary = {
  createdAt: new Date().toISOString(),
  base,
  safetyPolicy: 'continuous-occupancy-v1',
  rows,
  sourceHashes,
  scope:
    'Synthetic model tests; verification reuses geometry, independent sampled oracle exists in unit tests. No flight certification.',
};
await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ output, scenarios: rows.length, status: 'pass' }));
