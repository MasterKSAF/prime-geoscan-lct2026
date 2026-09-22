import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import {
  appendEmptyArea,
  appendMissionWork,
  setWorkPriority,
  prioritizeMissionJobs,
} from '../lib/planner/mission-editing.ts';
import {
  parseMissionDocument,
  canonicalStringify,
  sha256,
} from '../lib/planner/mission-schema.ts';
import {
  parseMissionText,
  serializeMissionJson,
} from '../lib/planner/mission-io.ts';
import { createMissionLibrary } from '../lib/planner/mission-library.ts';
import {
  createFleetRegistry,
  fleetRegistryTemplate,
} from '../lib/planner/fleet-registry.ts';
import {
  applyFleetState,
  fleetStateFromDocument,
  installedBatteryDocument,
} from '../lib/planner/mission-fleet-state.ts';
import {
  baseAssignmentReport,
  baseChangeBlocker,
  refreshDraftFleet,
  vehicleAssignments,
} from '../lib/planner/fleet-availability.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { createMissionOperations } from '../lib/planner/mission-operations.ts';

void test('new area has no hidden copied geometry, cannot persist or solve, and leaves source intact', async () => {
  const source = installedBatteryDocument(demoMission(1));
  const original = canonicalStringify(source);
  const draft = appendEmptyArea(source, source.jobs[0].id, 'empty-area');
  assert.deepEqual(draft.jobs.at(-1)!.area.coordinates, []);
  assert.equal(canonicalStringify(source), original);
  assert.throws(() => parseMissionDocument(draft));
  assert.throws(() => serializeMissionJson(draft));
  await assert.rejects(solveMissionDocument(draft));
  const library = createMissionLibrary({ indexedDB: new IDBFactory() });
  await assert.rejects(library.save(draft));
  assert.equal((await library.list()).length, 0);
  assert.throws(
    () => appendEmptyArea(draft, draft.jobs[0].id, 'another'),
    /Сначала/,
  );
  draft.jobs.at(-1)!.area = structuredClone(source.jobs[0].area);
  assert.equal((await library.save(draft)).document.jobs.length, 2);
  library.close();
});

void test('area IDs and limits are validated before entering drawing mode', () => {
  let d = demoMission(1);
  assert.throws(
    () => appendEmptyArea(d, d.jobs[0].id, d.jobs[0].id),
    /новый ID/,
  );
  for (let n = 1; n < 8; n++)
    d = appendMissionWork(d, d.jobs[0].id, 'RGB', `j${n}`);
  assert.throws(() => appendEmptyArea(d, d.jobs[0].id, 'ninth'), /8 участков/);
});

void test('default automatic priority does not change existing document or ordering', () => {
  const d = demoMission(1);
  assert.equal('priority' in parseMissionDocument(d).jobs[0], false);
  assert.equal('workPriority' in parseMissionDocument(d).jobs[0], false);
  assert.deepEqual(prioritizeMissionJobs(d.jobs), d.jobs);
  assert.deepEqual(setWorkPriority(setWorkPriority(d, 'RGB', 1), 'RGB'), d);
});

void test('work priority applies to every same-type area; unrelated works remain independent', () => {
  let d = appendMissionWork(demoMission(1), 'unused', 'RGB', 'second-rgb');
  d = appendMissionWork(d, d.jobs[0].id, 'IR', 'thermal');
  const next = setWorkPriority(d, 'RGB', 2);
  assert.deepEqual(
    next.jobs.map((j) => j.workPriority),
    [2, 2, undefined],
  );
  const draft = appendEmptyArea(next, next.jobs[0].id, 'empty');
  assert.equal(draft.jobs.at(-1)!.workPriority, 2);
  assert.equal(draft.jobs.at(-1)!.priority, undefined);
  const differentWork = appendMissionWork(next, next.jobs[0].id, 'MS', 'ms');
  assert.equal(differentWork.jobs.at(-1)!.workPriority, undefined);
});

