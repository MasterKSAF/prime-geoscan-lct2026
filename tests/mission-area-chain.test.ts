import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import {
  solveMissionDocument,
  solveMissionSerialBaseline,
} from '../lib/planner/mission-engine.ts';
import { validateExportedCandidate } from '../lib/planner/mission-validation.ts';
import {
  jobSurveySegments,
  sortieJobIds,
} from '../lib/planner/mission-sortie-jobs.ts';
import { missionGeoJSON } from '../lib/planner/mission-export.ts';
import { describeMissionDelivery } from '../lib/planner/mission-delivery-manifest.ts';
const source = () => {
  const d = SHOWCASE_SCENARIOS.find((s) => s.id === 'repeat-sorties')!.create();
  d.jobs.forEach((j) => delete j.window);
  d.planning.areaTransferPolicy = 'compatible-work-v1';
  return d;
};
void test('compatible areas share one continuous flight with truthful job coverage, battery and exports', async () => {
  const d = source();
  const baseline = await solveMissionSerialBaseline(d, 'flightTime');
  const r = await solveMissionDocument(d);
  for (const c of r.candidates) {
    assert.equal(c.status, 'feasible_model');
    assert.equal(c.sorties.length, 1);
    assert.equal(
      c.sorties[0].segments.filter((s) => s.phase === 'takeoff').length,
      1,
    );
    assert.equal(
      c.sorties[0].segments.filter((s) => s.phase === 'landing').length,
      1,
    );
    assert.equal(sortieJobIds(c.sorties[0]).length, 3);
    assert.ok(c.metrics.flightTimeSec < baseline.metrics.flightTimeSec);
    assert.ok(
      c.metrics.minimumRemainingPct > baseline.metrics.minimumRemainingPct,
    );
    assert.equal(
      (await validateExportedCandidate(d, c)).filter((v) => v.status === 'fail')
        .length,
      0,
    );
    for (const j of d.jobs)
      assert.ok(jobSurveySegments(c.sorties, j.id).length);
    const geo = missionGeoJSON(d, c);
    for (const j of d.jobs)
      assert.ok(
        geo.features.some(
          (f) =>
            f.properties.kind === 'waypoint' && f.properties.jobId === j.id,
        ),
      );
    const delivery = describeMissionDelivery(d, c);
    assert.equal(
      delivery.jobs.reduce((n, j) => n + (j.expectedCaptureEvents ?? 0), 0),
      c.sorties[0].shots,
    );
    const forged = structuredClone(c);
    forged.sorties[0].segments.find(
      (s) => s.jobId !== forged.sorties[0].jobId,
    )!.jobId = 'missing-work';
    assert.ok(
      (await validateExportedCandidate(d, forged)).some(
        (x) => x.status === 'fail',
      ),
    );
  }
});
void test('different work windows keep independent base-to-base flights', async () => {
  const d = SHOWCASE_SCENARIOS.find((s) => s.id === 'repeat-sorties')!.create();
  d.planning.areaTransferPolicy = 'compatible-work-v1';
  d.jobs.forEach(
    (j, i) =>
      (j.window = {
        start: new Date(Date.parse(d.window.start) + i * 1200000).toISOString(),
        end: new Date(
          Date.parse(d.window.start) + i * 1200000 + 1000000,
        ).toISOString(),
      }),
  );
  const r = await solveMissionDocument(d);
  assert.equal(r.candidates[0].sorties.length, 3);
  assert.equal(
    (await validateExportedCandidate(d, r.candidates[0])).filter(
      (x) => x.status === 'fail',
    ).length,
    0,
  );
});
