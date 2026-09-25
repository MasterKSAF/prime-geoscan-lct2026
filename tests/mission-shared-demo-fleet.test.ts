import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEMO_IDS, prepareDemoDocument } from '../lib/planner/demo-session.ts';
import { parseMissionDocument } from '../lib/planner/mission-schema.ts';
import { prepareSharedDemoFleet } from '../lib/planner/demo-shared-fleet.ts';
import { appendMissionWork } from '../lib/planner/mission-editing.ts';
import { missionFleetAdvice } from '../lib/planner/mission-fleet-advice.ts';
import { missionImprovementTrials } from '../lib/planner/mission-insights.ts';
import { withMissionReservations } from '../lib/planner/mission-resource-reservations.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { validateExportedCandidate } from '../lib/planner/mission-validation.ts';
import { plainMissionCheck } from '../lib/planner/mission-check-copy.ts';
import { simulatedTrialFleetChanges } from '../lib/planner/mission-demo-trial.ts';
import { fleetStateFromDocument } from '../lib/planner/mission-fleet-state.ts';

const original = await Promise.all(
  DEMO_IDS.map(async (id) =>
    prepareDemoDocument(
      parseMissionDocument(
        JSON.parse(
          await readFile(`public/planner/scenarios/${id}.mission.json`, 'utf8'),
        ),
      ),
    ),
  ),
);
const documents = prepareSharedDemoFleet(original);

void test('shared demo registry activates all models with fixed unique aircraft, no charge/assignment reset', () => {
  assert.equal(original[0].scenario.vehicles.length, 3);
  for (const d of documents) {
    assert.ok(d.scenario.vehicles.every((v) => v.enabled));
    assert.deepEqual(
      [...new Set(d.scenario.vehicles.map((v) => v.model))].sort(),
      ['201', '801', 'Gemini'],
    );
    assert.equal(d.batteries.length, d.scenario.vehicles.length);
  }
  const a = documents[0].scenario.vehicles.find((v) => v.id === 'rgb-fast')!;
  const b = documents[2].scenario.vehicles.find((v) => v.id === a.id)!;
  assert.deepEqual(a, b);
  assert.equal(
    documents[2].scenario.vehicles.find((v) => v.id === 'demo-07')!.batteryPct,
    26,
  );
  assert.deepEqual(documents[2].jobs[0].assignedVehicleIds, ['demo-07']);
  assert.ok(documents[1].jobs.every((j) => j.assignedVehicleIds.length === 0));
  assert.deepEqual(
    documents[1].jobs.map((j) => j.area),
    original[1].jobs.map((j) => j.area),
  );
});

void test('Demo 1 plus MS produces complete verified variants with the default active fleet', async () => {
  const d = appendMissionWork(
    documents[0],
    documents[0].jobs[0].id,
    'MS',
    'added-ms',
  );
  const r = await solveMissionDocument(d);
  for (const c of r.candidates) {
    assert.equal(c.status, 'feasible_model');
    assert.ok(c.jobCoverage.every((j) => j.grossCoveragePct >= 99));
    assert.ok(c.metrics.minimumRemainingPct >= d.scenario.reservePct);
    assert.deepEqual(
      (await validateExportedCandidate(d, c)).filter(
        (x) => x.status === 'fail',
      ),
      [],
    );
    for (const s of c.sorties)
      assert.ok(
        d.scenario.vehicles
          .find((v) => v.id === s.vehicleId)!
          .jobs.includes(d.jobs.find((j) => j.id === s.jobId)!.job.type),
      );
  }
  assert.ok(
    r.candidates[0].metrics.makespanSec < r.candidates[1].metrics.makespanSec,
  );
  assert.ok(
    r.candidates[1].metrics.flightTimeSec <
      r.candidates[0].metrics.flightTimeSec,
  );
});

void test('disabled multispectral aircraft yield actionable advice and a checked enable-all repair', async () => {
  const d = appendMissionWork(
    documents[0],
    documents[0].jobs[0].id,
    'MS',
    'added-ms',
  );
  for (const v of d.scenario.vehicles)
    if (v.jobs.includes('MS')) v.enabled = false;
  const advice = missionFleetAdvice(d);
  assert.match(
    advice.find((x) => x.jobId === 'added-ms')!.action,
    /Парк БВС → Доступность/,
  );
  const c = (await solveMissionDocument(d)).candidates[0];
  assert.notEqual(c.status, 'feasible_model');
  const trial = missionImprovementTrials(d, c).find(
    (x) => x.id === 'enable-all-compatible',
  )!;
  assert.ok(trial);
  assert.equal(
    (await solveMissionDocument(trial.document)).candidates[0].status,
    'feasible_model',
  );
  // A bounded mixed-work search may spend its budget on RGB before reaching MS.
  // Exercise the specific diagnostic on the unassignable work alone, so this
  // assertion does not depend on host load or on the search's job order.
  const unsupportedOnly = structuredClone(d);
  unsupportedOnly.jobs = unsupportedOnly.jobs.filter(
    (j) => j.id === 'added-ms',
  );
  const unsupportedCheck = (
    await solveMissionDocument(unsupportedOnly)
  ).candidates[0].checks.find((x) => x.id.startsWith('UNSUPPORTED'));
  assert.ok(
    unsupportedCheck,
    'The disabled MS-only case must explain its incompatible fleet.',
  );
  assert.equal(
    plainMissionCheck(unsupportedCheck).explanation,
    unsupportedCheck.detail,
  );
});

