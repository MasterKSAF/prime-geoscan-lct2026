/** Deterministic audit of the supplied files. Originals are never edited. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  parseMissionCatalog,
  normalizedZone,
} from '../../lib/planner/mission-catalog.ts';
import { parseObstacleKml } from '../../lib/planner/obstacle-layer.ts';
import type { CatalogSource } from '../../lib/planner/mission-catalog.ts';

const counts = (values: string[]) =>
  values.reduce<Record<string, number>>((r, v) => {
    r[v] = (r[v] ?? 0) + 1;
    return r;
  }, {});
const root = 'docs/planner/expert-materials/2026-09-23/originals/';
const sources = await Promise.all(
  [
    ['flight-boundaries.kml', 'areas'],
    ['moscow-zone.kml', 'restrictions'],
    ['moscow-obstacles.kml', 'obstacles'],
    ['../../2026-09-22/originals/primorsky-obstacles.kml', 'obstacles'],
  ].map(async ([filename, role]) => {
    const text = await readFile(root + filename, 'utf8');
    const common = {
      filename,
      role,
      bytes: Buffer.byteLength(text),
      sha256: createHash('sha256').update(text).digest('hex'),
      timeSpanCount: (text.match(/<TimeSpan\b/g) ?? []).length,
      timeStampCount: (text.match(/<TimeStamp\b/g) ?? []).length,
    };
    if (role === 'obstacles') {
      const c = parseObstacleKml(text);
      return {
        ...common,
        total: c.total,
        accepted: c.accepted,
        rejected: c.rejected,
        repaired: c.repaired,
        altitudeModes: counts(c.objects.map((o) => o.altitudeMode)),
        geometryKinds: counts(c.objects.map((o) => o.kind)),
        extrude: counts(c.objects.map((o) => o.extrude)),
        policy:
          'Horizontal bypass; all heights. No DEM or sea-floor height conversion is claimed.',
        issues: c.objects
          .filter((o) => o.status === 'rejected')
          .map((o) => ({
            id: o.id,
            name: o.name,
            bounds: o.bounds,
            error: o.error,
          })),
      };
    }
    const c = parseMissionCatalog(text);
    const s: CatalogSource = {
      version: 'geoscan-mission-catalog/1',
      filename,
      role: role as 'areas' | 'restrictions',
      sourceText: text,
      rules: [],
      selectedIds: [],
    };
    const zones =
      role === 'restrictions'
        ? c.objects.map((o) =>
            normalizedZone(s, o, {
              terrainModel: {
                kind: 'flat',
                elevationM: 0,
                source:
                  'Zero-elevation plane for inspecting source bounds; not the Moscow terrain.',
              },
            }),
          )
        : undefined;
    return {
      ...common,
      total: c.total,
      accepted: c.accepted,
      rejected: c.rejected,
      editable: c.objects.filter((o) => o.editable).length,
      sourceTypes: counts(c.objects.map((o) => o.fields.Type ?? '')),
      altitudePolicies: zones
        ? counts(zones.map((z) => z.altitude.policy))
        : undefined,
      timePolicies: zones ? counts(zones.map((z) => z.time.policy)) : undefined,
      issues: c.objects
        .filter((o) => o.error || o.warnings.length)
        .map((o) => ({
          id: o.id,
          name: o.name,
          error: o.error,
          warnings: o.warnings,
        })),
      zones,
    };
  }),
);
const audit = {
  version: 'airspace-source-audit/2',
  reviewDate: '2026-09-24',
  engineVersion: '0.3.9',
  flightPermission: false,
  references: [
    'https://docs.ogc.org/is/12-007r2/12-007r2.html',
    'https://developers.google.com/kml/documentation/altitudemode',
    'https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/glossary-f.html',
  ],
  sources,
};
await writeFile(
  'docs/planner/airspace-source-audit-2026-09-24.json',
  JSON.stringify(audit, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    sources.map((entry) => ({
      ...entry,
      zones: undefined,
      issues: entry.issues.length,
    })),
    null,
    2,
  ),
);
