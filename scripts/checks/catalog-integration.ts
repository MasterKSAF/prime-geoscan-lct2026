import { readFile } from 'node:fs/promises';
import { parseMissionCatalog } from '../../lib/planner/mission-catalog.ts';
import { parseObstacleKml, boundsOverlap, expandedBounds } from '../../lib/planner/obstacle-layer.ts';
import { area, projection } from '../../lib/planner/geometry.ts';
const folder = 'output/geoscan-new-materials-20260923/';
const areas = parseMissionCatalog(await readFile(folder + 'flight-boundaries.kml', 'utf8'));
const zones = parseMissionCatalog(await readFile(folder + 'moscow-zone.kml', 'utf8'));
const obstacles = parseObstacleKml(await readFile(folder + 'moscow-obstacles.kml', 'utf8'));
const candidates = areas.objects.filter((o) => !o.error && o.editable && o.bounds).map((o) => {
  const p = projection(o.geometry!.coordinates[0][0]);
  const square = area([o.geometry!.coordinates.map((r) => r.map(p.forward))]);
  const near = expandedBounds(o.bounds!, 500);
  const relevant = obstacles.objects.filter((b) => b.bounds && boundsOverlap(b.bounds, near));
  return { id: o.id, name: o.name, geometry: o.geometry, square, obstacles: relevant.map((b) => ({ id: b.id, bounds: b.bounds, status: b.status })),
    zones: zones.objects.filter((z) => z.bounds && boundsOverlap(z.bounds, near)).map((z) => ({ id: z.id, name: z.name, error: z.error, fields: z.fields })) };
}).filter((o) => o.square > 3000 && o.square < 80000 && o.obstacles.length > 0 && o.obstacles.length < 20).sort((a, b) => a.square - b.square);
console.log(JSON.stringify({ areas: { total: areas.total, accepted: areas.accepted, rejected: areas.rejected, editable: areas.objects.filter((o) => o.editable).length, errors: areas.objects.filter((o) => o.error).slice(0, 8).map((o) => [o.id, o.error]) }, zones: { total: zones.total, accepted: zones.accepted, rejected: zones.rejected, errors: zones.objects.filter((o) => o.error).map((o) => [o.id, o.error]) }, obstacles: { total: obstacles.total, accepted: obstacles.accepted, rejected: obstacles.rejected }, candidates: candidates.slice(0, 15) }, null, 2));
