import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  missionDateFromLocal,
  missionLocalDate,
} from '../lib/planner/mission-date-input.ts';
import {
  expertCandidateGroups,
  expertEventText,
} from '../lib/planner/expert-presentation.ts';
import {
  buildMissionDiagnosticArchive,
  buildMissionArchive,
  readStoredZip,
  verifyArchiveFiles,
} from '../lib/planner/mission-archive.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { DEMONSTRATION_SCENARIOS } from '../lib/planner/mission-showcase.ts';

void test('calendar uses mission timezone, not workstation timezone', () => {
  assert.equal(
    missionLocalDate('2026-06-15T09:00:00Z', 'Asia/Vladivostok'),
    '2026-06-15T19:00:00',
  );
  assert.equal(
    missionDateFromLocal('2026-06-15T19:00', 'Asia/Vladivostok'),
    '2026-06-15T09:00:00.000Z',
  );
  assert.equal(
    missionDateFromLocal('2026-09-23T01:15:32', 'Europe/Moscow'),
    '2026-09-22T22:15:32.000Z',
  );
  assert.equal(missionLocalDate('invalid', 'UTC'), '');
  assert.throws(() => missionDateFromLocal('2026-02-31T10:00', 'UTC'));
  assert.throws(() => missionDateFromLocal('2026-06-15T19:00', 'not/a-zone'));
});
void test('calendar rejects ambiguous or missing daylight-saving times', () => {
  assert.throws(() =>
    missionDateFromLocal('2026-03-29T02:30', 'Europe/Berlin'),
  );
  assert.throws(() =>
    missionDateFromLocal('2026-10-25T02:30', 'Europe/Berlin'),
  );
  assert.equal(
    missionDateFromLocal('2026-10-25T04:30', 'Europe/Berlin'),
    '2026-10-25T03:30:00.000Z',
  );
});
void test('expert grouping merges scheduling jitter but preserves geometry, safety and originals', async () => {
  const d = DEMONSTRATION_SCENARIOS[0].create();
  const a = (await solveMissionDocument(d)).candidates[0];
  assert.equal(a.status, 'feasible_model');
  const b = structuredClone(a);
  b.id = 'second';
  b.objective = 'flightTime';
  b.plan.scenario.objective = 'flightTime';
  b.sorties.at(-1)!.startSec += 0.01;
  b.sorties.at(-1)!.endSec += 0.01;
  b.sorties.at(-1)!.readySec += 0.01;
  b.sorties.at(-1)!.segments.forEach((s) => {
    s.startSec += 0.01;
    s.endSec += 0.01;
  });
  b.metrics.makespanSec += 0.01;
  const before = JSON.stringify([a, b]);
  const groups = expertCandidateGroups([a, b], b.id);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].near, true);
  assert.equal(groups[0].representative, b);
  assert.equal(JSON.stringify([a, b]), before);
  const balanced = structuredClone(a);
  balanced.id = 'balanced';
  balanced.assumptions.push('Explicit ranking explanation');
  assert.equal(expertCandidateGroups([a, b, balanced]).length, 2);
  assert.equal(
    expertCandidateGroups(
      [a, b, balanced],
      'balanced',
      'Explicit ranking explanation',
    ).length,
    1,
  );
  assert.equal(balanced.assumptions.at(-1), 'Explicit ranking explanation');
  const different = structuredClone(b);
  different.sorties[0].segments[0].altitudeToM += 1;
  assert.equal(expertCandidateGroups([a, different]).length, 2);
  different.sorties = structuredClone(b.sorties);
  different.checks[0].status = 'fail';
  assert.equal(expertCandidateGroups([a, different]).length, 2);
  const event = a.events.find((e) => e.type === 'service')!;
  assert.match(
    expertEventText(event, d, a),
    /Проверка перед повторным вылетом/,
  );
  assert.equal(
    event.detail,
    a.events.find((e) => e.type === 'service')!.detail,
  );
});
void test('rejected demo exports honest, verifiable diagnostics, never successful evidence', async () => {
  const d = DEMONSTRATION_SCENARIOS[2].create();
  const c = (await solveMissionDocument(d)).candidates[0];
  assert.notEqual(c.status, 'feasible_model');
  const archive = await buildMissionDiagnosticArchive(d, c);
  const files = readStoredZip(archive.bytes);
  assert.equal(
    (await verifyArchiveFiles(files)).status,
    'diagnostic-only-not-flight-approved',
  );
  assert.equal(
    JSON.parse(files['data/diagnostic.json']).executionCompleted,
    false,
  );
  assert.ok(!files['data/run/report.json']);
  const forged = { ...files, 'data/report.html': '<h1>Успех</h1>' };
  await assert.rejects(() => verifyArchiveFiles(forged));
  await assert.rejects(() => buildMissionArchive(d, c));
  const good = (await solveMissionDocument(DEMONSTRATION_SCENARIOS[0].create()))
    .candidates[0];
  await assert.rejects(() => buildMissionDiagnosticArchive(d, good));
});
void test('expert report keeps failed and unknown checks visible and hides legacy summary only', async () => {
  const ui = await readFile(
    'components/planner/mission-expert-report.tsx',
    'utf8',
  );
  assert.match(ui, /Не подтверждено/);
  assert.match(ui, /Нарушение/);
  assert.match(ui, /Выполнение ещё не завершено/);
  assert.match(ui, /выполнение не запускалось/);
  const css = await readFile('app/planner/mission-expert.css', 'utf8');
  assert.match(css, /grid-column: 2;\s*grid-row: 1/);
  assert.doesNotMatch(css, /\.mw-check[^{}]*\{[^}]*display:\s*none/);
});
