import type { MissionCandidate, MissionDocument } from './mission-schema.ts';
import { vehiclePlanningEligibility } from './fixed-wing-profile.ts';
import { isVehicleReserved } from './mission-resource-reservations.ts';

export function alternativeLimitExplanation(
  d: MissionDocument,
  candidates: MissionCandidate[],
  distinctCount: number,
): string | null {
  if (
    distinctCount >= 3 ||
    !candidates.some((c) => c.status === 'feasible_model')
  )
    return null;
  const scarce = d.jobs.filter(
    (j) =>
      d.scenario.vehicles.filter(
        (v) =>
          v.enabled &&
          !isVehicleReserved(d, v.id) &&
          v.jobs.includes(j.job.type) &&
          vehiclePlanningEligibility(v).supported &&
          (!j.assignedVehicleIds.length ||
            j.assignedVehicleIds.includes(v.id)) &&
          d.scenario.wind.speedMps <= v.maxWindMps,
      ).length === 1,
  );
  const summary =
    distinctCount === 1
      ? 'Все три критерия выбрали один маршрут. Показываем его один раз.'
      : 'Найдено два разных плана. Вариант «Уложиться в срок» совпал с одним из них.';
  return (
    summary +
    (scarce.length
      ? ` Для ${scarce.length === 1 ? 'одной работы подходит только один БВС' : `${scarce.length} работ доступно по одному подходящему БВС`}.`
      : ' Отдельного третьего варианта с другой выгодой в пределах поиска не найдено.')
  );
}

/** Actual overlapping flight intervals; a fleet of three is not necessarily parallel. */
export function concurrentVehicleCount(
  candidate: Pick<MissionCandidate, 'sorties'>,
): number {
  const events = candidate.sorties
    .flatMap((s) => [
      { time: s.startSec, id: s.vehicleId, delta: 1 },
      { time: s.endSec, id: s.vehicleId, delta: -1 },
    ])
    .sort((a, b) => a.time - b.time || a.delta - b.delta);
  const active = new Map<string, number>();
  let maximum = 0;
  for (const e of events) {
    const count = (active.get(e.id) ?? 0) + e.delta;
    if (count <= 0) active.delete(e.id);
    else active.set(e.id, count);
    maximum = Math.max(maximum, active.size);
  }
  return maximum;
}

export function missionFleetLabel(
  document: MissionDocument,
  candidate: MissionCandidate,
): string {
  const used = new Set(candidate.sorties.map((s) => s.vehicleId));
  const models = new Map<string, number>();
  for (const v of document.scenario.vehicles.filter((v) => used.has(v.id))) {
    const label = v.model === 'Custom' ? v.name : `Геоскан ${v.model}`;
    models.set(label, (models.get(label) ?? 0) + 1);
  }
  return (
    [...models].map(([model, count]) => `${model} × ${count}`).join(' · ') ||
    'БВС не назначены'
  );
}
