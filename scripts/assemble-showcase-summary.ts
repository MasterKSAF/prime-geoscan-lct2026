import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MISSION_ENGINE_VERSION } from '../lib/planner/mission-schema.ts';

const directory = 'output/mission-showcase-0.3.0';
const paths = {
  unit: 'output/mission-showcase-0.3.0-unit-tests.xml',
  acceptance: 'output/mission-showcase-0.3.0-acceptance.xml',
  api: `${directory}/api/report.json`,
  runtime: `${directory}/api/runtime.json`,
  scenarios: `${directory}/scenarios/report.json`,
  core: 'output/playwright/0.3.0-core/results.json',
  features: 'output/playwright/0.3.0-showcase/browser-report.json',
  coreEvidence: `${directory}/browser-core-evidence-check.json`,
  featureEvidence: `${directory}/browser-balanced-evidence-check.json`,
};
const readJson = async (path: string) =>
  JSON.parse(await readFile(path, 'utf8'));
async function junit(path: string) {
  const text = await readFile(path, 'utf8');
  const field = (name: string) => {
    const value = text.match(new RegExp(`<!-- ${name} (\\d+) -->`));
    assert.ok(value, `${name} missing in ${path}`);
    return Number(value[1]);
  };
  const result = {
    tests: field('tests'),
    pass: field('pass'),
    fail: field('fail'),
    skipped: field('skipped'),
    report: path,
  };
  assert.equal(result.fail, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.tests, result.pass);
  return result;
}
const [
  unit,
  acceptance,
  api,
  runtime,
  scenarios,
  core,
  features,
  coreEvidence,
  featureEvidence,
] = await Promise.all([
  junit(paths.unit),
  junit(paths.acceptance),
  readJson(paths.api),
  readJson(paths.runtime),
  readJson(paths.scenarios),
  readJson(paths.core),
  readJson(paths.features),
  readJson(paths.coreEvidence),
  readJson(paths.featureEvidence),
]);
assert.ok(api.checks.every((c: { status: string }) => c.status === 'pass'));
assert.equal(runtime.sourceComparison.mismatches.length, 0);
assert.equal(runtime.status, 'running');
assert.equal(scenarios.status, 'pass');
assert.equal(scenarios.engineVersion, MISSION_ENGINE_VERSION);
assert.equal(features.status, 'pass');
for (const browser of [core, features]) {
  assert.equal(browser.health.missionEngineVersion, MISSION_ENGINE_VERSION);
  assert.ok(
    browser.checks.length > 0 &&
      browser.checks.every((c: { pass: boolean }) => c.pass),
  );
  assert.equal(browser.pageErrors.length, 0);
}
for (const evidence of [coreEvidence, featureEvidence])
  assert.equal(evidence.status, 'passes-declared-model');
const positive = scenarios.scenarios.filter(
  (s: { expected: string }) => s.expected === 'feasible_model',
);
const negative = scenarios.scenarios.filter(
  (s: { expected: string }) => s.expected === 'rejected',
);
const checksSummary = (report: { checks: { status: string }[] }) => ({
  checks: report.checks.length,
  pass: report.checks.filter((c) => c.status === 'pass').length,
  fail: report.checks.filter((c) => c.status === 'fail').length,
  unknown: report.checks.filter((c) => c.status === 'unknown').length,
});
const artifacts = [
  ...Object.values(paths),
  'docs/planner/demo-guide.md',
  'docs/planner/demo-guide.html',
  'docs/planner/showcase-0.3.0.md',
  'docs/planner/scenarios.md',
  'docs/planner/api-v2.md',
  'docs/planner/contracts/mission-v2.schema.json',
  'output/playwright/0.3.0-docs/results.json',
];
const documentQa = await readJson('output/playwright/0.3.0-docs/results.json');
assert.equal(documentQa.pass, true);
const artifactHashes = Object.fromEntries(
  await Promise.all(
    artifacts.map(async (path) => [
      path,
      createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
    ]),
  ),
);
const summary = {
  createdAt: new Date().toISOString(),
  engineVersion: MISSION_ENGINE_VERSION,
  status: 'passed-described-engineering-corpus',
  flightReady: false,
  fullSpecificationCompleted: false,
  officialScore: null,
  unit,
  acceptance,
  api: { checks: api.checks.length, report: paths.api },
  scenarios: {
    count: scenarios.scenarios.length,
    positive: positive.length,
    expectedRejections: negative.length,
    positiveEvidenceBundles: positive.reduce(
      (n: number, s: { candidates: unknown[] }) => n + s.candidates.length,
      0,
    ),
    rejectedEvidenceBundles: negative.reduce(
      (n: number, s: { candidates: unknown[] }) => n + s.candidates.length,
      0,
    ),
    report: paths.scenarios,
  },
  browser: {
    core: { checks: core.checks.length, report: paths.core },
    features: {
      groups: features.groups.length,
      checks: features.checks.length,
      report: paths.features,
    },
    pageErrors: 0,
  },
  downloadedEvidence: {
    core: { ...checksSummary(coreEvidence), report: paths.coreEvidence },
    balanced: {
      ...checksSummary(featureEvidence),
      report: paths.featureEvidence,
    },
  },
  runtime: {
    imageId: runtime.imageId,
    containerId: runtime.containerId,
    health: runtime.health,
    cpus: runtime.cpus,
    memoryBytes: runtime.memoryBytes,
    user: runtime.user,
    sourceFilesCompared: runtime.sourceComparison.compared,
    sourceMismatches: 0,
    report: paths.runtime,
  },
  artifactHashes,
  documents: { report: 'output/playwright/0.3.0-docs/results.json', pass: documentQa.pass, viewports: 2 },
  limitations: [
    'Synthetic acceptance examples, not an official jury rubric or proof of 100 points.',
    'Only declared local linear flight/resource and safety models; no real flight clearance or telemetry.',
    'No validated fixed-wing Geoscan 201, DEM/real AGL/AMSL, automatic forecast, calibrated wear or arbitrary optimal-height search.',
    '100 km² load example remains not_found; bounded search does not prove infeasibility or global optimality.',
    'Unknown evidence checks are retained. Revalidation shares geometry with the solver; not external certification.',
    'Targeted changed-code lint passed; unrelated legacy workspace/planner test lint issues were not changed.',
    'Wrangler transport risk for interrupted/slow request bodies remains; no public deployment.',
    'No commit, push, final submission archive, presentation or public release has been made.',
  ],
};
await writeFile(`${directory}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
