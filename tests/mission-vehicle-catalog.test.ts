import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoScenario } from '../lib/planner/demo.ts';
import { demoMission } from '../lib/planner/mission-demo.ts';
import {
  addMissionVehicle,
  serializeMissionFleet,
  parseFleetText,
} from '../lib/planner/mission-fleet.ts';
import {
  MISSION_VEHICLE_CATALOG,
  createCatalogueVehicleProfile,
} from '../lib/planner/mission-vehicle-catalog.ts';
import { vehiclePlanningEligibility } from '../lib/planner/fixed-wing-profile.ts';
import { installedBatteryDocument } from '../lib/planner/mission-fleet-state.ts';
import { parseMissionDocument } from '../lib/planner/mission-schema.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { validateExportedCandidate } from '../lib/planner/mission-validation.ts';
import { fixedWingFixture } from './fixtures/fixed-wing.ts';

void test('catalogue exposes exactly the three manufacturer models from the task with original primary sources', () => {
  assert.deepEqual(
    MISSION_VEHICLE_CATALOG.map((item) => item.model),
    ['Gemini', '801', '201'],
  );
  for (const entry of MISSION_VEHICLE_CATALOG) {
    assert.match(entry.source, /^https:\/\/download\.geoscan\.ru\//);
    assert.ok(entry.configurations.length > 0);
    for (const config of entry.configurations) {
      const profile = createCatalogueVehicleProfile(entry.model, config.id);
      assert.equal(profile.enabled, true);
      assert.ok(profile.effectiveEnduranceMin < entry.passport.maxFlightMin);
      assert.ok(profile.airspeedMps <= entry.passport.maxSpeedMps);
      assert.deepEqual(profile.jobs, config.jobs);
      assert.ok(
        !profile.jobs.includes('LiDAR') && !profile.jobs.includes('Geophysics'),
      );
      assert.match(profile.assumptions.join(' '), /не измеренная|допущения/);
    }
  }
});

void test('catalogue 801 has documented visible and thermal cameras, not fictitious multispectral capability', () => {
  assert.deepEqual(createCatalogueVehicleProfile('801').jobs, ['RGB', 'IR']);
  assert.throws(
    () => createCatalogueVehicleProfile('801', 'ms'),
    /Неизвестная комплектация/,
  );
  for (const model of ['Gemini', '201'] as const) {
    assert.deepEqual(createCatalogueVehicleProfile(model, 'rgb').jobs, ['RGB']);
    assert.deepEqual(createCatalogueVehicleProfile(model, 'ms').jobs, ['MS']);
  }
});

void test('adding a model creates one explicit current battery, keeps mission bases, and does not modify existing data', () => {
  const d = installedBatteryDocument(demoMission(1));
  const before = structuredClone(d);
  for (const model of ['Gemini', '801', '201'] as const) {
    const added = addMissionVehicle(d, model);
    const v = added.scenario.vehicles.at(-1)!;
    const own = added.batteries.filter((b) => b.vehicleId === v.id);
    assert.equal(v.model, model);
    assert.equal(vehiclePlanningEligibility(v).supported, true);
    assert.equal(own.length, 1);
    assert.equal(own[0].initialPct, v.batteryPct);
    assert.equal(own[0].rechargeSec, null);
    assert.deepEqual(v.start, d.scenario.vehicles[0].start);
    assert.deepEqual(v.landing, d.scenario.vehicles[0].landing);
    assert.notEqual(v.start, d.scenario.vehicles[0].start);
    assert.deepEqual(added.jobs, d.jobs);
    assert.deepEqual(parseMissionDocument(added), added);
    assert.deepEqual(
      parseFleetText(serializeMissionFleet(added)).vehicles,
      added.scenario.vehicles,
    );
  }
  assert.deepEqual(d, before);
});

void test('new 201 receives a complete independent model without changing legacy demo or imported aircraft', () => {
  const legacy = demoScenario();
  const originalWing = legacy.vehicles.find(
    (vehicle) => vehicle.model === '201',
  )!;
  assert.equal(originalWing.fixedWingProfile, undefined);
  const first = addMissionVehicle(demoMission(1), '201');
  const second = addMissionVehicle(first, '201');
  const wings = second.scenario.vehicles.filter(
    (vehicle) => vehicle.model === '201',
  );
  assert.notEqual(wings[0].id, wings[1].id);
  assert.ok(
    wings.every(
      (wing) =>
        wing.fixedWingProfile && vehiclePlanningEligibility(wing).supported,
    ),
  );
  assert.ok(
    wings.every(
      (wing) =>
        !wing.assumptions.some((item) => /не реализован|Отключён/.test(item)),
    ),
  );
  assert.notEqual(wings[0].fixedWingProfile, wings[1].fixedWingProfile);
  wings[1].fixedWingProfile!.minimumTurnRadiusM = 333;
  assert.notEqual(wings[0].fixedWingProfile!.minimumTurnRadiusM, 333);
  assert.deepEqual(demoScenario(), legacy);
});

for (const [model, configuration, work] of [
  ['Gemini', 'rgb', 'RGB'],
  ['Gemini', 'ms', 'MS'],
  ['801', 'rgb-ir', 'RGB'],
  ['801', 'rgb-ir', 'IR'],
  ['201', 'rgb', 'RGB'],
  ['201', 'ms', 'MS'],
] as const) {
  void test(`catalogue ${model}/${configuration}/${work} schedules and independently replays a suitable model mission`, async () => {
    const { d } = fixedWingFixture(2);
    const added = addMissionVehicle(d, model, configuration);
    const v = added.scenario.vehicles.at(-1)!;
    // Use a documented synthetic test site with a large free airspace. This is
    // a movement/scheduling test, not a calibration of any camera or battery.
    added.scenario.vehicles = [v];
    added.batteries = added.batteries.filter(
      (battery) => battery.vehicleId === v.id,
    );
    added.jobs[0].job.type = work;
    added.scenario.job = added.jobs[0].job;
    added.planning.maxComputeMs = 6000;
    const input = installedBatteryDocument(parseMissionDocument(added));
    const result = await solveMissionDocument(input);
    const candidate = result.candidates.find(
      (item) => item.status === 'feasible_model',
    );
    assert.ok(
      candidate,
      JSON.stringify(
        result.candidates.map((item) => ({
          status: item.status,
          failed: item.checks.filter((check) => check.status === 'fail'),
        })),
      ),
    );
    assert.ok(candidate.sorties.every((sortie) => sortie.vehicleId === v.id));
    const checks = await validateExportedCandidate(input, candidate);
    assert.deepEqual(
      checks.filter((check) => check.status === 'fail'),
      [],
    );
    assert.ok(
      checks.some((check) => check.status === 'unknown'),
      'model caveats remain visible',
    );
  });
}
