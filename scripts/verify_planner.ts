import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { demoScenario } from '../lib/planner/demo.ts';
import { evidenceBundle, toGeoJSON, toKML } from '../lib/planner/export.ts';
import { parseScenario } from '../lib/planner/schema.ts';
import type { Plan } from '../lib/planner/schema.ts';

const base = process.argv[2] ?? 'http://127.0.0.1:3015';
const output = process.argv[3] ?? 'output/planner-verification';
const checks: { name: string; status: string }[] = [];
const jsonHeaders = { 'Content-Type': 'application/json' };
const send = (body: unknown, headers: Record<string, string> = jsonHeaders) =>
  fetch(`${base}/api/planner/solve`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const good = demoScenario();
const health = await fetch(`${base}/api/planner/health`);
assert.equal(health.status, 200);
checks.push({ name: 'health', status: 'pass' });
const page = await fetch(`${base}/planner`);
assert.equal(page.status, 200);
assert.ok((await page.text()).includes('ПРАЙМ'));
checks.push({ name: 'page', status: 'pass' });
const response = await send(good);
assert.equal(response.status, 200);
const plan = (await response.json()) as Plan;
assert.equal(plan.status, 'undetermined');
assert.ok(plan.metrics.coveragePct >= 99);
assert.ok(plan.checks.every((c) => c.status !== 'fail'));
checks.push({ name: 'complete-demo', status: 'pass' });
const hash = createHash('sha256')
  .update(JSON.stringify(parseScenario(good)))
  .digest('hex');
assert.equal(hash, plan.inputHash);
checks.push({ name: 'input-sha256', status: 'pass' });
const repeat = (await (await send(good)).json()) as Plan;
assert.deepEqual(repeat.metrics, plan.metrics);
assert.deepEqual(repeat.missions, plan.missions);
checks.push({ name: 'deterministic-replay', status: 'pass' });
const criteria = { ...good, objective: 'flightTime' };
const second = await send(criteria);
assert.equal(second.status, 200);
checks.push({ name: 'second-objective', status: 'pass' });
const invalidCases: [string, unknown, number][] = [
  ['bad-json', '{"broken":', 400],
  ['unknown-property', { ...good, hidden: true }, 400],
  ['wind-limit', { ...good, wind: { speedMps: 20, fromDeg: 0 } }, 422],
  [
    'empty-fleet',
    { ...good, vehicles: good.vehicles.map((v) => ({ ...v, enabled: false })) },
    422,
  ],
  [
    'unsupported-geophysics',
    { ...good, job: { ...good.job, type: 'Geophysics' } },
    422,
  ],
  ['body-limit', 'x'.repeat(200001), 413],
];
for (const [name, body, expected] of invalidCases) {
  const r = await send(body);
  assert.equal(r.status, expected, name);
  const e = (await r.json()) as { error: string };
  assert.ok(e.error);
  checks.push({ name, status: 'pass' });
}
const origin = await send(good, {
  ...jsonHeaders,
  Origin: 'https://example.invalid',
});
assert.equal(origin.status, 403);
checks.push({ name: 'cross-origin-rejected', status: 'pass' });
const sources = [
  'lib/planner/schema.ts',
  'lib/planner/geometry.ts',
  'lib/planner/engine.ts',
  'lib/planner/export.ts',
  'lib/planner/demo.ts',
  'package-lock.json',
];
const hashes = Object.fromEntries(
  await Promise.all(
    sources.map(async (p) => [
      p,
      createHash('sha256')
        .update(await readFile(p))
        .digest('hex'),
    ]),
  ),
);
await mkdir(output, { recursive: true });
await writeFile(`${output}/scenario.json`, JSON.stringify(good, null, 2));
await writeFile(
  `${output}/plan.geojson`,
  JSON.stringify(toGeoJSON(plan), null, 2),
);
await writeFile(`${output}/plan.kml`, toKML(plan));
await writeFile(
  `${output}/evidence.json`,
  JSON.stringify(evidenceBundle(plan), null, 2),
);
await writeFile(
  `${output}/report.json`,
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      base,
      checks,
      hashes,
      metrics: plan.metrics,
      evidenceKind: 'HTTP API tests and model calculation',
      flightReady: false,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      checks: checks.length,
      passed: checks.length,
      output,
      metrics: plan.metrics,
    },
    null,
    2,
  ),
);
