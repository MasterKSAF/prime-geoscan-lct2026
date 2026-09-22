import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEMONSTRATION_SCENARIOS,
  SHOWCASE_SCENARIOS,
} from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { canonicalStringify } from '../lib/planner/mission-schema.ts';
import {
  compileRestrictions,
  segmentIntersectsVolume,
  sortiesConflict,
  validateExportedCandidate,
} from '../lib/planner/mission-validation.ts';
import { projection } from '../lib/planner/geometry.ts';
import {
  missionImprovementTrials,
  compareMissionTrial,
} from '../lib/planner/mission-insights.ts';
import { createDemoQuality } from '../lib/planner/quality.ts';
import {
  importGeometryText,
  parseMissionText,
} from '../lib/planner/mission-io.ts';
import { parseRestrictionLayer } from '../lib/planner/mission-layers.ts';
import { parseFleetText } from '../lib/planner/mission-fleet.ts';

const solved = DEMONSTRATION_SCENARIOS.map((s) =>
  solveMissionDocument(s.create()),
);

void test('three demo stories preserve the nine legacy acceptance examples', () => {
  assert.equal(DEMONSTRATION_SCENARIOS.length, 3);
  assert.equal(SHOWCASE_SCENARIOS.length, 9);
  assert.deepEqual(
    DEMONSTRATION_SCENARIOS.map((s) => s.expected),
    ['feasible_model', 'feasible_model', 'rejected'],
  );
  assert.ok(DEMONSTRATION_SCENARIOS.every((s) => s.walkthrough?.length === 5));
});

for (const [index, scenario] of DEMONSTRATION_SCENARIOS.entries()) {
  void test(`${scenario.id}: solver and exported validator agree with the declared story`, async () => {
    const d = scenario.create(),
      result = await solved[index];
    for (const candidate of result.candidates) {
      if (scenario.expected === 'rejected') {
        assert.notEqual(candidate.status, 'feasible_model');
        assert.ok(candidate.checks.some((c) => c.status === 'fail'));
      } else {
        assert.equal(candidate.status, 'feasible_model');
        assert.ok(candidate.metrics.grossCoveragePct >= 99.99);
        assert.ok(
          candidate.metrics.minimumRemainingPct >= d.scenario.reservePct,
        );
        assert.deepEqual(
          (await validateExportedCandidate(d, candidate)).filter(
            (c) => c.status === 'fail',
          ),
          [],
        );
      }
    }
    if (index === 0) assert.ok(result.candidates[0].metrics.vehicleCount >= 2);
  });
  void test(`${scenario.id}: all four downloadable files round-trip without lost geometry or vehicles`, async () => {
    const d = scenario.create();
    const read = (suffix: string) =>
      readFile(
        new URL(
          `../public/planner/scenarios/${scenario.id}.${suffix}`,
          import.meta.url,
        ),
        'utf8',
      );
    assert.equal(
      canonicalStringify(parseMissionText(await read('mission.json'), 'json')),
      canonicalStringify(d),
    );
    assert.deepEqual(
      importGeometryText(
        await read('area.geojson'),
        'geojson',
        'area',
      ).features.map((f) => f.geometry),
      d.jobs.map((j) => j.area),
    );
    assert.deepEqual(
      parseRestrictionLayer(await read('restrictions.json')).restrictions,
      d.restrictions,
    );
    const fleet = parseFleetText(await read('fleet.json'));
    assert.deepEqual(fleet.vehicles, d.scenario.vehicles);
    assert.deepEqual(fleet.batteries, d.batteries);
  });
}

void test('demo 2 genuinely needs time separation: removing the delay causes a conflict', async () => {
  const d = DEMONSTRATION_SCENARIOS[1].create();
  for (const c of (await solved[1]).candidates) {
    assert.equal(c.sorties.length, 2);
    const [a, originalB] = c.sorties,
      b = structuredClone(originalB);
    assert.equal(sortiesConflict(d, a, b), false);
    assert.ok(b.startSec > a.startSec);
    const delta = b.startSec - a.startSec;
    b.startSec -= delta;
    b.endSec -= delta;
    b.readySec -= delta;
    for (const segment of b.segments) {
      segment.startSec -= delta;
      segment.endSec -= delta;
    }
    assert.equal(sortiesConflict(d, a, b), true);
    // At 100 m it cannot overfly the 160 m building: real detour points exist.
    assert.ok(
      c.sorties.every(
        (s) => s.segments.filter((p) => p.phase === 'transit').length >= 3,
      ),
    );
    assert.ok(
      c.sorties.every((s) =>
        s.segments.every((p) => Math.max(p.altitudeFromM, p.altitudeToM) < 160),
      ),
    );
    const g = projection(d.scenario.area.coordinates[0][0]),
      volume = compileRestrictions(d, g)[0];
    for (const s of c.sorties) {
      const firstTransit = s.segments.find(
        (segment) => segment.phase === 'transit',
      )!;
      const firstSurvey = s.segments.find(
        (segment) => segment.phase === 'survey',
      )!;
      assert.equal(
        segmentIntersectsVolume(
          {
            ...firstTransit,
            to: firstSurvey.from,
            endSec: firstSurvey.startSec,
          },
          volume,
          g.forward,
        ),
        true,
        'direct approach would cross the forbidden building',
      );
      assert.ok(
        s.segments.every(
          (segment) => !segmentIntersectsVolume(segment, volume, g.forward),
        ),
        'actual route clears the complete closed volume including safety margin',
      );
    }
  }
});

