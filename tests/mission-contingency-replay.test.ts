import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { certifyMissionContingencies } from '../lib/planner/mission-contingency.ts';
import {
  verifyMissionContingencyBundle,
  verifyMissionContingencyFile,
} from '../scripts/verify-mission-contingency.ts';

const fixture = (async () => {
  const document = SHOWCASE_SCENARIOS.find(
    (x) => x.id === 'repeat-sorties',
  )!.create();
  document.jobs = document.jobs.slice(0, 1);
  const candidate = (await solveMissionDocument(document)).candidates[0];
  const certificate = await certifyMissionContingencies(document, candidate, {
    maxComputeMs: 10000,
  });
  return {
    type: 'prime-mission-contingency' as const,
    schemaVersion: '1.0' as const,
    document,
    candidate,
    certificate,
  };
})();

void test('contingency replay: source inputs and complete path certificate reproduce offline', async () => {
  const bundle = await fixture;
  const result = await verifyMissionContingencyBundle(bundle);
  assert.equal(result.status, 'passes-declared-model');
  assert.ok(result.checks.every((c) => c.pass));
  assert.equal(result.flightReady, false);
});

void test('contingency replay: altered battery, path and hidden anchors cannot preserve green status', async () => {
  for (const mutation of ['battery', 'path', 'omit', 'mode'] as const) {
    const bundle = structuredClone(await fixture);
    if (mutation === 'battery') bundle.certificate.anchors[0].batteryPct = 100;
    if (mutation === 'path') bundle.certificate.anchors[0].route[0].endSec += 5;
    if (mutation === 'omit') {
      bundle.certificate.anchors.pop();
      bundle.certificate.anchorCount--;
      bundle.certificate.checkedAnchors--;
      bundle.certificate.certifiedAnchors--;
      bundle.certificate.independentAnchors--;
    }
    if (mutation === 'mode')
      bundle.certificate.anchors[0].mode = 'planned-corridor-sensing-off';
    assert.equal(
      (await verifyMissionContingencyBundle(bundle)).status,
      'rejected',
      mutation,
    );
  }
});

void test('contingency replay: declared incomplete coverage remains incomplete, not a fabricated pass', async () => {
  const bundle = structuredClone(await fixture);
  bundle.certificate = await certifyMissionContingencies(
    bundle.document,
    bundle.candidate,
    { maxAnchors: 1 },
  );
  assert.equal(
    (await verifyMissionContingencyBundle(bundle)).status,
    'incomplete',
  );
});

void test('contingency replay: altered source or unsupported unknown bundle fields are rejected', async () => {
  const bundle = structuredClone(await fixture);
  bundle.document.name = 'Other input';
  assert.equal(
    (await verifyMissionContingencyBundle(bundle)).status,
    'rejected',
  );
  await assert.rejects(
    verifyMissionContingencyBundle({ ...(await fixture), hiddenBypass: true }),
  );
});

void test('contingency replay: unknown candidate fields cannot be certified even with recomputed envelope hashes', async () => {
  const bundle = structuredClone(await fixture);
  Object.assign(bundle.candidate, { hiddenOverride: true });
  const c = await certifyMissionContingencies(
    bundle.document,
    bundle.candidate,
  );
  assert.equal(c.status, 'not_certified');
  bundle.certificate.candidateHash = c.candidateHash;
  assert.equal(
    (await verifyMissionContingencyBundle(bundle)).status,
    'rejected',
  );
});

void test('contingency replay CLI file path never overwrites input or existing output', async () => {
  const root = resolve('output/contingency-replay-tests');
  await mkdir(root, { recursive: true });
  const folder = await mkdtemp(join(root, 'run-'));
  const input = join(folder, 'bundle.json'),
    output = join(folder, 'verification.json');
  const source = JSON.stringify(await fixture);
  await writeFile(input, source, 'utf8');
  await assert.rejects(verifyMissionContingencyFile(input, input));
  assert.equal(
    (await verifyMissionContingencyFile(input, output)).status,
    'passes-declared-model',
  );
  const saved = await readFile(output, 'utf8');
  await assert.rejects(verifyMissionContingencyFile(input, output), /EEXIST/);
  assert.equal(await readFile(input, 'utf8'), source);
  assert.equal(await readFile(output, 'utf8'), saved);
});
