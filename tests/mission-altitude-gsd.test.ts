import test from 'node:test';
import assert from 'node:assert/strict';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { cameraAltitudeForGsd, qualityForJob } from '../lib/planner/quality.ts';
import {
  trackAltitudeAllowed,
  trackAltitudeCheck,
} from '../lib/planner/altitude-policy.ts';
import {
  missionJobContext,
  solveMissionDocument,
} from '../lib/planner/mission-engine.ts';
import {
  validateMissionCandidate,
  validateExportedCandidate,
} from '../lib/planner/mission-validation.ts';
import { parseMissionDocument, sha256 } from '../lib/planner/mission-schema.ts';
import { missionGeoJSON } from '../lib/planner/mission-export.ts';
import { plannedPhotoCoverage } from '../lib/planner/mission-photo-footprints.ts';
import { solve } from '../lib/planner/engine.ts';
import { appendMissionWork } from '../lib/planner/mission-editing.ts';
import { weatherHeight } from '../lib/planner/mission-weather.ts';
import { missionSummaryMarkdown } from '../lib/planner/mission-io.ts';
import { missionImprovementTrials } from '../lib/planner/mission-insights.ts';

const automatic = () => {
  const d = demoMission();
  d.jobs[0].quality.altitudeMode = 'gsd';
  return d;
};

void test('150 m is exclusive; negative/unknown/nonfinite heights fail, touchdown is allowed', () => {
  for (const h of [0, 100, 149, 149.999])
    assert.equal(trackAltitudeAllowed(h), true);
  for (const h of [-1, 150, 150.000001, 700, NaN, Infinity])
    assert.equal(trackAltitudeAllowed(h), false);
  assert.equal(
    trackAltitudeCheck([100], [{ altitudeFromM: 100, altitudeToM: 150 }])
      .status,
    'fail',
  );
});

void test('GSD inversion uses worst axis with mm/metres/cm conversion', () => {
  const q = demoMission().jobs[0].quality;
  q.maximumGsdCm = 2;
  assert.ok(Math.abs(cameraAltitudeForGsd(q)! - 102.12765957446808) < 1e-9);
  q.imageHeightPx = 1000;
  assert.ok(Math.abs(cameraAltitudeForGsd(q)! - 25.64102564102564) < 1e-9);
  q.sensorWidthMm = undefined;
  assert.equal(cameraAltitudeForGsd(q), null);
});

void test('GSD sets height, footprint and triggers; cap improves resolution, not the reverse', () => {
  const d = automatic(),
    job = d.jobs[0];
  assert.equal(qualityForJob(job).job.altitudeM, 149);
  job.quality.maximumGsdCm = 2;
  const r = qualityForJob(job, undefined, d.flightEnvelope);
  assert.equal(r.job.altitudeM, 102.127);
  assert.ok(Math.abs(r.job.swathM - 120) < 0.001);
  assert.ok(
    Math.abs(r.job.triggerDistanceM - r.job.altitudeM * 0.78 * 0.3) < 1e-8,
  );
  assert.equal(
    r.checks.find(
      (c) => c.id.endsWith('_GSD') && !c.id.endsWith('ALTITUDE_GSD'),
    )!.status,
    'pass',
  );
  assert.equal(job.job.altitudeM, 100, 'input remains immutable');
});

void test('GSD auto height respects lower operator ceiling and refuses impossible minimum', () => {
  const d = automatic();
  d.flightEnvelope.maxAltitudeM = 80;
  assert.equal(
    qualityForJob(d.jobs[0], undefined, d.flightEnvelope).job.altitudeM,
    80,
  );
  d.flightEnvelope.minSurveyAltitudeM = 60;
  d.jobs[0].quality.maximumGsdCm = 1;
  assert.equal(
    qualityForJob(d.jobs[0], undefined, d.flightEnvelope).checks.find((c) =>
      c.id.endsWith('ALTITUDE_GSD'),
    )!.status,
    'fail',
  );
  d.jobs[0].quality.maximumGsdCm = 0.01;
  assert.ok(qualityForJob(d.jobs[0]).checks.some((c) => c.status === 'fail'));
});

void test('fixed heights are never silently lowered; GSD still rejects coarse imagery', () => {
  const d = demoMission();
  d.jobs[0].quality.maximumGsdCm = 1;
  const r = qualityForJob(d.jobs[0]);
  assert.equal(r.job.altitudeM, 100);
  assert.equal(r.checks.find((c) => c.id.endsWith('_GSD'))!.status, 'fail');
});

void test('forecast uses installed cameras; input summary leaves GSD height unassigned', () => {
  const d = automatic();
  assert.equal(d.jobs[0].job.altitudeM, 100);
  assert.equal(weatherHeight(d), 120);
  assert.match(
    missionSummaryMarkdown(d),
    /высота по камере — будет рассчитана после назначения/,
  );
  d.flightEnvelope.maxAltitudeM = 40;
  assert.equal(weatherHeight(d), 10);
});

