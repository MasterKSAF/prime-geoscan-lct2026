import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { parseMissionDocument } from '../lib/planner/mission-schema.ts';
import {
  canonicalMissionJson,
  parseMissionText,
  serializeMissionJson,
} from '../lib/planner/mission-io.ts';
import {
  addMissionBattery,
  addMissionVehicle,
  importMissionFleet,
  MAX_FLEET_FILE_BYTES,
  parseFleetText,
  removeMissionVehicle,
  serializeMissionFleet,
} from '../lib/planner/mission-fleet.ts';
import type { MissionFleet } from '../lib/planner/mission-fleet.ts';

function incoming(): MissionFleet {
  const document = demoMission(1);
  return {
    type: 'prime-fleet',
    schemaVersion: '1.0',
    vehicles: [{ ...document.scenario.vehicles[0], id: 'new-vehicle' }],
    batteries: [
      { ...document.batteries[0], id: 'new-battery', vehicleId: 'new-vehicle' },
    ],
  };
}

function largeFleet(sourceLength: number): MissionFleet {
  const document = demoMission(1);
  return {
    type: 'prime-fleet',
    schemaVersion: '1.0',
    vehicles: Array.from({ length: 8 }, (_, index) => ({
      ...document.scenario.vehicles[0],
      id: `big-v-${index}`,
      assumptions: Array<string>(10).fill('界'.repeat(400)),
    })),
    batteries: Array.from({ length: 80 }, (_, index) => ({
      ...document.batteries[0],
      id: `big-b-${index}`,
      vehicleId: 'big-v-0',
      name: '界'.repeat(100),
      source: '界'.repeat(sourceLength),
    })),
  };
}
const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;

void test('fleet export falls back to compact JSON when formatting would exceed the import limit', () => {
  const original = demoMission(1);
  const fleet = largeFleet(250);
  const document = {
    ...original,
    scenario: { ...original.scenario, vehicles: fleet.vehicles },
    batteries: fleet.batteries,
  };
  assert.ok(utf8Bytes(canonicalMissionJson(document)) <= MAX_FLEET_FILE_BYTES);
  assert.ok(utf8Bytes(JSON.stringify(fleet, null, 2)) > MAX_FLEET_FILE_BYTES);
  const exported = serializeMissionFleet(document);
  assert.ok(utf8Bytes(exported) <= MAX_FLEET_FILE_BYTES);
  assert.deepEqual(parseFleetText(exported), fleet);
  const oversized = largeFleet(330);
  assert.throws(
    () =>
      serializeMissionFleet({
        ...document,
        scenario: { ...document.scenario, vehicles: oversized.vehicles },
        batteries: oversized.batteries,
      }),
    /200 КиБ/,
  );
});

void test('import validates the complete normalized mission and its compact save size before returning', () => {
  const original = demoMission(1);
  const before = structuredClone(original);
  const fitting = parseFleetText(JSON.stringify(largeFleet(250)));
  const accepted = importMissionFleet(original, fitting);
  assert.ok(utf8Bytes(canonicalMissionJson(accepted)) <= MAX_FLEET_FILE_BYTES);
  assert.ok(
    utf8Bytes(JSON.stringify(accepted, null, 2)) > MAX_FLEET_FILE_BYTES,
  );
  assert.deepEqual(
    parseMissionText(serializeMissionJson(accepted), 'json'),
    accepted,
  );
  const tooLarge = parseFleetText(JSON.stringify(largeFleet(275)));
  assert.ok(utf8Bytes(JSON.stringify(tooLarge)) <= MAX_FLEET_FILE_BYTES);
  assert.throws(() => importMissionFleet(original, tooLarge), /200 КиБ/);
  assert.deepEqual(original, before);
});

