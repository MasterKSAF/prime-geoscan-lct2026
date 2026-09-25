import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { sha256 } from '../lib/planner/mission-schema.ts';
import {
  createSafetySession,
  decideSafety,
  recoveryOptions,
  returnReserveAlert,
  safetyDocument,
  unfinishedRevision,
} from '../lib/planner/mission-safety.ts';
import {
  createMissionOperations,
  getOperationStartBlockers,
} from '../lib/planner/mission-operations.ts';
import { positionAt } from '../lib/planner/mission-validation.ts';
import { projection } from '../lib/planner/geometry.ts';
const now = new Date('2026-09-20T10:00:00Z');
const fixture = (async () => {
  const document = SHOWCASE_SCENARIOS.find(
    (s) => s.id === 'area-with-hole',
  )!.create();
  const result = await solveMissionDocument(document),
    candidate = result.candidates[0];
  assert.equal(candidate.status, 'feasible_model');
  const seg = candidate.sorties[0].segments.find((s) => s.phase === 'survey')!;
  return { document, candidate, progressSec: (seg.startSec + seg.endSec) / 2 };
})();
const input = {
  id: 'ba4fc034-6b16-4c13-a8ce-8e884868f313',
  kind: 'sensor' as const,
  vehicleId: 'rgb-1',
  windMps: 0,
  batteryPct: 30,
};
void test('recovery checks a real route and budgets sixty seconds, leaving original untouched', async () => {
  const row = await fixture,
    before = JSON.stringify(row);
  const s = createSafetySession(row, input, now);
  assert.equal(s.stage, 'pending');
  const options = recoveryOptions(row.document, row.candidate, s);
  assert.ok(options.some((o) => o.valid));
  const o = options.find((o) => o.valid)!;
  assert.equal(
    o.sorties[0].segments[0].endSec - o.sorties[0].segments[0].startSec,
    60,
  );
  assert.ok(o.minimumPct >= row.document.scenario.reservePct);
  assert.equal(JSON.stringify(row), before);
});
void test('sixty real seconds required; timeout single action and early stale choices refused', async () => {
  const row = await fixture,
    s = createSafetySession(row, input, now);
  assert.throws(
    () => decideSafety(row, s, 'home', 'timeout', new Date(+now + 59000)),
    /не истекло/,
  );
  const next = decideSafety(row, s, 'home', 'timeout', new Date(+now + 60000));
  assert.equal(next.stage, 'returning');
  assert.equal(next.decision, 'timeout');
  assert.throws(
    () => decideSafety(row, next, 'home', 'operator', now),
    /уже принято/,
  );
});
void test('crash never produces a return; aircraft disabled in a new distinct revision', async () => {
  const row = await fixture,
    s = createSafetySession(row, { ...input, kind: 'crash' }, now);
  assert.equal(s.stage, 'crashed');
  assert.ok(
    recoveryOptions(row.document, row.candidate, s).every((o) => !o.valid),
  );
  const next = unfinishedRevision(
    row.document,
    row.candidate,
    row.progressSec,
    'new-id',
    s,
  );
  assert.equal(
    next.scenario.vehicles.find((v) => v.id === input.vehicleId)?.enabled,
    false,
  );
  assert.notEqual(next.id, row.document.id);
});
void test('wind outside profile and exhausted battery block fake returns', async () => {
  const row = await fixture;
  assert.equal(
    createSafetySession(row, { ...input, kind: 'wind', windMps: 30 }, now)
      .stage,
    'blocked',
  );
  assert.equal(
    createSafetySession(row, { ...input, kind: 'battery', batteryPct: 1 }, now)
      .stage,
    'blocked',
  );
});

void test('wind triggers immediate checked return; new wind invalidates any cached decision', async () => {
  const row = await fixture;
  const normal = createSafetySession(
    row,
    { ...input, kind: 'wind', windMps: 2 },
    now,
  );
  assert.equal(normal.stage, 'returning');
  assert.equal(normal.delaySec, 0);
  const extreme = createSafetySession(
    row,
    { ...input, kind: 'wind', windMps: 30 },
    now,
  );
  assert.equal(extreme.stage, 'blocked');
  assert.ok(
    recoveryOptions(row.document, row.candidate, extreme).every(
      (o) => !o.valid,
    ),
  );
  assert.ok(
    recoveryOptions(row.document, row.candidate, normal).some((o) => o.valid),
  );
});
void test('critical battery bypasses waiting when only immediate return is feasible', async () => {
  const row = await fixture;
  const base = createSafetySession(row, input, now);
  const immediate = { ...base, delaySec: 0 as const };
  const route = recoveryOptions(row.document, row.candidate, immediate).find(
    (o) => o.valid,
  )!;
  const seg = row.candidate.sorties[0].segments.find(
    (s) => s.startSec <= row.progressSec && s.endSec > row.progressSec,
  )!;
  const consumed =
    positionAt(seg, row.progressSec).batteryPct - route.minimumPct;
  const charge = row.document.scenario.reservePct + consumed + 0.1;
  const s = createSafetySession(
    row,
    { ...input, kind: 'battery', batteryPct: charge },
    now,
  );
  assert.equal(s.stage, 'returning');
  assert.equal(s.delaySec, 0);
  assert.equal(s.decision, 'immediate');
});
void test('unknown terrain is not silently treated as a safe flat plane', async () => {
  const row = structuredClone(await fixture);
  row.document.terrainModel = { kind: 'unknown', source: 'unknown' };
  assert.equal(createSafetySession(row, input, now).stage, 'blocked');
});
void test('obstacle creates a known footprint and deviation uses observed rather than planned position', async () => {
  const row = await fixture,
    s = createSafetySession(row, { ...input, kind: 'obstacle' }, now);
  assert.equal(
    safetyDocument(row.document, row.candidate, s).restrictions.length,
    row.document.restrictions.length + 1,
  );
  const deviation = createSafetySession(
    row,
    { ...input, kind: 'deviation' },
    now,
  );
  const route = recoveryOptions(row.document, row.candidate, deviation).find(
    (o) => o.valid,
  );
  if (route) {
    const seg = row.candidate.sorties[0].segments.find(
      (s) => s.startSec <= row.progressSec && s.endSec > row.progressSec,
    )!;
    assert.notDeepEqual(
      route.sorties[0].segments[0].from,
      positionAt(seg, row.progressSec).coordinate,
    );
  }
});
void test('nominal return reserve monitor accepts the healthy fixture', async () => {
  const row = await fixture;
  assert.equal(
    returnReserveAlert(row.document, row.candidate, row.progressSec),
    null,
  );
});

