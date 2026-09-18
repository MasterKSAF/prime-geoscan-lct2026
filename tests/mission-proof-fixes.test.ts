import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { validateExportedCandidate } from '../lib/planner/mission-validation.ts';
import type { MissionCandidate } from '../lib/planner/mission-schema.ts';

const d = demoMission(1);
let result: Awaited<ReturnType<typeof solveMissionDocument>> | undefined;
const candidate = async () => {
  result ??= await solveMissionDocument(d);
  return structuredClone(result.candidates[0]);
};

void test('fresh evidence confirms complete event journal and both saved-check projections', async () => {
  const checks = await validateExportedCandidate(d, await candidate());
  assert.equal(checks.filter((c) => c.status === 'fail').length, 0);
  for (const id of ['EVENT_JOURNAL', 'SAVED_CHECKS', 'TRACE_PROJECTION'])
    assert.equal(checks.find((c) => c.id === id)?.status, 'pass');
  assert.equal(
    checks.find((c) => c.id === 'TRACE_SEARCH_PROVENANCE')?.status,
    'unknown',
  );
});

const eventMutations: [string, (c: MissionCandidate) => void][] = [
  [
    'empty events',
    (c) => {
      c.events = [];
    },
  ],
  [
    'phantom vehicle',
    (c) => {
      c.events[0].vehicleId = 'phantom';
    },
  ],
  [
    'incorrect event time',
    (c) => {
      c.events[0].timeSec += 1;
    },
  ],
  [
    'false event explanation',
    (c) => {
      c.events[0].detail = 'Данные получены с настоящего БВС.';
    },
  ],
  [
    'duplicate event',
    (c) => {
      c.events.push(structuredClone(c.events[0]));
    },
  ],
];
for (const [name, mutate] of eventMutations)
  void test(`proof rejects ${name}`, async () => {
    const c = await candidate();
    mutate(c);
    const checks = await validateExportedCandidate(d, c);
    assert.equal(checks.find((x) => x.id === 'EVENT_JOURNAL')?.status, 'fail');
  });

void test('unknown permission cannot become a saved pass even when both copies agree', async () => {
  const c = await candidate();
  for (const check of c.checks)
    if (check.id === 'AIRSPACE_PERMISSION') check.status = 'pass';
  c.plan.checks = structuredClone(c.checks);
  const checks = await validateExportedCandidate(d, c);
  assert.equal(checks.find((x) => x.id === 'SAVED_CHECKS')?.status, 'fail');
  assert.equal(
    checks.find((x) => x.id === 'AIRSPACE_PERMISSION')?.status,
    'unknown',
  );
});

void test('missing claims and changed explanation in map-only copy are rejected', async () => {
  const c = await candidate();
  c.plan.checks = structuredClone(c.checks);
  c.plan.checks[0].detail = 'Всё подтверждено экспертом';
  assert.equal(
    (await validateExportedCandidate(d, c)).find((x) => x.id === 'SAVED_CHECKS')
      ?.status,
    'fail',
  );
  c.checks = [];
  c.plan.checks = [];
  assert.equal(
    (await validateExportedCandidate(d, c)).find((x) => x.id === 'SAVED_CHECKS')
      ?.status,
    'fail',
  );
});

void test('search trace cannot silently differ between model and map view', async () => {
  const c = await candidate();
  c.plan.trace = [];
  assert.equal(
    (await validateExportedCandidate(d, c)).find(
      (x) => x.id === 'TRACE_PROJECTION',
    )?.status,
    'fail',
  );
});

void test('repeated flights and charging events retain a valid full journal at 10 km2', async () => {
  const doc = demoMission(10);
  const c = (await solveMissionDocument(doc)).candidates[0];
  assert.equal(c.status, 'feasible_model');
  assert.ok(c.events.some((e) => e.detail.includes('зарядка завершена')));
  const checks = await validateExportedCandidate(doc, c);
  assert.equal(checks.find((x) => x.id === 'EVENT_JOURNAL')?.status, 'pass');
  assert.equal(checks.find((x) => x.id === 'SAVED_CHECKS')?.status, 'pass');
});
