import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { demoMission } from '../lib/planner/mission-demo.ts';
import {
  sha256,
  MAX_MISSION_FILE_BYTES,
} from '../lib/planner/mission-schema.ts';
import type { MissionResult } from '../lib/planner/mission-schema.ts';
import { missionEvidence } from '../lib/planner/mission-export.ts';

const base = process.argv[2] ?? 'http://127.0.0.1:3015';
const output = process.argv[3] ?? 'output/mission-verification';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))
  throw new Error('Verification is local-only.');
const checks: { name: string; status: 'pass' }[] = [];
const send = (
  body: unknown,
  headers: Record<string, string> = { 'Content-Type': 'application/json' },
) =>
  fetch(`${base}/api/planner/missions/solve`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const health = await fetch(`${base}/api/planner/health`);
assert.equal(health.status, 200);
assert.equal(
  ((await health.json()) as { missionSchemaVersion: string })
    .missionSchemaVersion,
  '2.0',
);
checks.push({ name: 'health-v2', status: 'pass' });
await mkdir(output, { recursive: true });
const benchmarks: unknown[] = [];
for (const area of [1, 10, 100] as const) {
  const document = demoMission(area),
    started = performance.now(),
    response = await send(document);
  assert.equal(
    response.status,
    200,
    `area-${area}: ${await response.clone().text()}`,
  );
  const result = (await response.json()) as MissionResult;
  assert.equal(result.inputHash, await sha256(result.document));
  assert.equal(result.candidates.length, 2);
  for (const c of result.candidates) {
    if (c.status === 'feasible_model') {
      assert.ok(c.metrics.coveragePct >= 99.99);
      assert.ok(!c.checks.some((x) => x.status === 'fail'));
    }
  }
  if (area === 1) {
    assert.ok(result.candidates.every((c) => c.status === 'feasible_model'));
    const evidence = await missionEvidence(result, result.candidates[0]);
    await writeFile(
      `${output}/evidence-1km2.json`,
      JSON.stringify(evidence, null, 2),
    );
    await writeFile(
      `${output}/mission-1km2.geojson`,
      JSON.stringify(evidence.artifacts.geojson, null, 2),
    );
    await writeFile(`${output}/mission-1km2.kml`, evidence.artifacts.kml);
    const repeat = (await (await send(document)).json()) as MissionResult;
    assert.deepEqual(
      repeat.candidates.map((c) => c.metrics),
      result.candidates.map((c) => c.metrics),
    );
    assert.deepEqual(
      repeat.candidates.map((c) => c.sorties),
      result.candidates.map((c) => c.sorties),
    );
    checks.push({ name: 'deterministic-1km2-replay', status: 'pass' });
  }
  benchmarks.push({
    areaKm2: area,
    httpMs: performance.now() - started,
    computationMs: result.computationMs,
    candidates: result.candidates.map((c) => ({
      objective: c.objective,
      status: c.status,
      metrics: c.metrics,
      failures: c.checks.filter((x) => x.status === 'fail'),
      unknowns: c.checks.filter((x) => x.status === 'unknown'),
    })),
  });
  await writeFile(
    `${output}/result-${area}km2.json`,
    JSON.stringify(result, null, 2),
  );
  checks.push({ name: `bounded-honest-area-${area}`, status: 'pass' });
}
const invalid: [string, unknown, number][] = [
  ['bad-json', '{"x":', 400],
  ['unknown-field', { ...demoMission(), unexpected: true }, 400],
  ['oversized-body', ' '.repeat(MAX_MISSION_FILE_BYTES + 1), 413],
];
for (const [name, body, status] of invalid) {
  const response = await send(body);
  assert.equal(
    response.status,
    status,
    `${name}: ${await response.clone().text()}`,
  );
  checks.push({ name, status: 'pass' });
}
assert.equal(
  (
    await send(demoMission(), {
      'Content-Type': 'application/json',
      Origin: 'https://example.invalid',
    })
  ).status,
  403,
);
checks.push({ name: 'cross-origin-blocked', status: 'pass' });
assert.equal((await send('{}', { 'Content-Type': 'text/plain' })).status, 415);
checks.push({ name: 'wrong-content-type-blocked', status: 'pass' });
const files = [
  'lib/planner/schema.ts',
  'lib/planner/demo.ts',
  'lib/planner/engine.ts',
  'lib/planner/geometry.ts',
  'lib/planner/mission-schema.ts',
  'lib/planner/mission-demo.ts',
  'lib/planner/mission-engine.ts',
  'lib/planner/mission-events.ts',
  'lib/planner/mission-validation.ts',
  'lib/planner/quality.ts',
  'lib/planner/mission-export.ts',
  'lib/planner/mission-io.ts',
  'lib/planner/mission-library.ts',
  'lib/planner/mission-comparison.ts',
  'lib/planner/mission-layers.ts',
  'lib/planner/mission-fleet.ts',
  'lib/planner/mission-showcase.ts',
  'components/planner/mission-workbench.tsx',
  'components/planner/mission-wizard.tsx',
  'components/planner/mission-map.tsx',
  'components/planner/mission-brief.tsx',
  'components/planner/mission-gallery.tsx',
  'components/planner/mission-comparison-view.tsx',
  'components/planner/mission-fleet-editor.tsx',
  'app/planner/page.tsx',
  'app/planner/mission-workbench.css',
  'app/planner/mission-showcase.css',
  'app/api/planner/missions/solve/route.ts',
  'app/api/planner/health/route.ts',
  'scripts/verify-missions.ts',
  'scripts/verify-mission-evidence.ts',
  'Dockerfile.planner',
  'compose.planner.yaml',
  'package.json',
  'package-lock.json',
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    files.map(async (path) => [
      path,
      createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
    ]),
  ),
);
const report = {
  createdAt: new Date().toISOString(),
  base,
  checks,
  benchmarks,
  sourceHashes,
  limitations: [
    'Model only; not real flight or telemetry.',
    '100 km² checks bounded rejection too, not guaranteed feasibility.',
    'Host timing is not target-hardware certification.',
  ],
};
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      output,
      checks: checks.length,
      sourceFiles: files.length,
      benchmarks: (
        benchmarks as {
          areaKm2: number;
          computationMs: number;
          candidates: { objective: string; status: string; metrics: unknown }[];
        }[]
      ).map((b) => ({
        areaKm2: b.areaKm2,
        computationMs: b.computationMs,
        candidates: b.candidates.map((c) => ({
          objective: c.objective,
          status: c.status,
          metrics: c.metrics,
        })),
      })),
    },
    null,
    2,
  ),
);
