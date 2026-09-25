import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { installedBatteryDocument } from '../lib/planner/mission-fleet-state.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import {
  serializeMissionJson,
  parseMissionText,
} from '../lib/planner/mission-io.ts';
import { validateExportedCandidate } from '../lib/planner/mission-validation.ts';
import {
  buildMissionArchive,
  buildMissionDiagnosticArchive,
  verifyArchiveFiles,
} from '../lib/planner/mission-archive.ts';
import { sortieJobIds } from '../lib/planner/mission-sortie-jobs.ts';
import { readFile } from 'node:fs/promises';

for (const id of ['mixed-fleet', 'lidar-geophysics'])
  void test(`five work types full input-solve-export-verify pipeline: ${id}`, async () => {
    const d = parseMissionText(
      serializeMissionJson(
        installedBatteryDocument(
          SHOWCASE_SCENARIOS.find((s) => s.id === id)!.create(),
        ),
      ),
    );
    const result = await solveMissionDocument(d),
      c = result.candidates.find((c) => c.status === 'feasible_model');
    assert.ok(
      c,
      JSON.stringify(
        result.candidates.map((c) =>
          c.checks.filter((x) => x.status === 'fail'),
        ),
      ),
    );
    const checks = await validateExportedCandidate(result.document, c);
    assert.ok(
      checks.every((x) => x.status !== 'fail'),
      JSON.stringify(checks.filter((x) => x.status === 'fail')),
    );
    assert.equal(new Set(c.sorties.flatMap(sortieJobIds)).size, d.jobs.length);
    const archive = await buildMissionArchive(result.document, c);
    assert.equal(
      (await verifyArchiveFiles(archive.files)).status,
      'passes-declared-model',
    );
    for (const vehicleId of new Set(c.sorties.map((s) => s.vehicleId))) {
      assert.ok(archive.files[`data/routes/${vehicleId}.kml`]);
      assert.ok(archive.files[`data/routes/${vehicleId}.geojson`]);
    }

    const incompatible = structuredClone(d);
    incompatible.scenario.vehicles = incompatible.scenario.vehicles.map(
      (v) => ({ ...v, jobs: ['RGB'] }),
    );
    if (d.jobs.some((j) => j.job.type !== 'RGB'))
      assert.ok(
        (await solveMissionDocument(incompatible)).candidates.every(
          (c) => c.status !== 'feasible_model',
        ),
      );
  });

void test('Demo 2 copy: active operator no-flight zone blocks the mission and survives diagnostic export', async () => {
  const text = await readFile(
    'public/planner/scenarios/demo-02-expert-obstacles.mission.json',
    'utf8',
  );
  const d = parseMissionText(text),
    original = JSON.stringify(d),
    copy = structuredClone(d);
  copy.id = 'expert-demo2-active-ban';
  copy.restrictions.push({
    id: 'operator-test-ban',
    name: 'Проверочный запрет оператора',
    kind: 'noFlight',
    geometry: structuredClone(d.scenario.airspace),
    minAltitudeM: 0,
    maxAltitudeM: null,
    startAt: d.window.start,
    endAt: d.window.end,
    source:
      'Синтетическая приёмочная проверка на копии Демо 2. Не зона из каталога экспертов.',
  });
  const blocked = await solveMissionDocument(copy);
  assert.ok(blocked.candidates.every((c) => c.status !== 'feasible_model'));
  const diagnostic = await buildMissionDiagnosticArchive(
    blocked.document,
    blocked.candidates[0],
  );
  assert.equal(
    (await verifyArchiveFiles(diagnostic.files)).status,
    'diagnostic-only-not-flight-approved',
  );
  assert.equal(JSON.stringify(d), original);
  copy.restrictions = [];
  const cleared = await solveMissionDocument(copy);
  const c = cleared.candidates.find((c) => c.status === 'feasible_model');
  assert.ok(c);
  assert.ok(
    (await validateExportedCandidate(cleared.document, c)).every(
      (c) => c.status !== 'fail',
    ),
  );
});
