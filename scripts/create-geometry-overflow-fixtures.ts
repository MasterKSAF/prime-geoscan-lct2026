import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { serializeMissionJson } from '../lib/planner/mission-io.ts';
import type { Coordinate, Polygon } from '../lib/planner/schema.ts';

/** Two individually importable files whose merged job geometry exceeds 200 KiB. */
export function createGeometryOverflowFixtures() {
  const document = demoMission(1);
  document.id = 'overflow-base';
  document.name = 'Synthetic geometry-size regression';
  document.scenario.vehicles = Array.from({ length: 8 }, (_, i) => ({
    ...structuredClone(document.scenario.vehicles[0]),
    id: `v-${i}`,
    assumptions: Array<string>(10).fill('界'.repeat(400)),
  }));
  document.jobs[0].assignedVehicleIds = [];
  document.batteries = Array.from({ length: 80 }, (_, i) => ({
    ...structuredClone(document.batteries[0]),
    id: `b-${i}`,
    vehicleId: 'v-0',
    name: '界'.repeat(100),
    source: '界'.repeat(245),
  }));
  const circle = (x: number, y: number, radius: number): Coordinate[] => {
    const points = Array.from(
      { length: 69 },
      (_, i): Coordinate => [
        x + radius * Math.cos((i * 2 * Math.PI) / 69),
        y + radius * Math.sin((i * 2 * Math.PI) / 69),
      ],
    );
    return [...points, points[0]];
  };
  const area: Polygon = {
    type: 'Polygon',
    coordinates: [
      circle(30.3, 60.035, 0.009),
      circle(30.295, 60.035, 0.001),
      circle(30.305, 60.035, 0.001),
      circle(30.3, 60.03, 0.001),
      circle(30.3, 60.04, 0.001),
    ],
  };
  return {
    document,
    geometryText: JSON.stringify({
      type: 'FeatureCollection',
      features: Array.from({ length: 8 }, (_, i) => ({
        type: 'Feature',
        properties: { name: `Synthetic area ${i + 1}` },
        geometry: area,
      })),
    }),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { document, geometryText } = createGeometryOverflowFixtures();
  const directory = resolve(process.argv[2] ?? 'output/playwright/recheck-showcase');
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, 'overflow-base.mission.json'),
    serializeMissionJson(document),
    'utf8',
  );
  await writeFile(
    resolve(directory, 'overflow-areas.geojson'),
    geometryText,
    'utf8',
  );
  console.log(`Generated geometry-overflow fixtures in ${directory}`);
}
