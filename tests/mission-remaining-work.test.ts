import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { sha256 } from '../lib/planner/mission-schema.ts';
import {
  createMissionOperations,
  verifyMissionOperation,
} from '../lib/planner/mission-operations.ts';
import { recoveryOptions } from '../lib/planner/mission-safety.ts';
import type { IncidentKind } from '../lib/planner/mission-safety.ts';
import {
  prepareRemainingMission,
  normalizeRemainingGeometry,
} from '../lib/planner/mission-remaining-work.ts';
import { missionCoverageViews } from '../lib/planner/mission-coverage-view.ts';
import { area, projection } from '../lib/planner/geometry.ts';
import type { Multi } from '../lib/planner/geometry.ts';

async function scenario(kind: IncidentKind = 'wind', confirmReady = false) {
  let clock = new Date('2026-09-20T10:00:00.000Z');
  const document = SHOWCASE_SCENARIOS.find(
      (s) => s.id === 'area-with-hole',
    )!.create(),
    result = await solveMissionDocument(document),
    candidate = result.candidates[0],
    surveys = candidate.sorties[0].segments.filter((s) => s.phase === 'survey');
  assert.equal(candidate.status, 'feasible_model');
  assert.ok(surveys.length > 2);
  const store = createMissionOperations({
    indexedDB: new IDBFactory(),
    now: () => clock,
  });
  try {
    let row = await store.enqueue({
      id: `remaining-${kind}`,
      document,
      candidate,
      approval: {
        inputHash: result.inputHash,
        planHash: await sha256(candidate),
        candidateId: candidate.id,
        approvedAt: clock.toISOString(),
      },
    });
    row = await store.start(row.id, row.revision);
    const interrupted = surveys[kind === 'obstacle' ? 0 : 1];
    row = await store.pause(
      row.id,
      row.revision,
      (interrupted.startSec + interrupted.endSec) / 2,
    );
    row = await store.safetyChange(row.id, row.revision, {
      type: 'detect',
      id: crypto.randomUUID(),
      kind,
      vehicleId: candidate.sorties[0].vehicleId,
      windMps: 0,
      batteryPct: 90,
    });
    const beforeLanding = structuredClone(row);
    if (row.safety!.stage === 'pending') {
      clock = new Date(+clock + 60000);
      row = await store.safetyChange(row.id, row.revision, {
        type: 'decide',
        policy: row.safety!.policy,
        reason: 'operator',
      });
    }
    if (row.safety!.stage === 'returning') {
      const recovery = recoveryOptions(
        row.document,
        row.candidate,
        row.safety!,
      ).find((o) => o.policy === row.safety!.policy)!;
      row = await store.safetyChange(row.id, row.revision, {
        type: 'advance',
        progressSec: recovery.endSec,
      });
    }
    row = await store.cancel(row.id, row.revision);
    if (confirmReady) {
      for (const state of await store.listFleet()) {
        clock = new Date(+clock + 1000);
        await store.reportFleet({
          expectedRevision: state.revision,
          replacement: false,
          state: {
            ...state,
            observedAt: clock.toISOString(),
            source: 'operator',
            ready: true,
            lastEvent:
              'Осмотр после модельной посадки: готовность подтверждена, батарея не заменялась.',
          },
        });
      }
    }
    return { row, fleet: await store.listFleet(), beforeLanding };
  } finally {
    store.close();
  }
}
const fixture = scenario();

void test('remaining work is a new hash-bound draft after landing, without mutation of parent or fleet', async () => {
  const { row, fleet } = await fixture,
    before = JSON.stringify({ row, fleet }),
    result = await prepareRemainingMission(
      row,
      { acknowledgedData: true },
      fleet,
    );
  assert.notEqual(result.document.id, row.document.id);
  assert.match(result.document.id, /^[0-9a-f-]{36}$/);
  assert.equal(result.parentBinding.operationId, row.id);
  assert.equal(result.parentBinding.integrityHash, row.integrityHash);
  assert.equal(result.parentBinding.inputHash, row.inputHash);
  assert.ok(result.document.notes.includes(row.id));
  assert.ok(result.document.notes.includes(row.planHash));
  assert.equal(result.parentBinding.planHash, row.planHash);
  assert.equal(result.parentBinding.fleetHash, await sha256(fleet));
  assert.equal(result.parentBinding.draftHash, await sha256(result.document));
  assert.equal(JSON.stringify({ row, fleet }), before);
  await verifyMissionOperation(row);
});