void test('third demo remains blocked by its explicit assignment; full-fleet repair is genuinely verified', async () => {
  const d = documents[2];
  const c = (await solveMissionDocument(d)).candidates[0];
  assert.notEqual(c.status, 'feasible_model');
  const trial = missionImprovementTrials(d, c).find(
    (x) => x.id === 'auto-assignment',
  )!;
  assert.ok(trial);
  const fixed = (await solveMissionDocument(trial.document)).candidates[0];
  assert.equal(fixed.status, 'feasible_model');
  assert.deepEqual(
    (await validateExportedCandidate(trial.document, fixed)).filter(
      (x) => x.status === 'fail',
    ),
    [],
  );
  assert.equal(
    trial.document.scenario.vehicles.find((v) => v.id === 'demo-07')!
      .batteryPct,
    26,
  );
});

void test('active common aircraft are not offered simultaneously to another mission', async () => {
  const c = (await solveMissionDocument(documents[0])).candidates[0];
  const other = {
    ...structuredClone(documents[2]),
    jobs: documents[2].jobs.map((j) => ({ ...j, assignedVehicleIds: [] })),
  };
  const input = withMissionReservations(other, [
    {
      id: 'shared-run',
      status: 'running',
      startedAt: other.window.start,
      document: documents[0],
      candidate: c,
    },
  ]);
  const used = new Set(c.sorties.map((s) => s.vehicleId));
  const result = await solveMissionDocument(input);
  assert.ok(input.resourceReservations?.length);
  assert.ok(
    result.candidates.every((candidate) =>
      candidate.sorties.every((s) => !used.has(s.vehicleId)),
    ),
  );
});

void test('official obstacles scenario remains independently valid with all regional models active', async () => {
  const d = documents[1];
  const r = await solveMissionDocument(d);
  for (const c of r.candidates) {
    assert.equal(c.status, 'feasible_model');
    assert.deepEqual(
      (await validateExportedCandidate(d, c)).filter(
        (x) => x.status === 'fail',
      ),
      [],
    );
  }
});

void test('only explicitly accepted demo trial changes may replace a battery; assignment preserves spent charge', () => {
  const d = documents[2],
    at = '2026-09-23T16:00:00.000Z';
  const states = d.scenario.vehicles.map((v) =>
    fleetStateFromDocument(d, v.id, at),
  );
  const assignment = structuredClone(d);
  assignment.jobs.forEach((j) => {
    j.assignedVehicleIds = [];
  });
  assert.deepEqual(simulatedTrialFleetChanges(d, assignment, states, at), []);
  const replacement = structuredClone(d);
  replacement.scenario.vehicles.find((v) => v.id === 'demo-07')!.batteryPct =
    100;
  replacement.batteries.find((b) => b.vehicleId === 'demo-07')!.initialPct =
    100;
  const [report] = simulatedTrialFleetChanges(d, replacement, states, at);
  assert.equal(report.replacement, true);
  assert.equal(report.state.source, 'simulation');
  assert.equal(report.state.battery.initialPct, 100);
  assert.equal(states.find((s) => s.id === 'demo-07')!.battery.initialPct, 26);
  const busy = structuredClone(states);
  busy.find((s) => s.id === 'demo-07')!.operationId = 'active';
  assert.throws(
    () => simulatedTrialFleetChanges(d, replacement, busy, at),
    /аппарат занят/,
  );
  const outdated = structuredClone(states);
  outdated.find((s) => s.id === 'demo-07')!.vehicle.batteryPct = 25;
  assert.throws(
    () => simulatedTrialFleetChanges(d, replacement, outdated, at),
    /состояние изменилось/,
  );
});

void test('explicitly accepted activation re-enables ground aircraft without restoring charge', () => {
  const before = structuredClone(documents[0]);
  before.scenario.vehicles.find((v) => v.id === 'north-gemini-ms-1')!.enabled =
    false;
  const at = '2026-09-23T16:00:00.000Z';
  const state = fleetStateFromDocument(before, 'north-gemini-ms-1', at);
  const after = structuredClone(before);
  after.scenario.vehicles.find((v) => v.id === state.id)!.enabled = true;
  const [report] = simulatedTrialFleetChanges(before, after, [state], at);
  assert.equal(report.replacement, false);
  assert.equal(report.state.ready, true);
  assert.equal(report.state.vehicle.enabled, true);
  assert.equal(report.state.battery.initialPct, state.battery.initialPct);
});