void test('priority survives JSON round trip; invalid priority is rejected', () => {
  const d = setWorkPriority(demoMission(1), 'RGB', 3);
  d.jobs[0].priority = 2;
  const parsed = parseMissionText(serializeMissionJson(d), 'json');
  assert.equal(parsed.jobs[0].workPriority, 3);
  assert.equal(parsed.jobs[0].priority, 2);
  for (const n of [0, 9, 1.5]) {
    d.jobs[0].priority = n;
    assert.throws(() => parseMissionDocument(d));
  }
  d.jobs[0].priority = 1;
  d.jobs[0].workPriority = 6;
  assert.throws(() => parseMissionDocument(d));
});

void test('allocation uses work priority then area priority, automatic ties are stable', () => {
  const source = demoMission(1).jobs[0];
  const jobs = [
    { ...source, id: 'auto' },
    { ...source, id: 'w2', workPriority: 2, priority: 1 },
    { ...source, id: 'w1a2', workPriority: 1, priority: 2 },
    { ...source, id: 'w1a1', workPriority: 1, priority: 1 },
    { ...source, id: 'auto2' },
  ];
  assert.deepEqual(
    prioritizeMissionJobs(jobs).map((j) => j.id),
    ['w1a1', 'w1a2', 'w2', 'auto', 'auto2'],
  );
  assert.equal(jobs[0].id, 'auto');
});

const fixture = (async () => {
  const d = installedBatteryDocument(
    SHOWCASE_SCENARIOS.find((s) => s.id === 'height-obstacle')!.create(),
  );
  d.jobs[0].priority = 1;
  d.jobs[0].workPriority = 1;
  const result = await solveMissionDocument(d);
  const candidate = result.candidates.find(
    (c) => c.status === 'feasible_model',
  )!;
  assert.ok(candidate);
  const now = new Date('2026-09-22T10:00:00Z');
  const store = createMissionOperations({
    indexedDB: new IDBFactory(),
    now: () => now,
  });
  const run = await store.enqueue({
    id: 'priority-test-run',
    document: d,
    candidate,
    approval: {
      inputHash: result.inputHash,
      planHash: await sha256(candidate),
      candidateId: candidate.id,
      approvedAt: now.toISOString(),
    },
  });
  return { d, result, run };
})();

void test('priority is recorded in real solver trace and preserves hard safety checks', async () => {
  const { result } = await fixture;
  const candidate = result.candidates.find(
    (c) => c.status === 'feasible_model',
  )!;
  assert.ok(candidate.trace.some((t) => t.event === 'JOB_PRIORITY_ORDER'));
  assert.equal(
    candidate.checks.some((c) => c.status === 'fail'),
    false,
  );
});

void test('fleet base change is blocked for scheduled, active and airborne vehicles', async () => {
  const { d, run } = await fixture;
  const id = run.candidate.sorties[0].vehicleId;
  const state = fleetStateFromDocument(d, id, '2026-09-22T10:00:00Z');
  assert.match(baseChangeBlocker(id, [run], state)!, /закреплён/);
  assert.match(
    baseChangeBlocker(id, [], { ...state, grounded: false, ready: false })!,
    /не на земле/,
  );
  const flying = {
    ...run,
    status: 'running' as const,
    startedAt: '2026-09-22T10:01:00Z',
  };
  assert.match(baseChangeBlocker('unrelated', [flying])!, /текущих полётов/);
  assert.equal(
    baseChangeBlocker(id, [{ ...run, status: 'completed' }], state),
    null,
  );
});

void test('assignments and remaining duration are modeled, pauses have unknown ETA', async () => {
  const { run } = await fixture;
  const id = run.candidate.sorties[0].vehicleId;
  assert.equal(vehicleAssignments(id, [run]).assigned.length, 1);
  assert.equal(vehicleAssignments(id, [run]).active.length, 0);
  const flying = { ...run, status: 'running' as const, progressSec: 20 };
  assert.equal(
    vehicleAssignments(id, [flying]).remainingSec,
    Math.max(0, run.candidate.metrics.makespanSec - 20),
  );
  assert.equal(
    vehicleAssignments(id, [{ ...flying, status: 'paused' }]).remainingSec,
    null,
  );
  assert.equal(
    vehicleAssignments(id, [{ ...flying, status: 'completed' }]).assigned
      .length,
    0,
  );
});

