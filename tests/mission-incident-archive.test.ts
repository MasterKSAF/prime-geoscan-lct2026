import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { createMissionOperations } from '../lib/planner/mission-operations.ts';
import {
  buildIncidentArchive,
  readStoredZip,
  verifyArchiveFiles,
} from '../lib/planner/mission-archive.ts';
import {
  sha256,
  sha256Text,
  MISSION_ENGINE_VERSION,
} from '../lib/planner/mission-schema.ts';
import { recoveryOptions } from '../lib/planner/mission-safety.ts';
import { recoveryPreflight } from '../lib/planner/mission-recovery-preflight.ts';

const fixture = (async () => {
  const d = SHOWCASE_SCENARIOS.find((s) => s.id === 'area-with-hole')!.create();
  d.name = 'Диагностика <проверка>';
  const result = await solveMissionDocument(d),
    candidate = result.candidates[0];
  assert.equal(candidate.status, 'feasible_model');
  const seg = candidate.sorties[0].segments.find((s) => s.phase === 'survey')!;
  return { d, candidate, at: (seg.startSec + seg.endSec) / 2 };
})();
async function incident(wind: number) {
  const { d, candidate, at } = await fixture;
  const operations = createMissionOperations({
    indexedDB: new IDBFactory(),
    now: () => new Date('2026-09-23T17:00:00Z'),
  });
  try {
    let op = await operations.enqueue({
      id: `diagnostic-${wind}`,
      document: d,
      candidate,
      approval: {
        inputHash: await sha256(d),
        planHash: await sha256(candidate),
        candidateId: candidate.id,
        approvedAt: '2026-09-23T17:00:00Z',
      },
    });
    op = await operations.start(op.id, op.revision);
    op = await operations.pause(op.id, op.revision, at);
    op = await operations.safetyChange(op.id, op.revision, {
      type: 'detect',
      id: crypto.randomUUID(),
      kind: 'wind',
      windMps: wind,
      batteryPct: 100,
      vehicleId: candidate.sorties[0].vehicleId,
    });
    return op;
  } finally {
    operations.close();
  }
}
void test('incident ZIP is self-contained and replays a blocked event without claiming success', async () => {
  const op = await incident(30);
  assert.equal(op.safety?.stage, 'blocked');
  const before = JSON.stringify(op),
    archive = await buildIncidentArchive(op, [], { browser: 'test' });
  const files = readStoredZip(archive.bytes);
  const result = await verifyArchiveFiles(files);
  assert.equal(result.status, 'incident-diagnostic-reproduced');
  assert.equal(result.flightReady, false);
  for (const path of [
    'input/mission.json',
    'plan/candidate.json',
    'incident/operation.json',
    'incident/fleet-at-event.json',
    'incident/recovery.json',
    'incident/map.geojson',
    'incident/journal.json',
    'incident/other-operations.json',
    'checks/recovery-preflight.json',
    'report.html',
  ])
    assert.ok(files[`data/${path}`], path);
  assert.ok(files['data/report.html'].includes('&lt;проверка&gt;'));
  assert.ok(op.safety!.batteryPct < 100);
  assert.equal(JSON.stringify(op), before);
  files['data/incident/fleet-at-event.json'] = '[]';
  await assert.rejects(verifyArchiveFiles(files), /Контрольная сумма/);
  files['manifest-sha256.txt'] =
    (
      await Promise.all(
        Object.entries(files)
          .filter(([p]) => p.startsWith('data/'))
          .map(async ([p, t]) => `${await sha256Text(t)}  ${p}`),
      )
    ).join('\n') + '\n';
  files['tagmanifest-sha256.txt'] =
    (
      await Promise.all(
        ['bagit.txt', 'bag-info.txt', 'manifest-sha256.txt'].map(
          async (p) => `${await sha256Text(files[p])}  ${p}`,
        ),
      )
    ).join('\n') + '\n';
  await assert.rejects(verifyArchiveFiles(files), /не совпадает/);
});
void test('incident ZIP preserves successful return paths, coordinates and original event binding', async () => {
  const op = await incident(4);
  assert.equal(op.safety?.stage, 'returning');
  const { files } = await buildIncidentArchive(op);
  const options = JSON.parse(files['data/incident/recovery.json']);
  assert.deepEqual(
    options,
    recoveryOptions(op.document, op.candidate, op.safety!),
  );
  assert.ok(
    JSON.parse(files['data/incident/map.geojson']).features.some(
      (f: { properties: { role: string } }) =>
        f.properties.role === 'recovery-route',
    ),
  );
  const metadata = JSON.parse(files['data/incident/metadata.json']);
  assert.equal(metadata.replayEngine, MISSION_ENGINE_VERSION);
  assert.ok(Object.values(metadata.binding).every((v) => v === true));
  assert.equal(
    (await verifyArchiveFiles(files)).status,
    'incident-diagnostic-reproduced',
  );
});
void test('preflight checks launch transitions and reports its sampled scope honestly', async () => {
  const { d, candidate } = await fixture;
  const result = recoveryPreflight(d, candidate);
  assert.equal(result.valid, true);
  assert.ok(result.samples.length > 1);
  assert.match(result.scope, /не доказательство/);
  const blocked = structuredClone(d);
  blocked.scenario.wind.speedMps = 30;
  const guard = recoveryPreflight(blocked, candidate);
  assert.equal(guard.valid, false);
  assert.ok(
    guard.samples.some((s) => s.reasons.some((r) => r.includes('ветер'))),
  );
});
