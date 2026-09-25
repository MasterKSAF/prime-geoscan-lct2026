import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMONSTRATION_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import {
  solveMissionDocument,
  missionJobContext,
} from '../lib/planner/mission-engine.ts';
import {
  betterMission,
  compactMissionSchedule,
  missionJobOrders,
  shiftDeparture,
} from '../lib/planner/mission-schedule-search.ts';
import {
  validateMissionCandidate,
  validateExportedCandidate,
} from '../lib/planner/mission-validation.ts';
import { playbackFrameTime } from '../lib/planner/playback-interpolation.ts';
import { missionPassportHtml } from '../lib/planner/mission-passport.ts';
import {
  buildMissionArchive,
  readStoredZip,
  verifyArchiveFiles,
} from '../lib/planner/mission-archive.ts';

void test('joint search: permutations preserve arbitrary IDs and include every three-job order', () => {
  const ids = ['thermal-west', 'rgb-east', 'ms-south'];
  const orders = missionJobOrders(ids);
  assert.equal(orders.length, 6);
  assert.equal(new Set(orders.map((x) => x.join('|'))).size, 6);
  for (const order of orders)
    assert.deepEqual([...order].sort(), [...ids].sort());
  assert.deepEqual(ids, ['thermal-west', 'rgb-east', 'ms-south']);
});

void test('joint search: renamed and reordered input retains complete checks and a verifiable archive', async () => {
  const d = DEMONSTRATION_SCENARIOS.find(
    (s) => s.id === 'demo-02-obstacles',
  )!.create();
  d.id = 'custom-mission-regression';
  d.name = '<script>alert("unsafe")</script>';
  d.jobs.reverse().forEach((job, i) => {
    job.id = `arbitrary-${i}`;
    job.name = `Работа ${i + 1}`;
  });
  const before = JSON.stringify(d);
  const result = await solveMissionDocument(d);
  assert.equal(JSON.stringify(d), before);
  for (const c of result.candidates) {
    assert.equal(c.status, 'feasible_model');
    assert.deepEqual(
      (await validateExportedCandidate(d, c)).filter(
        (x) => x.status === 'fail',
      ),
      [],
    );
  }
  const c = result.candidates[0];
  const archive = await buildMissionArchive(d, c);
  assert.match(archive.files['data/README.md'], /routes/);
  assert.match(archive.files['data/input/mission.html'], /&lt;script&gt;/);
  assert.doesNotMatch(missionPassportHtml(d), /<script>/);
  assert.equal(
    (await verifyArchiveFiles(readStoredZip(archive.bytes))).status,
    'passes-declared-model',
  );
  const improved = structuredClone(c);
  improved.metrics.makespanSec -= 1;
  assert.equal(
    betterMission(improved, c, 'flightTime'),
    true,
    'Equal airborne time prefers earlier completion.',
  );
  improved.metrics.flightTimeSec += 1;
  assert.equal(
    betterMission(improved, c, 'flightTime'),
    false,
    'Primary objective cannot be sacrificed silently.',
  );

  const delayed = c.sorties.map((s) => shiftDeparture(s, s.startSec + 300));
  const contexts = d.jobs.map((j) =>
    missionJobContext(
      d,
      j,
      Math.abs(
        (c.jobCoverage.find((x) => x.jobId === j.id)?.bearingDeg ??
          j.job.bearingDeg) - j.job.bearingDeg,
      ) > 1e-6,
    ),
  );
  assert.equal(
    compactMissionSchedule(d, delayed, contexts, () => true),
    delayed,
    'Budget cancellation makes no edits.',
  );
  const compacted = compactMissionSchedule(d, delayed, contexts, () => false);
  assert.ok(
    Math.max(...compacted.map((s) => s.endSec)) <
      Math.max(...delayed.map((s) => s.endSec)),
  );
  assert.deepEqual(
    validateMissionCandidate(d, compacted, contexts).filter(
      (x) => x.status === 'fail',
    ),
    [],
  );
  for (const s of compacted) {
    const old = delayed.find((x) => x.id === s.id)!;
    assert.equal(s.durationSec, old.durationSec);
    assert.equal(s.remainingPct, old.remainingPct);
    assert.deepEqual(
      s.segments.map((x) => [x.from, x.to]),
      old.segments.map((x) => [x.from, x.to]),
    );
  }
});

void test('visual playback: smooth monotonic frames never predict future time; pause and backward seek snap', () => {
  for (const rate of [1, 10, 60, 240]) {
    const times = [0, 16, 32, 64, 100, 200].map((ms) =>
      playbackFrameTime(10, 10 + rate / 10, ms, rate, true),
    );
    assert.equal(times[0], 10);
    assert.equal(times.at(-1), 10 + rate / 10);
    assert.ok(times.every((t, i) => i === 0 || t >= times[i - 1]));
    assert.ok(times.every((t) => t <= 10 + rate / 10));
  }
  assert.equal(playbackFrameTime(50, 10, 16, 60, true), 10);
  assert.equal(playbackFrameTime(10, 20, 0, 60, false), 20);
});
