import { mkdir, writeFile } from 'node:fs/promises';
import { DEMONSTRATION_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { serializeMissionJson } from '../lib/planner/mission-io.ts';
import { serializeRestrictionLayer } from '../lib/planner/mission-layers.ts';
import { serializeMissionFleet } from '../lib/planner/mission-fleet.ts';

// Only the three new deterministic fixtures; legacy downloads are not rewritten.
const directory = new URL('../public/planner/scenarios/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const s of DEMONSTRATION_SCENARIOS) {
  const d = s.create();
  const artifacts = {
    'mission.json': serializeMissionJson(d),
    'area.geojson': JSON.stringify(
      {
        type: 'FeatureCollection',
        features: d.jobs.map((j) => ({
          type: 'Feature',
          id: j.id,
          geometry: j.area,
          properties: {
            name: j.name,
            source: `Синтетическая область ${j.id}; не разрешение реального полёта.`,
          },
        })),
      },
      null,
      2,
    ),
    'restrictions.json': serializeRestrictionLayer(d),
    'fleet.json': serializeMissionFleet(d),
  };
  for (const [suffix, body] of Object.entries(artifacts))
    await writeFile(new URL(`${s.id}.${suffix}`, directory), body);
}
console.log(
  'Exported 3 demonstration scenarios × 4 importable files. No real imagery generated.',
);
