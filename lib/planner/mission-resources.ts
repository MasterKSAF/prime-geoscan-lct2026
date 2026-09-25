import type {
  MissionDocument,
  MissionCandidate,
  MissionResult,
} from './mission-schema.ts';
import { maintenanceProjection } from './mission-maintenance.ts';

export function flightTimeBreakdown(candidate: MissionCandidate) {
  const result = {
    surveySec: 0,
    transitReturnSec: 0,
    maneuversSec: 0,
    airborneWaitingSec: 0,
    totalSec: 0,
  };
  for (const sortie of candidate.sorties)
    for (const s of sortie.segments) {
      const dt = s.endSec - s.startSec;
      const stationary =
        s.distanceM < 1e-6 && Math.abs(s.altitudeToM - s.altitudeFromM) < 1e-6;
      if (s.phase === 'survey') result.surveySec += dt;
      else if (
        stationary &&
        s.phase !== 'turn' &&
        Math.max(s.altitudeFromM, s.altitudeToM) > 0
      )
        result.airborneWaitingSec += dt;
      else if (s.phase === 'transit' || s.phase === 'return')
        result.transitReturnSec += dt;
      else result.maneuversSec += dt;
      result.totalSec += dt;
    }
  return result;
}

export function missionResourceReport(d: MissionDocument, c: MissionCandidate) {
  const deadlineSec =
    (Date.parse(d.window.end) - Date.parse(d.window.start)) / 1000;
  const ids = [...new Set(c.sorties.map((s) => s.vehicleId))];
  return {
    schema: 'mission-resources-v1',
    maxVehicles: d.planning.maxVehicles ?? null,
    selectedVehicles: ids,
    deadline: d.window.end,
    timezone: d.window.timezone,
    deadlineSec,
    fullPlan: c.status === 'feasible_model',
    withinVehicleLimit: ids.length <= (d.planning.maxVehicles ?? 20),
    deadlineMet:
      c.status === 'feasible_model' &&
      c.metrics.makespanSec <= deadlineSec + 1e-6,
    makespanSec: c.metrics.makespanSec,
    slackSec: deadlineSec - c.metrics.makespanSec,
    airborne: flightTimeBreakdown(c),
    maintenance: d.scenario.vehicles
      .filter((v) => ids.includes(v.id))
      .map((v) => {
        const own = c.sorties.filter((s) => s.vehicleId === v.id);
        return maintenanceProjection(
          v,
          own.length,
          own.reduce((n, s) => n + s.durationSec, 0),
        );
      }),
    accounting:
      'Налёт — сумма времени в воздухе всех БВС, включая переходы, возврат, взлёт, посадку и манёвры. Наземные ожидания входят во время завершения, но не в налёт. Штрафа за взлёт нет.',
    scope:
      'Лучший найденный проверенный план в ограниченном поиске. Отсутствие плана не доказывает невозможность; глобальная оптимальность не доказана.',
  };
}

export function missionResourceHtml(d: MissionDocument, c: MissionCandidate) {
  const r = missionResourceReport(d, c),
    m = (n: number) => (n / 60).toFixed(1);
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c]!,
    );
  return `<section><h2>Группа, срок и налёт</h2><p>Назначено ${r.selectedVehicles.length} БВС; лимит: ${r.maxVehicles ?? 'автовыбор'}. Завершить до ${escape(r.deadline)} (${escape(r.timezone)}). ${r.deadlineMet ? `План укладывается в срок; запас ${m(r.slackSec)} мин.` : 'Полный план к сроку не получен.'}</p><table><tr><th>Съёмка</th><th>Переходы и возврат</th><th>Взлёт, посадка, манёвры</th><th>Ожидание в воздухе</th><th>Всего налёта</th></tr><tr>${[r.airborne.surveySec, r.airborne.transitReturnSec, r.airborne.maneuversSec, r.airborne.airborneWaitingSec, r.airborne.totalSec].map((s) => `<td>${m(s)} мин</td>`).join('')}</tr></table><p>${r.accounting}</p><p>Счётчики ТО, ID аппаратов и точные значения: <a href="analysis/resources.json">analysis/resources.json</a>. ${r.scope}</p></section>`;
}

export function buildResourceStudy(
  d: MissionDocument,
  pool: readonly MissionCandidate[],
  searchedCaps: ReadonlySet<number>,
): NonNullable<MissionResult['resourceStudy']> {
  const cap = d.planning.maxVehicles ?? d.scenario.vehicles.length;
  const limits = [...new Set([1, 2, 3, cap])]
    .filter((n) => n <= cap)
    .sort((a, b) => a - b);
  return {
    maxVehicles: d.planning.maxVehicles ?? null,
    deadlineSec: (Date.parse(d.window.end) - Date.parse(d.window.start)) / 1000,
    rows: limits.map((n) => {
      const winner = pool
        .filter(
          (c) =>
            c.status === 'feasible_model' &&
            new Set(c.sorties.map((s) => s.vehicleId)).size <= n,
        )
        .sort(
          (a, b) =>
            a.metrics.makespanSec - b.metrics.makespanSec ||
            a.metrics.flightTimeSec - b.metrics.flightTimeSec,
        )[0];
      return {
        maxVehicles: n,
        status: winner
          ? 'found'
          : searchedCaps.has(n)
            ? 'not_found'
            : 'not_searched',
        vehicleCount: winner?.metrics.vehicleCount ?? null,
        makespanSec: winner?.metrics.makespanSec ?? null,
        flightTimeSec: winner?.metrics.flightTimeSec ?? null,
      };
    }),
    scope:
      'Проверенные кандидаты общего ограниченного поиска, не полный перебор составов. «Не найдено» не означает «невозможно». Срок, заряд, сенсоры и безопасность не ослаблялись.',
  };
}
