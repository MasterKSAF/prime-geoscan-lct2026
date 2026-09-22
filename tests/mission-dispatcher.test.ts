import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import {
  missionBrowserRows,
  plannedWindowCountdown,
} from '../lib/planner/mission-browser.ts';
import {
  createFleetRegistry,
  applyRegistryFleet,
  assertRegistryChangesSafe,
  fleetBases,
  fleetRegistryTemplate,
} from '../lib/planner/fleet-registry.ts';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { parseMissionDocument, sha256 } from '../lib/planner/mission-schema.ts';
import {
  solveMissionDocument,
  missionJobContext,
} from '../lib/planner/mission-engine.ts';
import { validateMissionCandidate } from '../lib/planner/mission-validation.ts';
import { createMissionOperations } from '../lib/planner/mission-operations.ts';
import {
  missionRunReport,
  missionRunReportHtml,
  verifyMissionRunReport,
} from '../lib/planner/mission-run-export.ts';
import type { SavedMission } from '../lib/planner/mission-library.ts';
const source = () =>
  SHOWCASE_SCENARIOS.find((s) => s.id === 'height-obstacle')!.create();
const stamp = '2026-09-21T10:00:00.000Z';
void test('planned countdown never implies an automatic launch', () => {
  assert.equal(
    plannedWindowCountdown('2026-09-21T11:30:00Z', Date.parse(stamp)),
    'До окна 1 ч 30 мин · запуск вручную',
  );
  assert.match(
    plannedWindowCountdown(stamp, Date.parse(stamp)),
    /наступило.*вручную/,
  );
});
void test('global fleet is independent of invalid mission-only dates and names', async () => {
  const invalid = source();
  invalid.name = '';
  invalid.window.end = invalid.window.start;
  invalid.jobs[0].assignedVehicleIds = ['unknown'];
  const fleet = fleetRegistryTemplate(invalid);
  assert.ok(parseMissionDocument(fleet));
  assert.equal(fleet.jobs[0].assignedVehicleIds.length, 0);
  const store = createFleetRegistry(new IDBFactory());
  assert.equal((await store.save(invalid, null)).revision, 1);
  await store.close();
});
const fixture = (async () => {
  const document = source();
  const result = await solveMissionDocument(document);
  const candidate = result.candidates[0];
  assert.equal(candidate.status, 'feasible_model');
  const store = createMissionOperations({
    indexedDB: new IDBFactory(),
    now: () => new Date(stamp),
  });
  const row = await store.enqueue({
    id: 'test-dispatcher-run',
    document,
    candidate,
    approval: {
      inputHash: result.inputHash,
      planHash: await sha256(candidate),
      candidateId: candidate.id,
      approvedAt: stamp,
    },
  });
  return row;
})();
void test('mission list joins draft and runs by id; identical names do not merge', async () => {
  const run = await fixture;
  const saved: SavedMission = {
    id: run.document.id,
    document: run.document,
    revision: 1,
    savedAt: stamp,
    archived: false,
  };
  const second = {
    ...saved,
    id: 'different-mission',
    document: { ...run.document, id: 'different-mission' },
  };
  const rows = missionBrowserRows([saved, second], [run], {
    document: run.document,
    editing: true,
    changed: true,
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].runs.length, 1);
  assert.equal(rows[0].editing, true);
  assert.equal(rows[0].status, 'scheduled');
  assert.equal(
    missionBrowserRows([{ ...saved, archived: true }], []).length,
    0,
  );
});
void test('fleet registry persists, rejects stale writes and does not alias source', async () => {
  const factory = new IDBFactory(),
    store = createFleetRegistry(factory),
    other = createFleetRegistry(factory);
  const d = source(),
    saved = await store.save(d, null);
  d.scenario.vehicles[0].name = 'outside mutation';
  assert.notEqual(
    (await other.read())!.document.scenario.vehicles[0].name,
    'outside mutation',
  );
  await assert.rejects(other.save(source(), null), /другой вкладке/);
  assert.equal((await other.save(source(), saved.revision)).revision, 2);
  await store.close();
  await other.close();
});
void test('applying global fleet preserves mission id and rejects unknown manual assignments', async () => {
  const store = createFleetRegistry(new IDBFactory()),
    registry = await store.save(source(), null);
  const d = source();
  d.id = 'new-mission';
  const applied = applyRegistryFleet(d, registry);
  assert.equal(applied.id, 'new-mission');
  assert.equal(applied.planning.batteryPolicy, 'installed-current-v1');
  applied.jobs[0].assignedVehicleIds = ['not-in-registry'];
  assert.throws(() => applyRegistryFleet(applied, registry), /назначенных БВС/);
  assert.ok(fleetBases(d).every((b, i) => b.name === `База ${i + 1}`));
  await store.close();
});
void test('active run prevents profile changes in shared fleet, terminal run does not', async () => {
  const run = await fixture,
    d = structuredClone(run.document),
    id = run.candidate.sorties[0].vehicleId;
  d.scenario.vehicles.find((v) => v.id === id)!.batteryPct = 1;
  assert.throws(
    () => assertRegistryChangesSafe(run.document, d, [run]),
    /закреплён/,
  );
  assert.doesNotThrow(() =>
    assertRegistryChangesSafe(run.document, d, [
      { ...run, status: 'cancelled' },
    ]),
  );
});
void test('optional work period preserves legacy parse and enforces nesting', () => {
  const d = source();
  assert.equal(parseMissionDocument(d).jobs[0].window, undefined);
  d.jobs[0].window = { start: d.window.end, end: d.window.start };
  assert.throws(() => parseMissionDocument(d));
  d.jobs[0].window = {
    start: new Date(Date.parse(d.window.start) - 60000).toISOString(),
    end: d.window.end,
  };
  assert.throws(() => parseMissionDocument(d));
});
void test('solver respects a later work start and independent validator rejects earlier sortie', async () => {
  const d = source();
  d.jobs.forEach((j) => {
    j.window = {
      start: new Date(Date.parse(d.window.start) + 600000).toISOString(),
      end: d.window.end,
    };
  });
  const result = await solveMissionDocument(d),
    candidate = result.candidates[0];
  assert.equal(candidate.status, 'feasible_model');
  assert.ok(candidate.sorties.every((s) => s.startSec >= 600));
  assert.ok(
    candidate.checks.some(
      (c) => c.id.endsWith(':WORK_WINDOW') && c.status === 'pass',
    ),
  );
  const altered = structuredClone(d);
  altered.jobs.forEach((j) => {
    j.window!.start = new Date(
      Date.parse(d.window.start) + (candidate.metrics.makespanSec + 60) * 1000,
    ).toISOString();
  });
  const checks = validateMissionCandidate(
    altered,
    candidate.sorties,
    altered.jobs.map((j) => missionJobContext(altered, j)),
  );
  assert.ok(
    checks.some((c) => c.id.endsWith(':WORK_WINDOW') && c.status === 'fail'),
  );
});
void test('run export binds immutable snapshot, with no future events for queued run', async () => {
  const row = await fixture,
    report = await missionRunReport(row);
  assert.equal(report.operation.id, row.id);
  assert.equal(report.evidenceKind, 'model-execution-snapshot');
  assert.equal(report.flightReady, false);
  assert.equal(report.journal.modelEvents.length, 0);
  assert.equal(report.operation.inputHash, row.inputHash);
  await assert.rejects(missionRunReport({ ...row, progressSec: 100 }));
});
void test('HTML report escapes mission names and embedded data', async () => {
  const report = await missionRunReport(await fixture);
  report.operation.document.name = '<script>alert(1)</script>';
  const html = missionRunReportHtml(report);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.equal(html.includes('<script>'), false);
  assert.ok(html.includes('Реальные БВС не подключены'));
});
void test('report verifier rejects forged artifacts and journal without trusting saved hashes', async () => {
  const report = await missionRunReport(await fixture);
  assert.equal(
    (await verifyMissionRunReport(report)).operation.id,
    report.operation.id,
  );
  const forged = structuredClone(report);
  forged.plannedArtifacts.kml += '<!-- fake -->';
  await assert.rejects(verifyMissionRunReport(forged), /не совпадают/);
  const fakeJournal = structuredClone(report);
  fakeJournal.journal.progressSec = 200;
  await assert.rejects(verifyMissionRunReport(fakeJournal), /не совпадают/);
});