void test('only fully completed survey passes are credited; interrupted segment is retained', async () => {
  const { row, fleet } = await fixture,
    result = await prepareRemainingMission(
      row,
      { acknowledgedData: true },
      fleet,
    ),
    expected = structuredClone(row.candidate);
  expected.sorties = expected.sorties.map((s) => ({
    ...s,
    segments: s.segments.filter(
      (seg) => seg.phase === 'survey' && seg.endSec <= row.safety!.modelTimeSec,
    ),
  }));
  const view = missionCoverageViews(row.document, expected)[0];
  assert.ok(view.coveredM2 > 0 && view.missingM2 > 0);
  assert.equal(result.coverage[0].coveredM2, view.coveredM2);
  const all = missionCoverageViews(row.document, row.candidate)[0];
  assert.ok(result.coverage[0].coveredM2 < all.coveredM2);
  assert.ok(Math.abs(view.requestedM2 - view.coveredM2 - view.missingM2) < 0.1);
  const p = projection(row.document.scenario.area.coordinates[0][0]),
    actual = result.document.jobs.reduce(
      (sum, j) =>
        sum +
        area([j.area.coordinates.map((ring) => ring.map(p.forward))] as Multi),
      0,
    );
  assert.ok(Math.abs(actual - view.missingM2) < 0.1);
});

void test('calendar uses the mission clock, keeps deadline and refuses automatic extension', async () => {
  const { row, fleet } = await fixture,
    result = await prepareRemainingMission(
      row,
      { acknowledgedData: true },
      fleet,
    ),
    earliest =
      Date.parse(row.document.window.start) +
      Math.ceil(row.safety!.progressSec * 1000);
  assert.equal(Date.parse(result.document.window.start), earliest);
  assert.equal(result.document.window.end, row.document.window.end);
  assert.ok(
    Date.parse(result.document.window.start) < Date.parse(row.finishedAt!),
  );
  assert.equal(result.parentBinding.clock, 'mission-model');
  await assert.rejects(
    prepareRemainingMission(
      row,
      { acknowledgedData: true, modelStartAt: row.document.window.start },
      fleet,
    ),
    /после модельного/,
  );
  await assert.rejects(
    prepareRemainingMission(
      row,
      { acknowledgedData: true, modelStartAt: row.document.window.end },
      fleet,
    ),
    /срок/,
  );
});

void test('current battery is transferred exactly and readiness is never invented after an incident', async () => {
  const { row, fleet } = await fixture,
    result = await prepareRemainingMission(
      row,
      { acknowledgedData: true },
      fleet,
    );
  for (const state of fleet) {
    assert.equal(
      result.document.scenario.vehicles.find((v) => v.id === state.id)!
        .batteryPct,
      state.battery.initialPct,
    );
    assert.equal(
      result.document.batteries.find((b) => b.vehicleId === state.id)!
        .initialPct,
      state.battery.initialPct,
    );
    assert.equal(
      result.document.batteries.find((b) => b.vehicleId === state.id)!
        .rechargeSec,
      null,
    );
    if (!state.ready)
      assert.equal(
        result.document.scenario.vehicles.find((v) => v.id === state.id)!
          .enabled,
        false,
      );
  }
  assert.ok(fleet.some((s) => s.battery.initialPct < 100));
});

void test('unacknowledged data, unfinished landing and tampered source cannot create continuation', async () => {
  const { row, fleet, beforeLanding } = await fixture;
  await assert.rejects(
    prepareRemainingMission(row, { acknowledgedData: false }, fleet),
    /Подтвердите/,
  );
  await assert.rejects(
    prepareRemainingMission(beforeLanding, { acknowledgedData: true }, fleet),
    /посадки/,
  );
  const tampered = structuredClone(row);
  tampered.candidate.sorties[0].segments[0].batteryToPct = 100;
  await assert.rejects(
    prepareRemainingMission(tampered, { acknowledgedData: true }, fleet),
    /целостность/,
  );
});

void test('sensor failure does not certify earlier sensor data merely from nominal motion', async () => {
  const { row, fleet } = await scenario('sensor');
  await assert.rejects(
    prepareRemainingMission(row, { acknowledgedData: true }, fleet),
    /сенсора/,
  );
});

void test('stale, incomplete, airborne and busy fleet states fail closed', async () => {
  const { row, fleet } = await fixture;
  await assert.rejects(
    prepareRemainingMission(row, { acknowledgedData: true }, []),
    /реестр/,
  );
  const stale = structuredClone(fleet);
  stale[0].observedAt = new Date(Date.parse(row.updatedAt) - 1).toISOString();
  await assert.rejects(
    prepareRemainingMission(row, { acknowledgedData: true }, stale),
    /старше/,
  );
  const airborne = structuredClone(fleet);
  airborne[0].grounded = false;
  airborne[0].ready = false;
  await assert.rejects(
    prepareRemainingMission(row, { acknowledgedData: true }, airborne),
    /земле/,
  );
  const busy = structuredClone(fleet);
  busy[0].operationId = 'another-run';
  await assert.rejects(
    prepareRemainingMission(row, { acknowledgedData: true }, busy),
    /другом/,
  );
});