void test('import rejects invalid existing mission data without changing either input', () => {
  const document = demoMission(1);
  document.window.end = document.window.start;
  const fleet = incoming();
  const before = structuredClone({ document, fleet });
  assert.throws(() => importMissionFleet(document, fleet), /Окно миссии/);
  assert.deepEqual({ document, fleet }, before);
  const badAssignment = demoMission(1);
  badAssignment.jobs[0].assignedVehicleIds = ['missing'];
  assert.throws(
    () => importMissionFleet(badAssignment, fleet),
    /неизвестный назначенный БВС/,
  );
});

void test('fleet JSON round trips complete profiles, coordinates and battery metadata', () => {
  const document = addMissionVehicle(demoMission(1), '201');
  document.batteries[0].cycles = 42;
  document.batteries[0].commissionedAt = '2026-01-03';
  document.batteries[0].rechargeSec = 900;
  const fleet = parseFleetText(serializeMissionFleet(document));
  assert.deepEqual(fleet.vehicles, document.scenario.vehicles);
  assert.deepEqual(fleet.batteries, document.batteries);
  assert.equal(fleet.vehicles.at(-1)?.kind, 'fixedWing');
  assert.deepEqual(Object.keys(fleet).sort(), [
    'batteries',
    'schemaVersion',
    'type',
    'vehicles',
  ]);
});

void test('custom profiles have distinct IDs, explicit assumptions and a battery instance', () => {
  const original = demoMission(1);
  const before = structuredClone(original);
  const first = addMissionVehicle(original, 'Custom');
  const second = addMissionVehicle(first, 'Custom');
  const custom = second.scenario.vehicles.filter((v) => v.model === 'Custom');
  assert.equal(custom.length, 2);
  assert.notEqual(custom[0].id, custom[1].id);
  assert.match(custom[0].source, /оператора/);
  assert.match(custom[0].assumptions.join(' '), /допущения/);
  assert.deepEqual(custom[0].start, original.scenario.vehicles[0].start);
  assert.notEqual(custom[0].start, original.scenario.vehicles[0].start);
  assert.equal(second.batteries.length, original.batteries.length + 2);
  assert.deepEqual(original, before);
  assert.deepEqual(parseMissionDocument(second), second);
});

void test('deleting a vehicle removes its batteries and every assignment atomically', () => {
  const original = demoMission(1);
  const first = original.scenario.vehicles[0].id;
  const second = original.scenario.vehicles[1].id;
  original.jobs[0].assignedVehicleIds = [first, second];
  original.jobs.push({
    ...structuredClone(original.jobs[0]),
    id: 'second-job',
    assignedVehicleIds: [first],
  });
  const before = structuredClone(original);
  const result = removeMissionVehicle(original, first);
  assert.deepEqual(result.scenario.vehicles, [original.scenario.vehicles[1]]);
  assert.ok(result.batteries.every((b) => b.vehicleId === second));
  assert.deepEqual(
    result.jobs.map((j) => j.assignedVehicleIds),
    [[second], []],
  );
  assert.deepEqual(original, before);
  assert.deepEqual(parseMissionDocument(result), result);
  assert.throws(() => removeMissionVehicle(result, second), /хотя бы один БВС/);
  assert.throws(() => removeMissionVehicle(original, 'missing'), /не найден/);
  const soleBattery = { ...original, batteries: [original.batteries[0]] };
  assert.throws(
    () => removeMissionVehicle(soleBattery, first),
    /хотя бы одна батарея/,
  );
});

void test('import appends the validated bundle and preserves mission work, assignments and bases', () => {
  const original = demoMission(1);
  original.jobs[0].assignedVehicleIds = [original.scenario.vehicles[0].id];
  const before = structuredClone(original);
  const fleet = incoming();
  fleet.vehicles[0].start = [30.5, 60.1];
  const result = importMissionFleet(original, fleet);
  assert.equal(result.scenario.vehicles.length, 3);
  assert.deepEqual(result.scenario.vehicles.at(-1), fleet.vehicles[0]);
  assert.deepEqual(result.batteries.at(-1), fleet.batteries[0]);
  assert.deepEqual(result.jobs, original.jobs);
  assert.deepEqual(original, before);
  assert.deepEqual(parseMissionDocument(result), result);
});

