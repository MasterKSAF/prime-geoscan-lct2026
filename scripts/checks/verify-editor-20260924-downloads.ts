import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  canonicalMissionJson,
  parseMissionText,
  parseSizedMissionDocument,
  serializeMissionJson,
} from '../../lib/planner/mission-io.ts';

const prefix = process.argv[2] ?? 'editor-20260924-prod';
assert.match(prefix, /^editor-20260924-(dev|prod)$/);
const edited = parseMissionText(await readFile(`output/playwright/${prefix}-edited.mission.json`, 'utf8'));
assert.equal(edited.name, 'Проверка JSON · текущие изменения');
assert.equal(edited.scenario.name, edited.name);
assert.equal(edited.id, 'demo-01-survey');
assert.ok(edited.jobs.length && edited.scenario.vehicles.length && edited.window && edited.planning);
const obstacles = parseMissionText(await readFile(`output/playwright/${prefix}-obstacles.mission.json`, 'utf8'));
const original = parseSizedMissionDocument(JSON.parse(await readFile('public/planner/scenarios/demo-02-expert-obstacles.mission.json', 'utf8')));
assert.equal(obstacles.id, original.id);
assert.deepEqual(obstacles.obstacleLayer, original.obstacleLayer);
assert.deepEqual(obstacles.catalogLayers, original.catalogLayers);
for (const document of [edited, obstacles]) {
  assert.equal(canonicalMissionJson(parseMissionText(serializeMissionJson(document))), canonicalMissionJson(document));
}
console.log(JSON.stringify({
  status: 'pass',
  prefix,
  editedMission: { id: edited.id, name: edited.name, works: edited.jobs.length, vehicles: edited.scenario.vehicles.length },
  obstacleMission: { id: obstacles.id, works: obstacles.jobs.length, vehicles: obstacles.scenario.vehicles.length, originalLayersPreserved: true },
  reimport: 'Both JSON files accepted by the actual import parser; canonical data unchanged.',
}, null, 2));
