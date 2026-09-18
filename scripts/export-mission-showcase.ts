import { mkdir, writeFile } from 'node:fs/promises';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { serializeMissionJson } from '../lib/planner/mission-io.ts';
import { serializeRestrictionLayer } from '../lib/planner/mission-layers.ts';
import { serializeMissionFleet } from '../lib/planner/mission-fleet.ts';

const directory = new URL('../public/planner/scenarios/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const scenario of SHOWCASE_SCENARIOS) {
  const document = scenario.create();
  await writeFile(
    new URL(`${scenario.id}.mission.json`, directory),
    serializeMissionJson(document),
  );
  await writeFile(
    new URL(`${scenario.id}.area.geojson`, directory),
    JSON.stringify(
      {
        type: 'FeatureCollection',
        features: document.jobs.map((job) => ({
          type: 'Feature',
          id: job.id,
          geometry: job.area,
          properties: {
            name: job.name,
            source: `Синтетическая область работы ${job.id} из ${document.id}; не официальный эталон и не разрешение реального полёта.`,
          },
        })),
      },
      null,
      2,
    ),
  );
  await writeFile(
    new URL(`${scenario.id}.restrictions.json`, directory),
    serializeRestrictionLayer(document),
  );
  await writeFile(
    new URL(`${scenario.id}.fleet.json`, directory),
    serializeMissionFleet(document),
  );
}
console.log(
  `Exported ${SHOWCASE_SCENARIOS.length} synthetic scenarios with mission, area, restrictions and fleet files.`,
);
