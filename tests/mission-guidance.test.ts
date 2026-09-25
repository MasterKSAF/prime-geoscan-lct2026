import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeMissionWind,
  missionFleetHints,
} from '../lib/planner/mission-guidance.ts';
import { demoMission } from '../lib/planner/mission-demo.ts';

void test('wind direction distinguishes FROM meteorological bearing and TO arrow', () => {
  const west = describeMissionWind(2, 270);
  assert.equal(west.from, 'с запада');
  assert.equal(west.to, 'на восток');
  assert.equal(west.toDeg, 90);
  assert.equal(describeMissionWind(2, 0).toDeg, 180);
  assert.equal(describeMissionWind(0, 270).calm, true);
  assert.match(describeMissionWind(NaN, 0).text, /Проверьте/);
});
void test('fleet hints are capability checks and retain explicit unsupported/wind/readiness causes', () => {
  const d = demoMission(1),
    id = d.jobs[0].id;
  assert.ok(missionFleetHints(d, id).every((v) => v.eligible));
  d.scenario.vehicles[0].enabled = false;
  assert.match(missionFleetHints(d, id)[0].reasons.join(), /Исключён/);
  d.scenario.vehicles[0].kind = 'fixedWing';
  d.scenario.wind.speedMps = 30;
  d.batteries.forEach((b) => {
    b.readyAt = d.window.end;
  });
  const reasons = missionFleetHints(d, id)[0].reasons.join();
  assert.match(reasons, /Самолётная/);
  assert.match(reasons, /Ветер/);
  assert.match(reasons, /после окна/);
  assert.deepEqual(missionFleetHints(d, 'missing'), []);
});
