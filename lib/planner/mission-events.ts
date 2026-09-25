import type {
  MissionDocument,
  MissionEvent,
  ScheduledSortie,
} from './mission-schema.ts';
import { segmentJobId, sortieJobIds } from './mission-sortie-jobs.ts';

export function buildMissionEvents(
  d: MissionDocument,
  sorties: ScheduledSortie[],
): MissionEvent[] {
  const events: MissionEvent[] = [];
  for (const sortie of sorties) {
    const previous = sorties
      .filter(
        (s) => s.vehicleId === sortie.vehicleId && s.endSec < sortie.startSec,
      )
      .sort((a, b) => a.endSec - b.endSec)
      .at(-1);
    events.push({
      timeSec: previous ? previous.readySec : 0,
      type: 'prepare',
      vehicleId: sortie.vehicleId,
      sortieId: sortie.id,
      batteryId: sortie.batteryId,
      detail: previous
        ? 'Наземное обслуживание завершено; ожидание следующего вылета.'
        : `Подготовка ${d.planning.preparationSec} с и ожидание разрешённого старта; модельный стенд.`,
    });
    events.push({
      timeSec: sortie.startSec,
      type: 'battery',
      vehicleId: sortie.vehicleId,
      sortieId: sortie.id,
      batteryId: sortie.batteryId,
      detail: `${d.planning.batteryPolicy ? 'Текущая батарея' : 'Установлена'} ${sortie.batteryId}; заряд ${sortie.segments[0].batteryFromPct.toFixed(1)}%.`,
    });
    events.push({
      timeSec: sortie.startSec,
      type: 'takeoff',
      vehicleId: sortie.vehicleId,
      sortieId: sortie.id,
      batteryId: sortie.batteryId,
      detail: `Начало вылета по работам ${sortieJobIds(sortie).join(', ')}.`,
    });
    for (const seg of sortie.segments.filter((s) => s.phase === 'survey'))
      events.push({
        timeSec: seg.startSec,
        type: 'survey',
        vehicleId: sortie.vehicleId,
        sortieId: sortie.id,
        batteryId: sortie.batteryId,
        detail: `Рабочая полоса ${seg.stripId}; работа ${segmentJobId(sortie, seg)}; модельное срабатывание сенсора.`,
      });
    events.push({
      timeSec: sortie.endSec,
      type: 'landing',
      vehicleId: sortie.vehicleId,
      sortieId: sortie.id,
      batteryId: sortie.batteryId,
      detail: `Посадка; остаток ${sortie.remainingPct.toFixed(1)}%.`,
    });
    events.push({
      timeSec: sortie.endSec,
      type: 'service',
      vehicleId: sortie.vehicleId,
      sortieId: sortie.id,
      batteryId: sortie.batteryId,
      detail: `Обслуживание ${d.planning.serviceSec} с; БВС доступен не ранее t=${sortie.readySec.toFixed(1)} с.`,
    });
  }
  for (const vehicle of d.scenario.vehicles) {
    const flights = sorties
      .filter((s) => s.vehicleId === vehicle.id)
      .sort((a, b) => a.endSec - b.endSec);
    let chargerReady = 0;
    for (const sortie of flights) {
      const battery = d.batteries.find((b) => b.id === sortie.batteryId);
      if (battery?.rechargeSec !== null && battery?.rechargeSec !== undefined) {
        const start = Math.max(sortie.endSec, chargerReady),
          end = start + battery.rechargeSec;
        events.push({
          timeSec: start,
          type: 'battery',
          vehicleId: vehicle.id,
          sortieId: sortie.id,
          batteryId: battery.id,
          detail: `Начало модельной зарядки ${battery.id}; последовательный зарядник. Реальный заряд не измеряется.`,
        });
        events.push({
          timeSec: end,
          type: 'battery',
          vehicleId: vehicle.id,
          sortieId: sortie.id,
          batteryId: battery.id,
          detail: `Модельная зарядка завершена; ${battery.id} доступна с расчётными 100%.`,
        });
        chargerReady = end;
      }
    }
    const last = flights.at(-1);
    if (last)
      events.push({
        timeSec: last.endSec,
        type: 'complete',
        vehicleId: vehicle.id,
        sortieId: last.id,
        batteryId: last.batteryId,
        detail:
          'Последний назначенный модельный вылет завершён. Получение и копирование реальных материалов съёмки не подтверждено.',
      });
  }
  events.sort(
    (a, b) => a.timeSec - b.timeSec || a.vehicleId.localeCompare(b.vehicleId),
  );
  return events;
}