void test('missing camera and wrong work type cannot bypass auto-height quality checks', () => {
  const d = automatic();
  d.jobs[0].quality.focalLengthMm = undefined;
  assert.ok(qualityForJob(d.jobs[0]).checks.some((c) => c.status === 'fail'));
  d.jobs[0].quality = {
    mode: 'manual',
    altitudeMode: 'gsd',
    status: 'assumed',
    source: 'invalid combination',
  };
  assert.ok(qualityForJob(d.jobs[0]).checks.some((c) => c.status === 'fail'));
});

void test('new camera works use GSD; older files retain fixed height and hashes on parsing', async () => {
  const d = demoMission();
  assert.equal(d.flightEnvelope.maxAltitudeM, 149);
  assert.equal(d.jobs[0].quality.altitudeMode, undefined);
  assert.equal(await sha256(d), await sha256(parseMissionDocument(d)));
  assert.equal(
    appendMissionWork(d, d.jobs[0].id, 'MS', 'new-ms').jobs.at(-1)!.quality
      .altitudeMode,
    'gsd',
  );
  assert.equal(
    appendMissionWork(d, d.jobs[0].id, 'LiDAR', 'new-lidar').jobs.at(-1)!
      .quality.altitudeMode,
    undefined,
  );
  const auto = automatic();
  assert.deepEqual(
    parseMissionDocument(JSON.parse(JSON.stringify(auto))),
    auto,
  );
});

void test('solver refuses fixed 150/151 m despite enlarged corridor and permissive GSD', async () => {
  for (const height of [150, 151]) {
    const d = demoMission();
    d.jobs[0].job.altitudeM = height;
    d.jobs[0].quality.maximumGsdCm = 10;
    d.flightEnvelope.maxAltitudeM = 700;
    const result = await solveMissionDocument(d);
    assert.ok(result.candidates.length);
    for (const c of result.candidates) {
      assert.notEqual(c.status, 'feasible_model');
      assert.equal(
        c.checks.find((x) => x.id === 'TRACK_ALTITUDE')!.status,
        'fail',
      );
      assert.equal(c.sorties.length, 0);
    }
    const repair = missionImprovementTrials(d, result.candidates[0]).find(
      (trial) => trial.id.startsWith('gsd-altitude-'),
    );
    assert.ok(repair);
    assert.equal(repair.document.jobs[0].quality.maximumGsdCm, 10);
    assert.equal(
      qualityForJob(
        repair.document.jobs[0],
        undefined,
        repair.document.flightEnvelope,
      ).job.altitudeM,
      149,
    );
  }
});

void test('legacy API cannot produce a feasible plan at 150 m', () => {
  const s = demoMission().scenario;
  s.job.altitudeM = 150;
  assert.throws(() => solve(s), { code: 'TRACK_ALTITUDE' });
});

void test('auto GSD is consistent in routes, export, camera coverage and independent verifier', async () => {
  const d = automatic();
  d.flightEnvelope.maxAltitudeM = 110;
  const result = await solveMissionDocument(d);
  const c = result.candidates.find(
    (candidate) => candidate.status === 'feasible_model',
  );
  assert.ok(
    c,
    JSON.stringify(
      result.candidates.map((v) => ({
        status: v.status,
        fail: v.checks.filter((x) => x.status === 'fail'),
      })),
    ),
  );
  for (const s of c.sorties.flatMap((sortie) => sortie.segments)) {
    assert.ok(s.altitudeFromM < 150 && s.altitudeToM < 150);
    if (s.phase === 'survey') assert.equal(s.altitudeFromM, 110);
  }
  assert.ok(
    !(await validateExportedCandidate(d, c)).some(
      (check) => check.status === 'fail',
    ),
  );
  assert.equal(
    missionGeoJSON(d, c).properties.jobs[0].effectiveJob!.altitudeM,
    110,
  );
  assert.ok(
    plannedPhotoCoverage(d, c.sorties).every(
      (p) => p.status === 'calculated' && p.coveredM2 / p.requestedM2 >= 0.99,
    ),
  );
  const contexts = d.jobs.map((j) => missionJobContext(d, j));
  for (const phase of [
    'takeoff',
    'transit',
    'survey',
    'turn',
    'return',
    'landing',
  ] as const) {
    const tampered = structuredClone(c.sorties);
    const s = tampered
      .flatMap((sortie) => sortie.segments)
      .find((segment) => segment.phase === phase);
    assert.ok(s, phase);
    s.altitudeToM = 150;
    const checks = validateMissionCandidate(d, tampered, contexts);
    assert.equal(
      checks.find((check) => check.id === 'TRACK_ALTITUDE')!.status,
      'fail',
      phase,
    );
    assert.equal(
      checks.find((check) => check.id === 'RESERVE_LANDING')!.status,
      'fail',
      phase,
    );
  }
});
