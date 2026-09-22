import test from 'node:test';
import assert from 'node:assert/strict';
import {
  operationJournal,
  type OperationJournalSource,
} from '../lib/planner/mission-operation-journal.ts';

const source = (id = 'run-a'): OperationJournalSource => ({
  id,
  status: 'paused',
  progressSec: 15,
  createdAt: '2026-09-20T10:00:00Z',
  updatedAt: '2026-09-20T10:01:00Z',
  startedAt: '2026-09-20T10:00:05Z',
  finishedAt: null,
  candidate: {
    events: [
      { timeSec: 5, type: 'takeoff', vehicleId: 'drone-a', detail: 'Взлёт' },
      { timeSec: 10, type: 'survey', vehicleId: 'drone-a', detail: 'Съёмка' },
      { timeSec: 20, type: 'landing', vehicleId: 'drone-a', detail: 'Посадка' },
    ],
  },
});

await test('queued mission has no flight events before explicit start, including events at zero', () => {
  const row = source();
  row.status = 'scheduled';
  row.startedAt = null;
  row.progressSec = 0;
  row.candidate.events[0].timeSec = 0;
  assert.equal(operationJournal(row).modelEvents.length, 0);
});

await test('journal shows only this run and elapsed model events without rewriting snapshot', () => {
  const row = source(),
    before = structuredClone(row),
    journal = operationJournal(row);
  assert.equal(journal.operationId, 'run-a');
  assert.equal(journal.modelOnly, true);
  assert.deepEqual(
    journal.modelEvents.map((e) => e.timeSec),
    [5, 10],
  );
  assert.deepEqual(row, before);
  const other = source('run-b');
  other.progressSec = 0;
  assert.equal(operationJournal(other).modelEvents.length, 0);
  assert.equal(journal.modelEvents.length, 2);
});
await test('incident cuts off nominal future while preserving logged incident and decision', () => {
  const row = source();
  row.progressSec = 30;
  row.safety = {
    id: 'dd864769-4b89-443b-bfd5-7686414b3431',
    source: 'simulation',
    kind: 'wind',
    vehicleId: 'drone-a',
    modelTimeSec: 8,
    detectedAt: '2026-09-20T10:00:20Z',
    windMps: 12,
    batteryPct: 70,
    stage: 'returning',
    delaySec: 60,
    policy: 'home',
    progressSec: 22,
    decision: 'operator',
    events: [
      { at: '2026-09-20T10:00:20Z', text: 'Изменился ветер' },
      { at: '2026-09-20T10:00:30Z', text: 'Оператор выбрал возврат' },
    ],
  };
  const journal = operationJournal(row);
  assert.deepEqual(
    journal.modelEvents.map((e) => e.timeSec),
    [5],
  );
  assert.deepEqual(
    journal.controlEvents
      .filter((e) => e.kind === 'incident')
      .map((e) => e.text),
    ['Изменился ветер', 'Оператор выбрал возврат'],
  );
});
await test('terminal snapshot records finish but never fabricates past pause actions', () => {
  const row = source();
  row.status = 'completed';
  row.progressSec = 20;
  row.finishedAt = row.updatedAt;
  const journal = operationJournal(row);
  assert.equal(journal.modelEvents.length, 3);
  assert.equal(journal.controlEvents.at(-1)?.text, 'Завершена');
  assert.equal(
    journal.controlEvents.some((e) => e.text.includes('Пауза')),
    false,
  );
});
