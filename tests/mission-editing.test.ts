import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoMission } from '../lib/planner/mission-demo.ts';
import {
  appendMissionWork,
  removeMissionWorks,
} from '../lib/planner/mission-editing.ts';
import { parseMissionDocument } from '../lib/planner/mission-schema.ts';

test('multi-work addition preserves independent same-type areas, IDs, quality and assignments', () => {
  const d = demoMission(1);
  d.jobs.push({
    ...structuredClone(d.jobs[0]),
    id: 'rgb-second',
    name: 'Второй участок',
    area: demoMission(10).jobs[0].area,
    assignedVehicleIds: [d.scenario.vehicles[0].id],
  });
  const original = structuredClone(d);
  const next = appendMissionWork(d, 'rgb-second', 'MS', 'ms-new');
  assert.deepEqual(d, original);
  assert.deepEqual(next.jobs.slice(0, 2), original.jobs);
  assert.equal(next.jobs[2].job.type, 'MS');
  assert.deepEqual(next.jobs[2].area, d.jobs[1].area);
  assert.notEqual(next.jobs[2].area, d.jobs[1].area);
  assert.deepEqual(next.jobs[2].assignedVehicleIds, []);
  assert.equal(next.jobs[2].quality.status, 'assumed');
});
test('all five types coexist in a schema-valid editable document', () => {
  let d = demoMission(1);
  for (const type of ['MS', 'IR', 'LiDAR', 'Geophysics'] as const)
    d = appendMissionWork(d, d.jobs[0].id, type, `work-${type}`);
  assert.equal(parseMissionDocument(d).jobs.length, 5);
});
test('removing work uses ID, leaves sibling data intact and protects the last work', () => {
  const d = demoMission(1);
  const next = appendMissionWork(d, d.jobs[0].id, 'RGB', 'second');
  assert.deepEqual(removeMissionWorks(next, ['second']), d);
  assert.throws(() => removeMissionWorks(d, [d.jobs[0].id]), /хотя бы одну/);
});
test('work editor rejects duplicate identifiers and ninth work', () => {
  let d = demoMission(1);
  assert.throws(
    () => appendMissionWork(d, d.jobs[0].id, 'MS', d.jobs[0].id),
    /идентификатор/,
  );
  for (let i = 1; i < 8; i++)
    d = appendMissionWork(d, d.jobs[0].id, 'RGB', `copy-${i}`);
  assert.throws(
    () => appendMissionWork(d, d.jobs[0].id, 'MS', 'ninth'),
    /8 работ/,
  );
});
