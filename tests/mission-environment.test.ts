import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import {
  missionEnvironmentChecks,
  validateExportedCandidate,
} from '../lib/planner/mission-validation.ts';
import { parseMissionDocument, sha256 } from '../lib/planner/mission-schema.ts';
import {
  parseMissionText,
  serializeMissionJson,
  serializeMissionYaml,
} from '../lib/planner/mission-io.ts';
import type { MissionEnvironment } from '../lib/planner/mission-schema.ts';

const weather = (
  overrides: Partial<MissionEnvironment> = {},
): MissionEnvironment => ({
  cloudBaseM: 150,
  cloudClearanceM: 50,
  visibilityM: 5000,
  minVisibilityM: 1000,
  source: 'Synthetic constant operator input',
  ...overrides,
});

void test('optional environment preserves old documents/hashes and validates only explicit bounded values', async () => {
  const old = demoMission(1);
  assert.deepEqual(parseMissionDocument(old), old);
  assert.equal('environment' in parseMissionDocument(old), false);
  assert.equal(await sha256(parseMissionDocument(old)), await sha256(old));
  const document = { ...old, environment: weather() };
  assert.notEqual(await sha256(document), await sha256(old));
  assert.deepEqual(
    parseMissionText(serializeMissionJson(document)).environment,
    weather(),
  );
  assert.deepEqual(
    parseMissionText(serializeMissionYaml(document), 'yaml').environment,
    weather(),
  );
  for (const environment of [
    weather({ cloudBaseM: -1 }),
    weather({ cloudClearanceM: -1 }),
    weather({ visibilityM: Infinity }),
    weather({ minVisibilityM: -1 }),
    weather({ source: '' }),
    { ...weather(), unknown: true },
  ])
    assert.throws(() => parseMissionDocument({ ...old, environment }));
});

void test('known cloud/visibility boundaries allow matching missions and survive independent evidence verification', async () => {
  const document = demoMission(1);
  document.environment = weather({ visibilityM: 1000 });
  const result = await solveMissionDocument(document);
  assert.equal(result.candidates.length, 2);
  assert.ok(result.recommendation);
  for (const candidate of [
    ...result.candidates,
    result.recommendation.candidate,
  ]) {
    assert.equal(candidate.status, 'feasible_model');
    assert.equal(
      candidate.checks.find((check) => check.id === 'CLOUD_CEILING')?.status,
      'pass',
    );
    assert.equal(
      candidate.checks.find((check) => check.id === 'VISIBILITY')?.status,
      'pass',
    );
    const checked = await validateExportedCandidate(document, candidate);
    assert.deepEqual(
      checked.filter((check) => check.status === 'fail'),
      [],
    );
  }
});

void test('cloud clearance lowers the actual scheduling ceiling; even a one-metre violation blocks confirmation', async () => {
  const document = demoMission(1);
  document.environment = weather({ cloudBaseM: 149 });
  const result = await solveMissionDocument(document);
  assert.ok(
    result.candidates.every(
      (candidate) => candidate.status !== 'feasible_model',
    ),
  );
  assert.ok(
    result.candidates.every((candidate) => candidate.sorties.length === 0),
  );
  assert.ok(
    result.candidates.every(
      (candidate) =>
        candidate.checks.find((check) => check.id === 'CLOUD_CEILING')
          ?.status === 'fail',
    ),
  );
  assert.equal(result.recommendation, undefined);
});

void test('visibility below an explicit minimum, or missing data for that minimum, cannot produce an accepted plan', async () => {
  for (const visibilityM of [999, null]) {
    const document = demoMission(1);
    document.environment = weather({ visibilityM });
    const result = await solveMissionDocument(document);
    assert.ok(
      result.candidates.every(
        (candidate) => candidate.status !== 'feasible_model',
      ),
    );
    assert.ok(
      result.candidates.every(
        (candidate) =>
          candidate.checks.find((check) => check.id === 'VISIBILITY')
            ?.status === 'fail',
      ),
    );
    assert.equal(result.recommendation, undefined);
  }
});

void test('unknown optional weather is reported as unknown without fabricating a forecast or modifying old checks', async () => {
  const document = demoMission(1);
  assert.deepEqual(missionEnvironmentChecks(document, []), []);
  document.environment = weather({
    cloudBaseM: null,
    visibilityM: null,
    minVisibilityM: null,
  });
  const result = await solveMissionDocument(document);
  for (const candidate of result.candidates) {
    assert.equal(candidate.status, 'feasible_model');
    assert.equal(
      candidate.checks.find((check) => check.id === 'CLOUD_CEILING')?.status,
      'unknown',
    );
    assert.equal(
      candidate.checks.find((check) => check.id === 'VISIBILITY')?.status,
      'unknown',
    );
  }
});

void test('independent cloud validation checks every phase rather than only survey altitude', async () => {
  const document = demoMission(1);
  document.environment = weather();
  const original = (await solveMissionDocument(document)).candidates[0];
  for (const phase of [
    'takeoff',
    'transit',
    'turn',
    'survey',
    'return',
    'landing',
  ] as const) {
    const forged = structuredClone(original);
    const segment = forged.sorties
      .flatMap((sortie) => sortie.segments)
      .find((item) => item.phase === phase);
    assert.ok(segment, `The fixture must exercise ${phase}.`);
    segment.altitudeToM = 101;
    const checked = await validateExportedCandidate(document, forged);
    assert.equal(
      checked.find((check) => check.id === 'CLOUD_CEILING')?.status,
      'fail',
      phase,
    );
    assert.equal(
      checked.find((check) => check.id === 'RESERVE_LANDING')?.status,
      'fail',
      phase,
    );
  }
});

void test('cloud heights share the start/flat-plane datum and are not silently interpreted as AMSL or real AGL', () => {
  const document = demoMission(1);
  document.environment = weather();
  document.terrainModel = {
    kind: 'flat',
    elevationM: 700,
    source: 'Synthetic flat plane',
  };
  const checks = missionEnvironmentChecks(document, [], [100]);
  assert.equal(
    checks.find((check) => check.id === 'CLOUD_CEILING')?.status,
    'pass',
  );
  assert.match(checks[0].detail, /не реальная AGL/);
  assert.match(checks[0].detail, /Потолок 100 м/);
});

void test('weather compatibility cannot promote partial jobs or bypass the existing wind limit', async () => {
  const document = demoMission(1);
  document.environment = weather();
  const higher = structuredClone(document.jobs[0]);
  higher.id = 'higher';
  higher.job.altitudeM = 200;
  higher.quality.maximumGsdCm = 100;
  document.jobs.push(higher);
  const partial = await solveMissionDocument(document);
  assert.ok(
    partial.candidates.every((candidate) => candidate.status === 'partial'),
  );
  assert.equal(partial.recommendation, undefined);
  const windy = demoMission(1);
  windy.environment = weather();
  windy.scenario.wind.speedMps = 20;
  const result = await solveMissionDocument(windy);
  assert.ok(
    result.candidates.every(
      (candidate) => candidate.status !== 'feasible_model',
    ),
  );
  assert.equal(result.recommendation, undefined);
});
