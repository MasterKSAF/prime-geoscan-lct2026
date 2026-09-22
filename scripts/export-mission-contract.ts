import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { missionDocumentSchema } from '../lib/planner/mission-schema.ts';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { installedBatteryDocument } from '../lib/planner/mission-fleet-state.ts';
import {
  serializeMissionYaml,
  missionSummaryMarkdown,
} from '../lib/planner/mission-io.ts';
const directory = 'docs/planner/contracts';
await mkdir(directory, { recursive: true });
await writeFile(
  `${directory}/mission-v2.schema.json`,
  JSON.stringify(z.toJSONSchema(missionDocumentSchema), null, 2),
);
for (const area of [1, 10, 100] as const) {
  const mission = installedBatteryDocument(demoMission(area));
  await writeFile(
    `${directory}/example-${area}km2.json`,
    JSON.stringify(mission, null, 2),
  );
  await writeFile(
    `${directory}/example-${area}km2.yaml`,
    serializeMissionYaml(mission),
  );
  await writeFile(
    `${directory}/example-${area}km2.md`,
    missionSummaryMarkdown(mission),
  );
}
console.log(`Schema and 1/10/100 km² examples generated in ${directory}.`);
