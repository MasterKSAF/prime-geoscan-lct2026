import type { Check, Vehicle } from './schema.ts';
import type { MissionDocument, ScheduledSortie } from './mission-schema.ts';

export function maintenancePolicy(model: Vehicle['model']) {
  if (model === '201')
    return {
      unit: 'flights' as const,
      limit: 80,
      source:
        'Ответ экспертов Геоскан в чате трека, 23.09.2026, 16:22: 201/401 — каждые 80 полётов.',
    };
  if (model === '801')
    return {
      unit: 'hours' as const,
      limit: 160,
      source:
        'Ответ экспертов Геоскан в чате трека, 23.09.2026, 16:22: 501/801 — каждые 160 часов налёта.',
    };
  if (model === 'Gemini')
    return {
      unit: 'hours' as const,
      limit: 160,
      source:
        'РЭ Gemini, 28.05.2026, с. 9: проверка и ТО рекомендованы при 160 ч суммарного налёта. Стенд консервативно применяет этот интервал после ТО. https://download.geoscan.ru/site-files/gemini/Geoscan_Gemini_Manual.pdf',
    };
  return null;
}

/** Counters are aircraft usage; never battery cycles or a takeoff cost penalty. */
export function maintenanceProjection(
  vehicle: Vehicle,
  flights: number,
  seconds: number,
) {
  const policy = maintenancePolicy(vehicle.model),
    before = vehicle.maintenance;
  const after = before
    ? {
        ...before,
        flightsSinceService: before.flightsSinceService + flights,
        flightSecondsSinceService: before.flightSecondsSinceService + seconds,
      }
    : undefined;
  const value =
    !after || !policy
      ? null
      : policy.unit === 'flights'
        ? after.flightsSinceService
        : after.flightSecondsSinceService / 3600;
  return {
    vehicleId: vehicle.id,
    policy,
    before: before ?? null,
    after: after ?? null,
    withinLimit:
      value === null || !policy ? null : value <= policy.limit + 1e-8,
  };
}

export function maintenanceChecks(
  d: MissionDocument,
  sorties: readonly ScheduledSortie[],
): Check[] {
  return [...new Set(sorties.map((s) => s.vehicleId))].flatMap((id) => {
    const v = d.scenario.vehicles.find((v) => v.id === id);
    if (!v) return [];
    const own = sorties.filter((s) => s.vehicleId === id);
    const row = maintenanceProjection(
      v,
      own.length,
      own.reduce((n, s) => n + s.durationSec, 0),
    );
    return [
      {
        id: `MAINTENANCE_${id}`,
        title: `Ресурс до ТО · ${v.name}`,
        status:
          row.withinLimit === null
            ? ('unknown' as const)
            : row.withinLimit
              ? ('pass' as const)
              : ('fail' as const),
        detail:
          row.withinLimit === null
            ? 'Нет счётчика наработки или интервала для этой модели. Автоматическая оценка ТО не выполнялась.'
            : `После миссии: ${row.after!.flightsSinceService} полётов, ${(row.after!.flightSecondsSinceService / 3600).toFixed(2)} ч после ТО. Предел: ${row.policy!.limit} ${row.policy!.unit === 'flights' ? 'полётов' : 'ч'}. ${row.policy!.source}${row.withinLimit ? '' : ' Нужен другой аппарат либо обслуживание с обновлением счётчика в парке.'}`,
      },
    ];
  });
}

/** Recompute from the immutable run input, so checkpoints cannot double-count. */
export function maintenanceAtProgress(
  vehicle: Vehicle,
  sorties: readonly ScheduledSortie[],
  timeSec: number,
  recovery?: { sorties: readonly ScheduledSortie[]; progressSec: number },
) {
  if (!vehicle.maintenance) return undefined;
  const own = sorties.filter(
    (s) => s.vehicleId === vehicle.id && s.startSec < timeSec,
  );
  const seconds = own.reduce(
    (n, s) => n + Math.max(0, Math.min(timeSec, s.endSec) - s.startSec),
    0,
  );
  const returnSeconds =
    recovery?.sorties
      .filter((s) => s.vehicleId === vehicle.id)
      .reduce(
        (n, s) =>
          n +
          Math.max(0, Math.min(recovery.progressSec, s.endSec) - s.startSec),
        0,
      ) ?? 0;
  return (
    maintenanceProjection(vehicle, own.length, seconds + returnSeconds).after ??
    undefined
  );
}