void test('import rejects either type of ID collision without mutating input', () => {
  const original = demoMission(1);
  const before = structuredClone(original);
  const duplicateVehicle = incoming();
  duplicateVehicle.vehicles[0].id = original.scenario.vehicles[0].id;
  duplicateVehicle.batteries[0].vehicleId = duplicateVehicle.vehicles[0].id;
  assert.throws(
    () => importMissionFleet(original, duplicateVehicle),
    /БВС с ID/,
  );
  const duplicateBattery = incoming();
  duplicateBattery.batteries[0].id = original.batteries[0].id;
  assert.throws(
    () => importMissionFleet(original, duplicateBattery),
    /АКБ с ID/,
  );
  assert.deepEqual(original, before);
});

void test('vehicle and battery caps reject additions and whole imports', () => {
  let vehicles = demoMission(1);
  while (vehicles.scenario.vehicles.length < 20)
    vehicles = addMissionVehicle(vehicles, 'Custom');
  assert.throws(() => addMissionVehicle(vehicles, 'Custom'), /20 БВС/);
  assert.throws(() => importMissionFleet(vehicles, incoming()), /20 БВС/);
  let batteries = demoMission(1);
  while (batteries.batteries.length < 100)
    batteries = addMissionBattery(batteries, batteries.scenario.vehicles[0].id);
  assert.throws(
    () => addMissionBattery(batteries, batteries.scenario.vehicles[0].id),
    /100 АКБ/,
  );
  assert.throws(() => addMissionVehicle(batteries, 'Custom'), /100 АКБ/);
  assert.throws(() => importMissionFleet(batteries, incoming()), /100 АКБ/);
  assert.equal(batteries.scenario.vehicles.length, 2);
});

void test('fleet parsing rejects duplicate keys, unsafe trees and oversized UTF-8 JSON', () => {
  const json = JSON.stringify(incoming());
  assert.throws(
    () =>
      parseFleetText(
        json.replace(
          '"type":"prime-fleet"',
          '"type":"prime-fleet","type":"prime-fleet"',
        ),
      ),
    /JSON/,
  );
  assert.throws(
    () => parseFleetText(json.replace('"type":', '"__proto__":{},"type":')),
    /запрещён/,
  );
  assert.throws(
    () => parseFleetText(json.replace('"type":', '"constructor":{},"type":')),
    /запрещён/,
  );
  assert.throws(
    () =>
      parseFleetText(json.replace('"airspeedMps":9', '"airspeedMps":1e999')),
    /конечными/,
  );
  assert.throws(
    () => parseFleetText(`{"payload":"${'я'.repeat(102400)}"}`),
    /200 КиБ/,
  );
  assert.throws(() => parseFleetText('type: prime-fleet'), /Некорректный JSON/);
});

void test('fleet parsing rejects bad references, duplicates, unknown fields and disguised 201', () => {
  const check = (mutate: (fleet: MissionFleet) => void) => {
    const fleet = incoming();
    mutate(fleet);
    assert.throws(() => parseFleetText(JSON.stringify(fleet)));
  };
  check((f) => {
    f.batteries[0].vehicleId = 'missing';
  });
  check((f) => {
    f.vehicles.push(structuredClone(f.vehicles[0]));
  });
  check((f) => {
    f.batteries.push(structuredClone(f.batteries[0]));
  });
  check((f) => {
    f.vehicles[0].jobs = ['RGB', 'RGB'];
  });
  check((f) => {
    f.vehicles[0].model = '201';
    f.vehicles[0].kind = 'multirotor';
  });
  check((f) => {
    f.vehicles[0].airspeedMps = 50;
  });
  check((f) => {
    Object.assign(f, { assignments: [] });
  });
  check((f) => {
    Object.assign(f.vehicles[0], { certified: true });
  });
  const profilesOnly = incoming();
  profilesOnly.batteries = [];
  assert.equal(
    parseFleetText(JSON.stringify(profilesOnly)).batteries.length,
    0,
  );
});
