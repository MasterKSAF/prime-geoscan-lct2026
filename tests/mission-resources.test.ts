import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { validateExportedCandidate } from '../lib/planner/mission-validation.ts';
import { parseMissionDocument, sha256 } from '../lib/planner/mission-schema.ts';
import {
  flightTimeBreakdown,
  missionResourceReport,
} from '../lib/planner/mission-resources.ts';
import {
  maintenanceAtProgress,
  maintenanceProjection,
  maintenancePolicy,
} from '../lib/planner/mission-maintenance.ts';
import { buildMissionRecommendation } from '../lib/planner/mission-comparison.ts';
import {
  buildMissionArchive,
  verifyArchiveFiles,
} from '../lib/planner/mission-archive.ts';
import { createMissionOperations } from '../lib/planner/mission-operations.ts';
import { missionImprovementTrials } from '../lib/planner/mission-insights.ts';

const automatic = () =>
  SHOWCASE_SCENARIOS.find((s) => s.id === 'automatic-tradeoff')!.create();
const repeat = () =>
  SHOWCASE_SCENARIOS.find((s) => s.id === 'repeat-sorties')!.create();

for (const limit of [1, 2, 3])
  void test(`N=${limit}: complete checked routes respect distinct aircraft cap and deadline`, async () => {
    const d = automatic();
    d.planning.maxVehicles = limit;
    // Synthetic acceptance fixture with enough energy even for a single UAV.
    d.scenario.vehicles.forEach((v) => {
      v.effectiveEnduranceMin *= 2;
    });
    const r = await solveMissionDocument(d);
    for (const c of r.candidates) {
      assert.equal(c.status, 'feasible_model');
      assert.ok(new Set(c.sorties.map((s) => s.vehicleId)).size <= limit);
      assert.equal(
        (await validateExportedCandidate(d, c)).filter(
          (x) => x.status === 'fail',
        ).length,
        0,
      );
      const time = flightTimeBreakdown(c);
      assert.ok(Math.abs(time.totalSec - c.metrics.flightTimeSec) < 1e-6);
      assert.ok(time.transitReturnSec > 0);
      assert.equal(missionResourceReport(d, c).deadlineMet, true);
    }
    assert.ok(r.resourceStudy?.rows.every((x) => x.maxVehicles <= limit));
  });

void test('cap is global across sequential jobs, not a concurrency cap; exported violation is rejected', async () => {
  const d = repeat();
  const extra = structuredClone(d.scenario.vehicles[0]);
  extra.id = 'extra';
  d.scenario.vehicles.push(extra);
  d.batteries.push({
    ...d.batteries[0],
    id: 'extra-current',
    vehicleId: 'extra',
  });
  d.jobs[0].assignedVehicleIds = [d.scenario.vehicles[0].id];
  d.jobs[1].assignedVehicleIds = ['extra'];
  d.planning.maxVehicles = 1;
  const r = await solveMissionDocument(d);
  assert.ok(r.candidates.every((c) => c.status !== 'feasible_model'));
  const base = repeat();
  const c = (await solveMissionDocument(base)).candidates[0];
  const forged = structuredClone(c);
  forged.sorties[1].vehicleId = 'extra';
  const checks = await validateExportedCandidate(d, forged);
  assert.ok(checks.some((x) => x.id === 'FLEET_LIMIT' && x.status === 'fail'));
  assert.ok(
    missionImprovementTrials(d, r.candidates[0]).some(
      (t) => t.id === 'extra-aircraft',
    ),
  );
});

void test('short deadline is not bypassed by recommendation; invalid N is rejected', async () => {
  const d = automatic();
  const r = await solveMissionDocument(d);
  d.window.end = new Date(Date.parse(d.window.start) + 60000).toISOString();
  assert.equal(
    buildMissionRecommendation(d, r.candidates, r.candidates),
    undefined,
  );
  const tight = await solveMissionDocument(d);
  assert.ok(tight.candidates.every((c) => c.status !== 'feasible_model'));
  assert.equal(tight.recommendation, undefined);
  for (const n of [0, -1, 1.5, 21])
    assert.throws(() =>
      parseMissionDocument({
        ...d,
        planning: { ...d.planning, maxVehicles: n },
      }),
    );
});

void test('maintenance is model specific; 80 flights and 160 hours are different units', () => {
  const v = repeat().scenario.vehicles[0];
  v.maintenance = {
    flightsSinceService: 79,
    flightSecondsSinceService: 0,
    source: 'simulation',
  };
  v.model = '201';
  assert.equal(maintenanceProjection(v, 1, 300).withinLimit, true);
  assert.equal(maintenanceProjection(v, 2, 300).withinLimit, false);
  v.model = '801';
  v.maintenance.flightSecondsSinceService = 160 * 3600 - 100;
  assert.equal(maintenanceProjection(v, 20, 100).withinLimit, true);
  assert.equal(maintenanceProjection(v, 1, 101).withinLimit, false);
  assert.equal(maintenancePolicy('Gemini')?.limit, 160);
  delete v.maintenance;
  assert.equal(maintenanceProjection(v, 1, 100).withinLimit, null);
});

