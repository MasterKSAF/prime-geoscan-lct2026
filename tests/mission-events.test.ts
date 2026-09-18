import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { buildMissionEvents } from '../lib/planner/mission-events.ts';
import type { ScheduledSortie } from '../lib/planner/mission-schema.ts';
import type { Segment } from '../lib/planner/schema.ts';

function sortie(
  id: string,
  vehicleId: string,
  batteryId: string,
  startSec: number,
): ScheduledSortie {
  const endSec = startSec + 10;
  const segment: Segment = {
    from: [30, 60],
    to: [30, 60],
    phase: 'survey',
    altitudeFromM: 100,
    altitudeToM: 100,
    airspeedMps: 10,
    groundSpeedMps: 10,
    distanceM: 80,
    startSec: startSec + 1,
    endSec: endSec - 1,
    batteryFromPct: 95.45,
    batteryToPct: 33.36,
    stripId: 7,
  };
  return {
    id,
    vehicleId,
    batteryId,
    jobId: 'rgb-01',
    name: id,
    startSec,
    endSec,
    readySec: endSec + 5,
    durationSec: 10,
    distanceM: 80,
    remainingPct: 33.36,
    strips: 1,
    shots: 1,
    segments: [
      { ...segment, phase: 'takeoff', startSec, endSec: startSec + 1 },
      segment,
      { ...segment, phase: 'landing', startSec: endSec - 1, endSec },
    ],
  };
}

function fixture() {
  const document = demoMission(1);
  document.planning.preparationSec = 10;
  document.planning.serviceSec = 5;
  document.batteries[0].rechargeSec = 60;
  document.batteries[1].rechargeSec = 60;
  const first = sortie('first', 'gemini-1', document.batteries[0].id, 10);
  const second = sortie('second', 'gemini-1', document.batteries[1].id, 30);
  const other = sortie('other', 'gemini-2', document.batteries[3].id, 10);
  return { document, sorties: [second, other, first] };
}

void test('mission events preserve chronology, equal-time order and repeated sortie readiness', () => {
  const { document, sorties } = fixture();
  const before = structuredClone({ document, sorties });
  const events = buildMissionEvents(document, sorties);
  assert.deepEqual({ document, sorties }, before);
  assert.equal(events.length, 24);
  for (let i = 1; i < events.length; i++) {
    const previous = events[i - 1],
      current = events[i];
    assert.ok(
      current.timeSec > previous.timeSec ||
        (current.timeSec === previous.timeSec &&
          current.vehicleId.localeCompare(previous.vehicleId) >= 0),
    );
  }
  assert.deepEqual(
    events.filter((e) => e.timeSec === 10).map((e) => [e.vehicleId, e.type]),
    [
      ['gemini-1', 'battery'],
      ['gemini-1', 'takeoff'],
      ['gemini-2', 'battery'],
      ['gemini-2', 'takeoff'],
    ],
  );
  assert.deepEqual(
    events
      .filter((e) => e.type === 'prepare')
      .map((e) => [e.sortieId, e.timeSec]),
    [
      ['first', 0],
      ['other', 0],
      ['second', 25],
    ],
  );
  assert.deepEqual(
    events
      .filter((e) => e.type === 'survey')
      .map((e) => [e.sortieId, e.timeSec]),
    [
      ['first', 11],
      ['other', 11],
      ['second', 31],
    ],
  );
  assert.equal(
    events.find((e) => e.type === 'prepare' && e.sortieId === 'first')?.detail,
    'Подготовка 10 с и ожидание разрешённого старта; модельный стенд.',
  );
  assert.equal(
    events.find((e) => e.type === 'service' && e.sortieId === 'first')?.detail,
    'Обслуживание 5 с; БВС доступен не ранее t=25.0 с.',
  );
  assert.equal(
    events.find((e) => e.type === 'prepare' && e.sortieId === 'second')?.detail,
    'Наземное обслуживание завершено; ожидание следующего вылета.',
  );
});

void test('one charger queues batteries and flight completion does not wait for recharge', () => {
  const { document, sorties } = fixture();
  const events = buildMissionEvents(document, sorties);
  assert.deepEqual(
    events
      .filter(
        (e) => e.type === 'battery' && !e.detail.startsWith('Установлена'),
      )
      .map((e) => [e.sortieId, e.batteryId, e.timeSec]),
    [
      ['first', document.batteries[0].id, 20],
      ['first', document.batteries[0].id, 80],
      ['second', document.batteries[1].id, 80],
      ['second', document.batteries[1].id, 140],
    ],
  );
  assert.deepEqual(
    events
      .filter((e) => e.type === 'complete')
      .map((e) => [e.sortieId, e.timeSec]),
    [
      ['other', 20],
      ['second', 40],
    ],
  );
  assert.deepEqual(
    events
      .filter((e) => e.timeSec === 20 && e.vehicleId === 'gemini-1')
      .map((e) => e.type),
    ['landing', 'service', 'battery'],
  );
  assert.deepEqual(
    events
      .filter((e) => e.timeSec === 40 && e.vehicleId === 'gemini-1')
      .map((e) => e.type),
    ['landing', 'service', 'complete'],
  );
  assert.deepEqual(buildMissionEvents(document, []), []);
});