void test('raising charge to 100 needs an explicit post-landing battery replacement', async () => {
  const { row, fleet } = await fixture,
    changed = structuredClone(fleet),
    s = changed[0];
  s.vehicle.batteryPct = 100;
  s.battery.initialPct = 100;
  await assert.rejects(
    prepareRemainingMission(row, { acknowledgedData: true }, changed),
    /замены/,
  );
  s.observedAt = new Date(Date.parse(row.finishedAt!) + 1000).toISOString();
  s.replacements.push({
    at: s.observedAt,
    fromId: s.battery.id,
    toId: s.battery.id,
    pct: 100,
  });
  s.source = 'operator';
  const result = await prepareRemainingMission(
    row,
    { acknowledgedData: true },
    changed,
  );
  assert.equal(result.document.scenario.vehicles[0].batteryPct, 100);
  assert.equal(result.document.scenario.vehicles[0].enabled, false);
});

void test('new obstacle and changed wind are preserved in continuation, not discarded for feasibility', async () => {
  const { row, fleet } = await scenario('obstacle'),
    result = await prepareRemainingMission(
      row,
      { acknowledgedData: true },
      fleet,
    );
  assert.equal(result.document.scenario.wind.speedMps, row.safety!.windMps);
  assert.ok(
    result.document.restrictions.some(
      (r) => r.id === `incident-${row.safety!.id}`,
    ),
  );
  assert.equal(
    result.document.restrictions.length,
    row.document.restrictions.length + 1,
  );
});

void test('one-metre passage and real hole survive micrometre normalization', () => {
  const ring: Multi = [
    [
      [
        [0, 0],
        [10, 0],
        [10, 4.5],
        [20, 4.5],
        [20, 0],
        [30, 0],
        [30, 10],
        [20, 10],
        [20, 5.5],
        [10, 5.5],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [2, 2],
        [2, 3],
        [3, 3],
        [3, 2],
        [2, 2],
      ],
    ],
  ];
  const before = JSON.stringify(ring),
    result = normalizeRemainingGeometry(ring);
  assert.equal(result.geometry.length, 1);
  assert.equal(result.geometry[0].length, 2);
  assert.equal(area(result.geometry), 209);
  assert.equal(result.numericDeltaM2, 0);
  assert.equal(JSON.stringify(ring), before);
});

void test('normalization reports nanometre hairpin repair and rejects excessive area change', async () => {
  const { row, fleet } = await fixture,
    result = await prepareRemainingMission(
      row,
      { acknowledgedData: true },
      fleet,
    );
  assert.equal(result.normalization.gridM, 0.000001);
  assert.ok(result.normalization.numericDeltaM2 > 0);
  assert.ok(result.normalization.numericDeltaM2 <= 0.1);
  const large: Multi = [
    [
      [
        [0.0000004, 0.0000004],
        [200000.0000004, 0.0000004],
        [200000.0000004, 200000.0000004],
        [0.0000004, 200000.0000004],
        [0.0000004, 0.0000004],
      ],
    ],
  ];
  assert.throws(() => normalizeRemainingGeometry(large), /0,1 м²/);
});

void test('numerical tolerance does not authorize deleting an isolated narrow component', () => {
  const narrow: Multi = [
    [
      [
        [0, 0],
        [0.0000001, 0],
        [0.0000001, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  ];
  assert.throws(
    () => normalizeRemainingGeometry(narrow),
    /число частей|нормализовать/,
  );
});

void test('real operation store, landed recovery, explicit readiness and remaining-work solve form a valid end-to-end path without fresh battery', async () => {
  const { row, fleet } = await scenario('wind', true),
    before = JSON.stringify(row),
    draft = await prepareRemainingMission(
      row,
      { acknowledgedData: true },
      fleet,
    ),
    result = await solveMissionDocument(draft.document);
  assert.ok(
    fleet.every((s) => s.ready && s.grounded && s.source === 'operator'),
  );
  assert.ok(fleet.some((s) => s.battery.initialPct < 100));
  assert.ok(fleet.every((s) => s.replacements.length === 0));
  assert.ok(
    result.candidates.some((c) => c.status === 'feasible_model'),
    JSON.stringify(
      result.candidates.map((c) => ({
        status: c.status,
        failures: c.checks.filter((x) => x.status === 'fail'),
      })),
    ),
  );
  const accepted = result.candidates.find(
    (c) => c.status === 'feasible_model',
  )!;
  for (const sortie of accepted.sorties) {
    const state = fleet.find((s) => s.id === sortie.vehicleId)!;
    assert.ok(sortie.segments[0].batteryFromPct <= state.battery.initialPct);
    assert.ok(sortie.remainingPct >= draft.document.scenario.reservePct);
  }
  assert.equal(JSON.stringify(row), before);
});
