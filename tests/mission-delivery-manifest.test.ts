import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMONSTRATION_SCENARIOS,
  SHOWCASE_SCENARIOS,
} from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import {
  describeMissionDelivery,
  buildMissionDeliveryManifest,
} from '../lib/planner/mission-delivery-manifest.ts';
import { canonicalStringify, sha256 } from '../lib/planner/mission-schema.ts';

const d = DEMONSTRATION_SCENARIOS[0].create();
const solved = solveMissionDocument(d);

void test('delivery plan never claims real acquisition, file copy or completed flight', async () => {
  const c = (await solved).candidates[0],
    before = canonicalStringify({ d, c });
  const manifest = await buildMissionDeliveryManifest(d, c);
  assert.equal(manifest.phase, 'planned');
  assert.equal(manifest.modelSessionCompleted, false);
  assert.equal(manifest.modelOnly, true);
  assert.equal(manifest.flightReady, false);
  assert.equal(manifest.receivedData, false);
  assert.equal(manifest.transferPerformed, false);
  assert.deepEqual(manifest.receivedFiles, []);
  assert.equal(manifest.inputHash, await sha256(d));
  assert.equal(manifest.planHash, await sha256(c));
  assert.ok(
    manifest.jobs.every((j) => !j.acquisitionConfirmed && !j.filesReceived),
  );
  assert.equal(
    manifest.jobs[0].expectedCaptureEvents,
    c.sorties.reduce((n, s) => n + (s.shots ?? 0), 0),
  );
  assert.equal(canonicalStringify({ d, c }), before);
});

void test('completion flag refers only to simulation and cannot promote a rejected plan', async () => {
  const c = (await solved).candidates[0];
  const completed = describeMissionDelivery(d, c, true);
  assert.equal(completed.phase, 'simulation-completed');
  assert.equal(completed.receivedData, false);
  assert.equal(completed.transferPerformed, false);
  const invalid = describeMissionDelivery(
    d,
    { ...c, status: 'not_found' },
    true,
  );
  assert.equal(invalid.phase, 'incomplete-plan');
  assert.equal(invalid.modelSessionCompleted, false);
});

void test('battery result uses final landing of each vehicle, not first sortie or minimum group charge', async () => {
  const repeat = SHOWCASE_SCENARIOS.find(
    (s) => s.id === 'repeat-sorties',
  )!.create();
  const c = (await solveMissionDocument(repeat)).candidates[0];
  assert.ok(c.sorties.length >= 2);
  const summary = describeMissionDelivery(repeat, c, true);
  const last = c.sorties.toSorted((a, b) => a.endSec - b.endSec).at(-1)!;
  assert.equal(summary.vehicles[0].projectedFinalChargePct, last.remainingPct);
  assert.equal(summary.vehicles[0].lastLandingSec, last.endSec);
  assert.deepEqual(summary.vehicles[0].finalLanding, last.segments.at(-1)!.to);
});

void test('unused vehicles retain original charge; non-camera sensors do not invent a frame count', async () => {
  const economical = (await solved).candidates[1];
  const summary = describeMissionDelivery(d, economical);
  assert.ok(summary.vehicles.some((v) => !v.usedInPlan));
  assert.ok(
    summary.vehicles
      .filter((v) => !v.usedInPlan)
      .every(
        (v) =>
          v.initialChargePct === v.projectedFinalChargePct &&
          v.lastLandingSec === null,
      ),
  );
  const scan = SHOWCASE_SCENARIOS.find(
    (s) => s.id === 'lidar-geophysics',
  )!.create();
  const c = (await solveMissionDocument(scan)).candidates[0];
  assert.ok(
    describeMissionDelivery(scan, c).jobs.every(
      (j) => j.expectedCaptureEvents === null,
    ),
  );
});

void test('manifest rejects a plan from a different document instead of attaching wrong provenance', async () => {
  const changed = structuredClone(d);
  changed.name = 'Another job';
  await assert.rejects(
    buildMissionDeliveryManifest(changed, (await solved).candidates[0]),
    /разным входным/,
  );
});
