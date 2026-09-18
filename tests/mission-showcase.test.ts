import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { validateExportedCandidate } from '../lib/planner/mission-validation.ts';
import { canonicalStringify } from '../lib/planner/mission-schema.ts';
import {
  importGeometryText,
  parseMissionText,
} from '../lib/planner/mission-io.ts';
import { parseRestrictionLayer } from '../lib/planner/mission-layers.ts';
import { parseFleetText } from '../lib/planner/mission-fleet.ts';
import { sameMissionPlan } from '../lib/planner/mission-comparison.ts';

void test('showcase covers all five jobs and factories return independent documents', () => {
  assert.equal(SHOWCASE_SCENARIOS.length, 9);
  assert.equal(new Set(SHOWCASE_SCENARIOS.map((s) => s.id)).size, 9);
  const types = new Set(
    SHOWCASE_SCENARIOS.flatMap((s) => s.create().jobs.map((j) => j.job.type)),
  );
  assert.deepEqual([...types].sort(), [
    'Geophysics',
    'IR',
    'LiDAR',
    'MS',
    'RGB',
  ]);
  for (const s of SHOWCASE_SCENARIOS) {
    const d = s.create();
    d.jobs[0].name = 'changed';
    assert.notEqual(s.create().jobs[0].name, 'changed');
  }
});

for (const scenario of SHOWCASE_SCENARIOS) {
  void test(`showcase ${scenario.id}: actual solver and exported validator match its declared expectation`, async () => {
    const document = scenario.create(),
      result = await solveMissionDocument(document);
    assert.deepEqual(
      result.candidates.map((c) => c.objective),
      ['makespan', 'flightTime'],
    );
    for (const c of result.candidates) {
      if (scenario.expected === 'rejected') {
        assert.notEqual(c.status, 'feasible_model');
        assert.ok(c.checks.some((check) => check.status === 'fail'));
        continue;
      }
      assert.equal(c.status, 'feasible_model', scenario.id);
      const checks = await validateExportedCandidate(document, c);
      assert.deepEqual(
        checks.filter((check) => check.status === 'fail'),
        [],
      );
      for (const id of scenario.checks)
        assert.equal(
          checks.find((check) => check.id === id)?.status,
          'pass',
          id,
        );
      assert.ok(c.metrics.minimumRemainingPct >= document.scenario.reservePct);
      assert.equal(
        c.metrics.makespanSec,
        Math.max(...c.sorties.map((s) => s.endSec)),
      );
      assert.equal(
        c.metrics.flightTimeSec,
        c.sorties.reduce((sum, s) => sum + s.durationSec, 0),
      );
      if (scenario.id === 'mixed-fleet') {
        assert.equal(c.metrics.vehicleCount, 3);
        assert.ok(new Set(c.sorties.map((s) => s.startSec)).size > 1);
        assert.ok(
          c.sorties
            .filter((s) => s.vehicleId === 'ir-1')
            .every((s) => s.startSec >= 240),
        );
      }
      if (scenario.id === 'repeat-sorties') {
        assert.ok(c.sorties.length >= 2);
        assert.equal(c.metrics.vehicleCount, 1);
        assert.ok(c.metrics.batteryChanges >= 1);
        for (let i = 1; i < c.sorties.length; i++)
          assert.ok(c.sorties[i].startSec >= c.sorties[i - 1].readySec);
      }
      if (scenario.id === 'timed-airspace')
        assert.ok(c.sorties.every((s) => s.startSec >= 900));
      if (scenario.id === 'area-with-hole')
        assert.equal(document.jobs[0].area.coordinates.length, 2);
    }
    if (scenario.expected === 'feasible_model') {
      assert.ok(result.recommendation);
      assert.deepEqual(
        (
          await validateExportedCandidate(
            document,
            result.recommendation.candidate,
          )
        ).filter((check) => check.status === 'fail'),
        [],
      );
    }
    if (scenario.id === 'automatic-tradeoff') {
      const [fast, economical] = result.candidates,
        balanced = result.recommendation!.candidate;
      assert.ok(
        document.jobs.every((job) => job.assignedVehicleIds.length === 0),
      );
      assert.ok(fast.metrics.makespanSec < balanced.metrics.makespanSec);
      assert.ok(balanced.metrics.makespanSec < economical.metrics.makespanSec);
      assert.ok(
        economical.metrics.flightTimeSec < balanced.metrics.flightTimeSec,
      );
      assert.ok(balanced.metrics.flightTimeSec < fast.metrics.flightTimeSec);
      assert.equal(sameMissionPlan(fast, economical), false);
      assert.equal(sameMissionPlan(fast, balanced), false);
      assert.equal(sameMissionPlan(economical, balanced), false);
      assert.deepEqual(result.recommendation!.samePlanAs, []);
      assert.equal(result.recommendation!.resourceProxy, 'flightTimeSec');
    }
  });
  void test(`showcase ${scenario.id}: downloadable mission matches the UI factory`, async () => {
    const text = await readFile(
      new URL(
        `../public/planner/scenarios/${scenario.id}.mission.json`,
        import.meta.url,
      ),
      'utf8',
    );
    assert.equal(
      canonicalStringify(parseMissionText(text, 'json')),
      canonicalStringify(scenario.create()),
    );
    const document = scenario.create(),
      [areaText, restrictionText, fleetText] = await Promise.all(
        ['area.geojson', 'restrictions.json', 'fleet.json'].map((suffix) =>
          readFile(
            new URL(
              `../public/planner/scenarios/${scenario.id}.${suffix}`,
              import.meta.url,
            ),
            'utf8',
          ),
        ),
      ),
      area = importGeometryText(areaText, 'geojson', 'area'),
      restrictions = parseRestrictionLayer(restrictionText),
      fleet = parseFleetText(fleetText);
    assert.deepEqual(
      area.features.map((feature) => feature.geometry),
      document.jobs.map((job) => job.area),
    );
    assert.deepEqual(
      area.features.map((feature) => feature.sourceId),
      document.jobs.map((job) => job.id),
    );
    assert.ok(
      JSON.parse(areaText).features.every(
        (feature: { properties: { source: string } }) =>
          feature.properties.source.includes('Синтетическая'),
      ),
    );
    assert.deepEqual(restrictions.restrictions, document.restrictions);
    assert.deepEqual(fleet.vehicles, document.scenario.vehicles);
    assert.deepEqual(fleet.batteries, document.batteries);
  });
}
