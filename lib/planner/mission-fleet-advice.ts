import type { MissionDocument } from './mission-schema.ts';
import { isVehicleReserved } from './mission-resource-reservations.ts';
import { vehicleInMissionArea } from './demo-shared-fleet.ts';
import { vehiclePlanningEligibility } from './fixed-wing-profile.ts';
import { workLabels } from './mission-editing.ts';
import { resolveVehicleCamera } from './camera-profile.ts';

export type FleetAdvice = {
  jobId: string;
  title: string;
  detail: string;
  action: string;
  destination: 'fleet' | 'assignment';
};

/** Explain actual capability/availability, not a promise that a route exists. */
export function missionFleetAdvice(
  d: MissionDocument,
  suggestWiderAssignment = false,
): FleetAdvice[] {
  return d.jobs.flatMap<FleetAdvice>((job) => {
    const compatible = d.scenario.vehicles.filter(
      (v) =>
        v.jobs.includes(job.job.type) &&
        vehiclePlanningEligibility(v).supported,
    );
    const local = compatible.filter((v) => vehicleInMissionArea(d, v));
    const allowed = local.filter(
      (v) =>
        !job.assignedVehicleIds.length || job.assignedVehicleIds.includes(v.id),
    );
    const available = allowed.filter(
      (v) => v.enabled && !isVehicleReserved(d, v.id),
    );
    if (
      job.quality.mode === 'camera' &&
      available.length &&
      available.every(
        (v) =>
          (v.cameraProfiles !== undefined || v.cameraIds !== undefined) &&
          !resolveVehicleCamera(v, job.job.type).camera,
      )
    )
      return [
        {
          jobId: job.id,
          title: `${workLabels[job.job.type]}: настройте камеру`,
          detail: available
            .map((v) => resolveVehicleCamera(v, job.job.type).reason)
            .filter(Boolean)
            .join(' '),
          action:
            'Парк БВС → Доступность → выберите комплектацию → Камеры. Заполните недостающие параметры и сохраните. Затем пересчитайте миссию.',
          destination: 'fleet',
        },
      ];
    if (available.length) {
      if (
        suggestWiderAssignment &&
        job.assignedVehicleIds.length &&
        local.some(
          (v) =>
            v.enabled &&
            !isVehicleReserved(d, v.id) &&
            !job.assignedVehicleIds.includes(v.id),
        )
      )
        return [
          {
            jobId: job.id,
            title: `${workLabels[job.job.type]}: можно расширить выбор БВС`,
            detail: `Сейчас разрешены только: ${allowed.map((v) => `${v.name} · заряд ${v.batteryPct}%`).join(', ')}. В общем парке есть другие совместимые аппараты.`,
            action:
              'Редактор → выберите работу → БВС → Назначение «Автоматически». Планировщик проверит другие аппараты и группы.',
            destination: 'assignment',
          },
        ];
      return [];
    }
    const title = `${workLabels[job.job.type]}: нет доступного исполнителя`;
    if (allowed.some((v) => !v.enabled && !isVehicleReserved(d, v.id)))
      return [
        {
          jobId: job.id,
          title,
          detail: `Подходящие БВС выключены: ${allowed
            .filter((v) => !v.enabled)
            .map((v) => v.name)
            .join(', ')}.`,
          action:
            'Парк БВС → Доступность → включите нужные аппараты. Затем пересчитайте миссию.',
          destination: 'fleet' as const,
        },
      ];
    if (
      local.some((v) => v.enabled && !isVehicleReserved(d, v.id)) &&
      job.assignedVehicleIds.length
    )
      return [
        {
          jobId: job.id,
          title,
          detail: 'Ручное назначение исключает подходящие аппараты.',
          action:
            'Редактор → выберите работу → БВС → Назначение «Автоматически». Затем пересчитайте.',
          destination: 'assignment' as const,
        },
      ];
    if (allowed.some((v) => isVehicleReserved(d, v.id)))
      return [
        {
          jobId: job.id,
          title,
          detail: 'Подходящие аппараты заняты другими миссиями.',
          action:
            'Дождитесь их освобождения или выберите другой свободный аппарат. Повторный расчёт учтёт остаток батареи.',
          destination: 'fleet' as const,
        },
      ];
    return [
      {
        jobId: job.id,
        title,
        detail: compatible.length
          ? 'Подходящие аппараты находятся за пределами района полёта.'
          : `В парке нет установленного оборудования для работы «${workLabels[job.job.type]}».`,
        action: compatible.length
          ? 'Нужен аппарат на базе в этом районе. Автоматическое перебазирование не выполняется.'
          : 'Парк БВС → Доступность → выберите подходящую комплектацию. Для мультиспектра нужен Pollux; обычная RGB-камера его не заменяет.',
        destination: 'fleet' as const,
      },
    ];
  });
}
