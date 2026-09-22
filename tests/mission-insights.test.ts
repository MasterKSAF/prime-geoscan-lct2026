import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import {
  explainMissionPlan,
  missionImprovementTrials,
  compareMissionTrial,
} from '../lib/planner/mission-insights.ts';
import {
  missionCoverageViews,
  coverageGeoJSON,
} from '../lib/planner/mission-coverage-view.ts';
import { canonicalStringify } from '../lib/planner/mission-schema.ts';
import type { MissionCandidate } from '../lib/planner/mission-schema.ts';

const document = SHOWCASE_SCENARIOS.find(
  (s) => s.id === 'automatic-tradeoff',
)!.create();
const solved = solveMissionDocument(document);

test('explanations use actual assignments and do not invent optimality reasons', async () => {
  const candidate = (await solved).candidates[0];
  assert.equal(candidate.status, 'feasible_model');
  const rows = explainMissionPlan(document, candidate);
  assert.equal(
    rows.reduce((n, r) => n + r.sortieCount, 0),
    candidate.sorties.length,
  );
  assert.ok(
    Math.abs(
      rows.reduce((n, r) => n + r.flightTimeSec, 0) -
        candidate.metrics.flightTimeSec,
    ) < 1e-6,
  );
  assert.ok(
    rows.every(
      (r) =>
        r.batteryPct ===
        document.scenario.vehicles.find((v) => v.id === r.vehicleId)!
          .batteryPct,
    ),
  );
  assert.ok(!JSON.stringify(rows).includes('оптимальный'));
});

test('fleet trials disable assignment, retain physical occupancy and never mutate source', async () => {
  const candidate = (await solved).candidates[0],
    before = canonicalStringify(document);
  const trials = missionImprovementTrials(document, candidate);
  assert.ok(trials.length > 0 && trials.length <= 3);
  for (const trial of trials) {
    assert.equal(
      trial.document.scenario.vehicles.length,
      document.scenario.vehicles.length,
    );
    assert.deepEqual(
      trial.document.scenario.vehicles.map((v) => v.start),
      document.scenario.vehicles.map((v) => v.start),
    );
    assert.deepEqual(trial.document.jobs, document.jobs);
    assert.equal(
      trial.document.scenario.reservePct,
      document.scenario.reservePct,
    );
    assert.equal(
      trial.document.planning.separationHorizontalM,
      document.planning.separationHorizontalM,
    );
    assert.equal(
      trial.document.scenario.vehicles.filter((v) => !v.enabled).length,
      document.scenario.vehicles.filter((v) => !v.enabled).length + 1,
    );
  }
  assert.equal(canonicalStringify(document), before);
});

test('repair trials preserve task area, weather, forbidden volumes and time restrictions', async () => {
  const input = structuredClone(document);
  input.jobs[0].assignedVehicleIds = [input.scenario.vehicles[0].id];
  const candidate = {
    ...(await solved).candidates[0],
    status: 'not_found',
  } as MissionCandidate;
  const trials = missionImprovementTrials(input, candidate);
  assert.deepEqual(
    trials.map((t) => t.id),
    ['auto-assignment', 'extra-time'],
  );
  assert.equal(trials[0].document.jobs[0].assignedVehicleIds.length, 0);
  assert.equal(
    Date.parse(trials[1].document.window.end) - Date.parse(input.window.end),
    1800000,
  );
  for (const t of trials) {
    assert.deepEqual(
      t.document.jobs.map((j) => j.area),
      input.jobs.map((j) => j.area),
    );
    assert.deepEqual(t.document.restrictions, input.restrictions);
    assert.deepEqual(t.document.scenario.wind, input.scenario.wind);
    assert.deepEqual(t.document.batteries, input.batteries);
  }
});

test('partial or invalid alternatives never receive a claimed time saving', async () => {
  const c = (await solved).candidates[0];
  for (const status of [
    'not_found',
    'partial',
    'invalid',
    'unsupported',
  ] as const) {
    const comparison = compareMissionTrial(c, { ...c, status });
    assert.equal(comparison.comparable, false);
    assert.equal(comparison.makespanDeltaSec, null);
    assert.match(comparison.summary, /не доказательство/);
  }
  assert.equal(
    compareMissionTrial(c, {
      ...c,
      checks: [
        ...c.checks,
        { id: 'X', status: 'fail', title: 'bad', detail: 'bad' },
      ],
    }).feasible,
    false,
  );
});

test('coverage partitions original area and never represents model output as received imagery', async () => {
  const candidate = (await solved).candidates[0],
    views = missionCoverageViews(document, candidate);
  assert.ok(views.every((v) => v.status === 'calculated' && v.coveredM2 > 0));
  for (const view of views)
    assert.ok(
      Math.abs(view.requestedM2 - view.coveredM2 - view.missingM2) < 0.01,
    );
  const exported = coverageGeoJSON(document, views);
  assert.equal(exported.properties.acquiredData, false);
  assert.equal(exported.features.length, document.jobs.length * 2);
  assert.ok(views.some((v) => v.qualityStatus === 'unknown'));
});

test('no survey means original task fully missing, not zero target after exclusions', async () => {
  const candidate = { ...(await solved).candidates[0], sorties: [] };
  const views = missionCoverageViews(document, candidate);
  assert.ok(
    views.every((v) => v.coveredM2 === 0 && v.missingM2 === v.requestedM2),
  );
});

test('coverage quality uses ground speed including tailwind, not the vehicle nominal airspeed', async () => {
  const d = structuredClone(document),
    c = structuredClone((await solved).candidates[0]);
  d.jobs[0].quality.status = 'documented';
  for (const sortie of c.sorties)
    for (const segment of sortie.segments)
      if (segment.phase === 'survey') segment.groundSpeedMps = 100;
  const view = missionCoverageViews(d, c)[0];
  assert.equal(view.qualityStatus, 'fail');
  assert.ok(view.details.some((detail) => /камер|пиксел/.test(detail)));
});

test('coverage keeps holes and bounded complexity does not yield false green', async () => {
  const d = SHOWCASE_SCENARIOS.find((s) => s.id === 'area-with-hole')!.create();
  const result = await solveMissionDocument(d),
    candidate = result.candidates[0];
  const views = missionCoverageViews(d, candidate);
  assert.ok(views[0].requested[0].length > 1);
  const large = structuredClone(candidate),
    first = large.sorties[0].segments[0];
  large.sorties[0].segments = Array.from({ length: 1201 }, () => first);
  const skipped = missionCoverageViews(d, large);
  assert.equal(skipped[0].status, 'not_checked');
  assert.equal(coverageGeoJSON(d, skipped).features[0].geometry, null);
});