void test('operator base report preserves actual battery, readiness, provenance and CAS revision', () => {
  const d = installedBatteryDocument(demoMission(1)),
    id = d.scenario.vehicles[0].id;
  const old = fleetStateFromDocument(d, id, '2026-09-22T10:00:00Z');
  old.battery.initialPct = old.vehicle.batteryPct = 72;
  old.ready = false;
  old.preparationRemainingSec = 80;
  const next = structuredClone(d);
  next.scenario.vehicles[0].start = [37.55, 55.75];
  next.scenario.vehicles[0].landing = [37.55, 55.75];
  const report = baseAssignmentReport(
    next,
    id,
    old,
    [],
    new Date('2026-09-22T10:01:00Z'),
  );
  assert.equal(report.replacement, false);
  assert.equal(report.expectedRevision, old.revision);
  assert.equal(report.state.vehicle.batteryPct, 72);
  assert.deepEqual(report.state.battery, old.battery);
  assert.equal(report.state.ready, false);
  assert.equal(report.state.preparationRemainingSec, 80);
  assert.equal(report.state.source, 'operator');
  assert.deepEqual(report.state.vehicle.start, [37.55, 55.75]);
  assert.notDeepEqual(old.vehicle.start, report.state.vehicle.start);
  assert.throws(
    () => baseAssignmentReport(next, id, { ...old, grounded: false }, []),
    /не на земле/,
  );
});

void test('base update persists through state merge without importing unrelated aircraft', async () => {
  const source = installedBatteryDocument(demoMission(1));
  const before = fleetRegistryTemplate(source),
    after = structuredClone(before);
  after.scenario.vehicles[0].start = [37.55, 55.75];
  after.scenario.vehicles[0].landing = [37.55, 55.75];
  const original = canonicalStringify(source);
  const refreshed = refreshDraftFleet(source, before, after);
  const report = baseAssignmentReport(
    after,
    after.scenario.vehicles[0].id,
    undefined,
    [],
  );
  const merged = applyFleetState(refreshed, [report.state]);
  assert.deepEqual(
    merged.scenario.vehicles[0].start,
    after.scenario.vehicles[0].start,
  );
  assert.equal(canonicalStringify(source), original);
  const library = createMissionLibrary({ indexedDB: new IDBFactory() });
  const saved = await library.save(source);
  const updated = await library.save(merged, {
    expectedRevision: saved.revision,
  });
  assert.equal(updated.revision, 2);
  await assert.rejects(
    library.save(source, { expectedRevision: saved.revision }),
  );
  assert.equal(refreshDraftFleet(source, before, before), source);
  library.close();
});

void test('state and registry store accept a grounded base change; future solve sees the new base', async () => {
  let now = new Date('2026-09-22T10:00:00Z');
  const d = installedBatteryDocument(demoMission(1));
  const store = createMissionOperations({
    indexedDB: new IDBFactory(),
    now: () => now,
  });
  const registry = createFleetRegistry(new IDBFactory());
  const first = await registry.save(d, null);
  const id = d.scenario.vehicles[0].id;
  const state = await store.reportFleet(
    baseAssignmentReport(d, id, undefined, [], now),
  );
  now = new Date(now.getTime() + 1000);
  const changed = structuredClone(d);
  changed.scenario.vehicles[0].start = changed.scenario.vehicles[1].start;
  changed.scenario.vehicles[0].landing = changed.scenario.vehicles[1].start;
  const saved = await registry.save(changed, first.revision);
  const updated = await store.reportFleet(
    baseAssignmentReport(saved.document, id, state, [], now),
  );
  const merged = applyFleetState(
    refreshDraftFleet(d, first.document, saved.document),
    [updated],
  );
  assert.deepEqual(
    merged.scenario.vehicles[0].start,
    changed.scenario.vehicles[0].start,
  );
  assert.equal(updated.revision, 2);
  await registry.close();
});

void test('empty bases keep their identity after the last aircraft moves away', async () => {
  const registry = createFleetRegistry(new IDBFactory());
  const first = await registry.save(
    installedBatteryDocument(demoMission(1)),
    null,
  );
  const originalBases = structuredClone(first.document.bases!);
  assert.ok(originalBases.length >= 2);
  const next = structuredClone(first.document);
  next.scenario.vehicles[0].start = [...originalBases[1].coordinate];
  next.scenario.vehicles[0].landing = [...originalBases[1].coordinate];
  const saved = await registry.save(next, first.revision);
  assert.deepEqual(saved.document.bases, originalBases);
  await registry.close();
});