void test('maintenance prevents assignment before resource is exhausted; proof catches forged overuse', async () => {
  const d = repeat();
  d.scenario.vehicles[0].model = 'Gemini';
  d.scenario.vehicles[0].maintenance = {
    flightsSinceService: 0,
    flightSecondsSinceService: 160 * 3600 - 1,
    source: 'simulation',
  };
  const r = await solveMissionDocument(d);
  assert.ok(r.candidates.every((c) => c.status !== 'feasible_model'));
  const c = (await solveMissionDocument(repeat())).candidates[0];
  assert.ok(
    (await validateExportedCandidate(d, c)).some(
      (x) => x.id.startsWith('MAINTENANCE_') && x.status === 'fail',
    ),
  );
});

void test('usage checkpoints are idempotent, include recovery without a second takeoff, and survive battery replacement', async () => {
  const d = repeat();
  d.jobs = d.jobs.slice(0, 1);
  d.scenario.vehicles[0].maintenance = {
    flightsSinceService: 7,
    flightSecondsSinceService: 1000,
    source: 'simulation',
  };
  const c = (await solveMissionDocument(d)).candidates[0];
  assert.equal(c.status, 'feasible_model');
  const v = d.scenario.vehicles[0],
    first = c.sorties[0],
    t = first.startSec + 5;
  const after = maintenanceAtProgress(v, c.sorties, t)!;
  assert.equal(after.flightsSinceService, 8);
  assert.equal(after.flightSecondsSinceService, 1005);
  assert.deepEqual(maintenanceAtProgress(v, c.sorties, t), after);
  const recovery = structuredClone(first);
  recovery.startSec = t;
  recovery.endSec = t + 10;
  const returning = maintenanceAtProgress(v, c.sorties, t, {
    sorties: [recovery],
    progressSec: t + 10,
  })!;
  assert.equal(returning.flightsSinceService, 8);
  assert.equal(returning.flightSecondsSinceService, 1015);
  let now = Date.parse('2026-09-23T12:00:00Z');
  const store = createMissionOperations({
    indexedDB: new IDBFactory(),
    now: () => new Date(now),
  });
  const queued = await store.enqueue({
    id: 'maintenance-run',
    document: d,
    candidate: c,
    approval: {
      inputHash: await sha256(d),
      planHash: await sha256(c),
      candidateId: c.id,
      approvedAt: new Date(now).toISOString(),
    },
  });
  let running = await store.start(queued.id, queued.revision);
  now += 1000;
  running = await store.advance(running.id, running.revision, t);
  now += 1000;
  await store.advance(running.id, running.revision, c.metrics.makespanSec);
  const old = (await store.listFleet())[0];
  assert.equal(
    old.vehicle.maintenance!.flightsSinceService,
    7 + c.sorties.length,
  );
  assert.ok(
    Math.abs(
      old.vehicle.maintenance!.flightSecondsSinceService -
        1000 -
        c.metrics.flightTimeSec,
    ) < 1e-6,
  );
  now += 1000;
  const swapped = await store.reportFleet({
    expectedRevision: old.revision,
    replacement: true,
    state: {
      ...old,
      source: 'operator',
      observedAt: new Date(now).toISOString(),
      battery: { ...old.battery, id: 'replaced-battery', initialPct: 100 },
      vehicle: { ...old.vehicle, batteryPct: 100 },
    },
  });
  assert.deepEqual(swapped.vehicle.maintenance, old.vehicle.maintenance);
  now += 1000;
  await assert.rejects(
    store.reportFleet({
      expectedRevision: swapped.revision,
      replacement: true,
      state: {
        ...swapped,
        source: 'operator',
        observedAt: new Date(now).toISOString(),
        battery: { ...swapped.battery, id: 'third-battery' },
        vehicle: {
          ...swapped.vehicle,
          maintenance: {
            flightsSinceService: 0,
            flightSecondsSinceService: 0,
            source: 'operator',
          },
        },
      },
    }),
    /не меняет наработку/,
  );
  store.close();
});

void test('resource evidence is reproducible and tampering is rejected', async () => {
  const d = automatic();
  d.planning.maxVehicles = 2;
  const c = (await solveMissionDocument(d)).candidates[0];
  const archive = await buildMissionArchive(d, c);
  const resource = JSON.parse(archive.files['data/analysis/resources.json']);
  assert.equal(resource.maxVehicles, 2);
  assert.equal(resource.deadlineMet, true);
  await verifyArchiveFiles(archive.files);
  archive.files['data/analysis/resources.json'] = '{}';
  await assert.rejects(verifyArchiveFiles(archive.files));
});

void test('battery remedy targets an allowed aircraft, not an unrelated depleted fleet member', async () => {
  const d = automatic();
  const candidate = (await solveMissionDocument(d)).candidates[0];
  const target = d.scenario.vehicles.at(-1)!;
  d.planning.batteryPolicy = 'installed-current-v1';
  d.jobs.forEach((j) => {
    j.assignedVehicleIds = [target.id];
  });
  d.scenario.vehicles.forEach((v) => {
    v.batteryPct = 23.1234567;
  });
  d.batteries = d.scenario.vehicles.map((v) => ({
    ...d.batteries.find((b) => b.vehicleId === v.id)!,
    initialPct: v.batteryPct,
    rechargeSec: null,
  }));
  const trials = missionImprovementTrials(d, {
    ...candidate,
    status: 'partial',
  });
  const batteryTrials = trials.filter((t) => t.id.startsWith('battery-full-'));
  assert.deepEqual(
    batteryTrials.map((t) => t.id),
    [`battery-full-${target.id}`],
  );
  assert.ok(!JSON.stringify(batteryTrials).includes('23.1234567%'));
});
