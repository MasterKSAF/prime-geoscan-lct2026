import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createObstacleDemo } from '../lib/planner/obstacle-demo.ts';
const source = await readFile(
  'docs/planner/expert-materials/2026-09-22/originals/primorsky-obstacles.kml',
  'utf8',
);
await mkdir('public/planner/scenarios', { recursive: true });
await writeFile(
  'public/planner/scenarios/demo-02-expert-obstacles.mission.json',
  JSON.stringify(createObstacleDemo(source)) + '\n',
);
console.log(
  'Generated demo-02-expert-obstacles.mission.json; original KML unchanged.',
);