void test('demo 3 named battery replacement solves full work; waiting/assignment do not invent charge', async () => {
  const d = DEMONSTRATION_SCENARIOS[2].create(),
    before = canonicalStringify(d),
    candidate = (await solved[2]).candidates[0];
  const trials = missionImprovementTrials(d, candidate);
  assert.deepEqual(
    trials.map((t) => t.id),
    ['battery-full-demo-07', 'auto-assignment', 'extra-time'],
  );
  for (const trial of trials) {
    const alternative = (await solveMissionDocument(trial.document))
      .candidates[0];
    const comparison = compareMissionTrial(candidate, alternative);
    assert.equal(comparison.feasible, trial.id === 'battery-full-demo-07');
    assert.equal(comparison.comparable, false);
    assert.equal(trial.document.batteries.length, 1);
    assert.deepEqual(
      trial.document.jobs.map((j) => j.area),
      d.jobs.map((j) => j.area),
    );
    assert.equal(trial.document.scenario.reservePct, d.scenario.reservePct);
    assert.equal(
      trial.document.planning.separationHorizontalM,
      d.planning.separationHorizontalM,
    );
    if (trial.id.startsWith('battery')) {
      assert.equal(trial.document.scenario.vehicles[0].batteryPct, 100);
      assert.equal(trial.document.batteries[0].initialPct, 100);
      assert.equal(trial.document.batteries[0].readyAt, d.batteries[0].readyAt);
      assert.match(trial.document.notes, /ГИПОТЕЗА/);
      assert.ok(trial.confirmation?.length);
    } else assert.equal(trial.document.scenario.vehicles[0].batteryPct, 26);
  }
  assert.equal(canonicalStringify(d), before);
});

void test('camera suggestion is a catalogued replacement, not an arbitrary extra capability', async () => {
  const d = DEMONSTRATION_SCENARIOS[2].create(),
    candidate = (await solved[2]).candidates[0];
  d.scenario.vehicles[0].batteryPct = 100;
  d.batteries[0].initialPct = 100;
  d.jobs[0].job.type = 'MS';
  d.jobs[0].quality = createDemoQuality('MS');
  const trial = missionImprovementTrials(d, candidate).find((t) =>
    t.id.startsWith('payload-'),
  );
  assert.ok(trial);
  assert.match(trial.title, /Pollux/);
  assert.deepEqual(trial.document.scenario.vehicles[0].jobs, ['MS']);
  assert.equal(
    trial.document.jobs[0].quality.maximumGsdCm,
    d.jobs[0].quality.maximumGsdCm,
  );
  assert.equal(
    trial.document.jobs[0].quality.forwardOverlap,
    d.jobs[0].quality.forwardOverlap,
  );
  assert.equal(trial.document.jobs[0].quality.status, 'assumed');
  assert.equal(
    (await solveMissionDocument(trial.document)).candidates[0].status,
    'feasible_model',
  );
  d.scenario.vehicles[0].model = 'Custom';
  assert.ok(
    !missionImprovementTrials(d, candidate).some((t) =>
      t.id.startsWith('payload-'),
    ),
  );
});

void test('wind suggestion is conditional and never raises a vehicle wind limit', async () => {
  const d = DEMONSTRATION_SCENARIOS[2].create(),
    candidate = (await solved[2]).candidates[0];
  d.scenario.wind.speedMps = 15;
  const trial = missionImprovementTrials(d, candidate).find(
    (t) => t.id === 'calmer-weather',
  );
  assert.ok(trial);
  assert.match(trial.change, /не прогноз/);
  assert.match(trial.document.notes, /УСЛОВНАЯ ПОГОДА/);
  assert.equal(
    trial.document.scenario.vehicles[0].maxWindMps,
    d.scenario.vehicles[0].maxWindMps,
  );
  assert.deepEqual(trial.document.window, d.window);
  assert.equal(trial.document.scenario.wind.fromDeg, d.scenario.wind.fromDeg);
});