void test('blocked base does not produce a straight-line fake return', async () => {
  const row = structuredClone(await fixture),
    v = row.document.scenario.vehicles[0],
    p = projection(v.landing);
  const geometry = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [-25, -25],
        [25, -25],
        [25, 25],
        [-25, 25],
        [-25, -25],
      ].map((q) => p.inverse(q as [number, number])),
    ],
  };
  row.document.restrictions.push({
    id: 'blocked-base',
    name: 'База закрыта',
    kind: 'noFlight',
    geometry,
    minAltitudeM: 0,
    maxAltitudeM: null,
    startAt: null,
    endAt: null,
    source: 'Test',
  });
  const s = createSafetySession(row, input, now);
  assert.equal(s.stage, 'blocked');
});
void test('two aircraft cannot reuse an occupied recovery landing site', async () => {
  const row = structuredClone(await fixture),
    original = row.candidate.sorties[0],
    v = row.document.scenario.vehicles[0];
  const seg = original.segments.find(
    (s) => s.startSec <= row.progressSec && s.endSec > row.progressSec,
  )!;
  const p = projection(v.landing),
    from = p.inverse([800, 450]);
  row.document.scenario.vehicles.push({
    ...v,
    id: 'other',
    name: 'Другой аппарат',
    start: from,
  });
  row.candidate.sorties.push({
    ...original,
    id: 'other-sortie',
    vehicleId: 'other',
    segments: [
      {
        ...seg,
        from,
        to: from,
        startSec: row.progressSec - 1,
        endSec: row.progressSec + 600,
        altitudeFromM: 140,
        altitudeToM: 140,
        batteryFromPct: 100,
        batteryToPct: 100,
      },
    ],
    startSec: row.progressSec - 1,
    endSec: row.progressSec + 600,
  });
  const s = createSafetySession(row, input, now);
  assert.ok(
    recoveryOptions(row.document, row.candidate, s).every((o) => !o.valid),
  );
});
void test('safety persists atomically, prevents replay/parallel start, closes without declaring work complete', async () => {
  const row = await fixture;
  let clock = now;
  const store = createMissionOperations({
    indexedDB: new IDBFactory(),
    now: () => clock,
  });
  const inputHash = await sha256(row.document),
    planHash = await sha256(row.candidate);
  let op = await store.enqueue({
    id: 'run-safe',
    document: row.document,
    candidate: row.candidate,
    approval: {
      inputHash,
      planHash,
      candidateId: row.candidate.id,
      approvedAt: now.toISOString(),
    },
  });
  op = await store.start(op.id, op.revision);
  op = await store.pause(op.id, op.revision, row.progressSec);
  op = await store.safetyChange(op.id, op.revision, {
    type: 'detect',
    ...input,
  });
  assert.equal(op.safety?.stage, 'pending');
  assert.equal(op.planHash, planHash);
  assert.equal(op.inputHash, inputHash);
  await assert.rejects(store.start(op.id, op.revision), /защитный сценарий/);
  await assert.rejects(
    store.safetyChange(op.id, op.revision - 1, {
      type: 'decide',
      policy: 'home',
      reason: 'operator',
    }),
    /Ревизия/,
  );
  const other = {
    ...op,
    id: 'other',
    safety: undefined,
    status: 'scheduled' as const,
  };
  assert.ok(
    getOperationStartBlockers(other, [op, other]).some(
      (b) => b.code === 'SIMULATOR_BUSY',
    ),
  );
  clock = new Date(+now + 60000);
  op = await store.safetyChange(op.id, op.revision, {
    type: 'decide',
    policy: 'home',
    reason: 'timeout',
  });
  const end = recoveryOptions(op.document, op.candidate, op.safety!).find(
    (o) => o.policy === 'home',
  )!.endSec;
  op = await store.safetyChange(op.id, op.revision, {
    type: 'advance',
    progressSec: end,
  });
  assert.equal(op.safety?.stage, 'landed');
  op = await store.cancel(op.id, op.revision);
  assert.equal(op.status, 'cancelled');
  assert.equal((await store.get(op.id))?.safety?.stage, 'landed');
  assert.ok(
    !getOperationStartBlockers(other, [op, other]).some(
      (b) => b.code === 'SIMULATOR_BUSY',
    ),
  );
  store.close();
});
