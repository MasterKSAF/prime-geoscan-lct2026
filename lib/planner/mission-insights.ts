import type { MissionCandidate, MissionDocument } from './mission-schema.ts';
import { parseMissionDocument } from './mission-schema.ts';
import { missionFleetHints } from './mission-guidance.ts';
import { qualityForJob } from './quality.ts';
import { distance } from './geometry.ts';

/** Facts about the selected result, not a post-hoc claim of global optimality. */
export function explainMissionPlan(
  document: MissionDocument,
  candidate: MissionCandidate,
) {
  return document.scenario.vehicles.map((vehicle) => {
    const own = candidate.sorties.filter((s) => s.vehicleId === vehicle.id);
    const jobs = document.jobs.map((job) => {
      const hint = missionFleetHints(document, job.id).find(
        (v) => v.vehicleId === vehicle.id,
      )!;
      const reasons = [...hint.reasons];
      if (
        job.assignedVehicleIds.length &&
        !job.assignedVehicleIds.includes(vehicle.id)
      )
        reasons.push('Не входит в назначение оператора для этой работы');
      if (vehicle.batteryPct <= document.scenario.reservePct)
        reasons.push('Текущий заряд не превышает резерв миссии');
      reasons.push(
        ...qualityForJob(job, vehicle)
          .checks.filter((c) => c.status === 'fail')
          .map((c) => c.title),
      );
      const assigned = own.some((s) => s.jobId === job.id);
      return {
        jobId: job.id,
        name: job.name,
        assigned,
        reasons,
        message: assigned
          ? 'Входит в выбранный маршрут; допустимость проверяется для всего плана.'
          : reasons.length
            ? reasons.join(' · ')
            : 'Предварительно подходит, но в этом плане не назначен. Это не доказательство, что аппарат лишний.',
      };
    });
    return {
      vehicleId: vehicle.id,
      name: vehicle.name,
      model: vehicle.model,
      batteryPct: vehicle.batteryPct,
      assigned: own.length > 0,
      flightTimeSec: own.reduce((n, s) => n + s.durationSec, 0),
      sortieCount: own.length,
      minimumRemainingPct: own.length
        ? Math.min(...own.map((s) => s.remainingPct))
        : null,
      jobs,
    };
  });
}

export type MissionTrial = {
  id: string;
  title: string;
  change: string;
  kind: 'repair' | 'fleet-value';
  document: MissionDocument;
  /** Physical actions are hypotheses, never commands or fresh telemetry. */
  confirmation?: string[];
};

const payloadCatalog = [
  {
    model: 'Gemini',
    work: 'RGB',
    name: 'Geoscan PF1B',
    width: 23.5,
    height: 15.6,
    focal: 20,
    pixelsX: 6000,
    pixelsY: 4000,
    source:
      'https://download.geoscan.ru/site-files/gemini/Geoscan_Gemini_Manual.pdf',
  },
  {
    model: 'Gemini',
    work: 'MS',
    name: 'Geoscan Pollux',
    width: 4.968,
    height: 3.726,
    focal: 8,
    pixelsX: 1440,
    pixelsY: 1080,
    source: 'https://www.geoscan.ru/ru/products/gemini-m',
  },
] as const;

/** Explicit counterfactuals. Never relax separation, reserves or requested coverage.
 * Weather changes are separate conditional inputs, not revised observations. */
export function missionImprovementTrials(
  document: MissionDocument,
  candidate: MissionCandidate,
): MissionTrial[] {
  const trials: MissionTrial[] = [];
  const add = (
    id: string,
    title: string,
    change: string,
    kind: MissionTrial['kind'],
    mutate: (d: MissionDocument) => void,
    confirmation?: string[],
  ) => {
    const copy = structuredClone(document);
    mutate(copy);
    // Each solve has a bounded budget; the UI runs one trial only after a click.
    copy.planning.maxComputeMs = Math.min(copy.planning.maxComputeMs, 5000);
    try {
      trials.push({
        id,
        title,
        change,
        kind,
        document: parseMissionDocument(copy),
        ...(confirmation ? { confirmation } : {}),
      });
    } catch {
      /* Not a valid proposed input. */
    }
  };
  const feasible =
    candidate.status === 'feasible_model' &&
    !candidate.checks.some((c) => c.status === 'fail');
  if (!feasible) {
    // An installed pack is one resource. Do not add imaginary spare packs,
    // predict replacement duration or reset charge in the live fleet.
    for (const vehicle of document.scenario.vehicles
      .filter((v) => v.enabled && v.batteryPct < 100)
      .slice(0, 2)) {
      const installed = document.batteries.filter(
        (b) => b.vehicleId === vehicle.id,
      );
      if (installed.length !== 1 || !document.planning.batteryPolicy) continue;
      add(
        `battery-full-${vehicle.id}`,
        `Заменить батарею: ${vehicle.name}`,
        `${vehicle.id}: вместо текущих ${vehicle.batteryPct}% проверить 100% перед стартом. Будущая замена в полёте и время обслуживания не выдумываются.`,
        'repair',
        (d) => {
          d.scenario.vehicles.find((v) => v.id === vehicle.id)!.batteryPct =
            100;
          const battery = d.batteries.find((b) => b.id === installed[0].id)!;
          battery.initialPct = 100;
          battery.source =
            'ГИПОТЕЗА: установленная батарея заменена до старта и даёт 100%; состояние должно быть подтверждено заново.';
          d.notes =
            `ГИПОТЕЗА: батарея ${vehicle.id} = 100%. Перед реальным применением нужны подтверждение замены и свежее состояние парка.\n${d.notes}`.slice(
              0,
              2000,
            );
        },
        [
          'Это не команда замены и не обновление телеметрии.',
          `Подтвердить фактическую батарею, заряд и готовность ${vehicle.id} перед новым расчётом.`,
        ],
      );
    }
    for (const target of document.jobs) {
      if (
        document.scenario.vehicles.some(
          (v) => v.enabled && v.jobs.includes(target.job.type),
        )
      )
        continue;
      const fit = payloadCatalog.find(
        (p) =>
          p.work === target.job.type &&
          document.scenario.vehicles.some(
            (v) => v.enabled && v.model === p.model,
          ),
      );
      const vehicle =
        fit &&
        document.scenario.vehicles.find(
          (v) => v.enabled && v.model === fit.model,
        );
      if (!fit || !vehicle || target.quality.mode !== 'camera') continue;
      add(
        `payload-${vehicle.id}-${target.job.type.toLowerCase()}`,
        `Проверить ${fit.name}: ${vehicle.name}`,
        `${vehicle.id}: заменить камерную комплектацию на ${fit.name} для ${target.job.type}. Это не установка двух камер сразу; прежние виды работ этой комплектации исключаются.`,
        'repair',
        (d) => {
          const v = d.scenario.vehicles.find((v) => v.id === vehicle.id)!;
          v.jobs = [fit.work];
          v.assumptions = [
            ...v.assumptions.slice(0, 8),
            'ГИПОТЕЗА смены комплектации: реальный подвес, нагрузка, период кадров и ресурс после замены требуют подтверждения.',
          ];
          for (const j of d.jobs.filter((j) => j.job.type === fit.work)) {
            j.quality = {
              ...j.quality,
              status: 'assumed',
              sensorWidthMm: fit.width,
              sensorHeightMm: fit.height,
              focalLengthMm: fit.focal,
              imageWidthPx: fit.pixelsX,
              imageHeightPx: fit.pixelsY,
              source: `Каталожная геометрия ${fit.name}; комплектация и эксплуатационный ресурс гипотетические. ${fit.source}`,
            };
          }
          d.notes =
            `ГИПОТЕЗА: смена камеры на ${vehicle.id}; исходный ресурс сохранён лишь как непроверенное допущение. Сверить комплектацию и реальный ресурс.\n${d.notes}`.slice(
              0,
              2000,
            );
        },
        [
          'Паспортная совместимость модели не подтверждает наличие камеры и подходящего подвеса у конкретного БВС.',
          'Подтвердить массу, питание, ресурс, интервал кадров и фактическую комплектацию. Параметры качества задания не ослабляются.',
        ],
      );
      break;
    }
    if (document.jobs.some((j) => j.assignedVehicleIds.length))
      add(
        'auto-assignment',
        'Проверить автовыбор',
        'Разрешить подбор из имеющегося парка. Работы, заряд и ограничения остаются прежними.',
        'repair',
        (d) =>
          d.jobs.forEach((j) => {
            j.assignedVehicleIds = [];
          }),
      );
    // A weather snapshot is bound to its window. Never silently reuse it for
    // a longer task or turn a scope error into an optimization conclusion.
    if (
      !document.weather &&
      Date.parse(document.window.end) - Date.parse(document.window.start) <=
        7 * 86400000 - 1800000
    )
      add(
        'extra-time',
        'Проверить дополнительные 30 минут',
        'Продлить только конец окна работ на 30 минут. Временные запреты не сдвигаются.',
        'repair',
        (d) => {
          d.window.end = new Date(
            Date.parse(d.window.end) + 1800000,
          ).toISOString();
        },
      );
    const disabled = document.scenario.vehicles.find(
      (v) =>
        !v.enabled && document.jobs.some((j) => v.jobs.includes(j.job.type)),
    );
    if (disabled)
      add(
        `enable-${disabled.id}`,
        `Подключить к заданию: ${disabled.name}`,
        `${disabled.id} уже есть в заданном парке, но исключён из назначений. Проверить его участие без изменения заряда и характеристик.`,
        'repair',
        (d) => {
          d.scenario.vehicles.find((v) => v.id === disabled.id)!.enabled = true;
        },
        [
          'Подтвердить, что аппарат действительно доступен и не занят другой миссией.',
        ],
      );
    const movable = document.scenario.vehicles.find(
      (v) =>
        v.enabled && document.jobs.some((j) => v.jobs.includes(j.job.type)),
    );
    const alternateSite =
      movable &&
      document.scenario.reserveSites.find(
        (site) =>
          distance(site, movable.start) > 1 &&
          !document.scenario.vehicles.some(
            (v) =>
              v.id !== movable.id &&
              (distance(site, v.start) <
                document.planning.separationHorizontalM ||
                distance(site, v.landing) <
                  document.planning.separationHorizontalM),
          ),
      );
    if (movable && alternateSite)
      add(
        `alternate-base-${movable.id}`,
        `Проверить другую площадку: ${movable.name}`,
        `${movable.id}: наземное перебазирование до начала миссии в заданную резервную точку ${alternateSite[1].toFixed(5)}, ${alternateSite[0].toFixed(5)}. Расчёт не включает доставку БВС на площадку.`,
        'repair',
        (d) => {
          const v = d.scenario.vehicles.find((v) => v.id === movable.id)!;
          v.start = [...alternateSite];
          v.landing = [...alternateSite];
        },
        [
          'Площадка уже задана во входе, но её готовность и наземная доставка требуют подтверждения.',
          'Время и стоимость перебазирования не входят в сравнение полётного плана.',
        ],
      );
    // Do not reinterpret a stored forecast snapshot as better weather.
    const windLimits = document.scenario.vehicles
      .filter(
        (v) =>
          v.enabled && document.jobs.some((j) => v.jobs.includes(j.job.type)),
      )
      .map((v) => v.maxWindMps);
    if (
      !document.weather &&
      windLimits.length &&
      document.scenario.wind.speedMps > Math.min(...windLimits)
    ) {
      const threshold = Math.max(0, Math.min(...windLimits) - 1);
      add(
        'calmer-weather',
        `Проверить ветер не выше ${threshold} м/с`,
        `Условие: ветер ${threshold} м/с с прежнего направления вместо ${document.scenario.wind.speedMps} м/с. Это не прогноз и не обещание, что ветер стихнет в данном окне.`,
        'repair',
        (d) => {
          d.scenario.wind.speedMps = threshold;
          d.notes =
            `УСЛОВНАЯ ПОГОДА: ветер ${threshold} м/с; не наблюдение и не прогноз. Перед применением получить актуальные условия для того же участка и окна.\n${d.notes}`.slice(
              0,
              2000,
            );
        },
        [
          'Нужны новый прогноз или наблюдение для участка, высоты и окна миссии. Прочие ограничения погоды сохраняются.',
        ],
      );
    }
  } else {
    const used = [...new Set(candidate.sorties.map((s) => s.vehicleId))];
    for (const vehicleId of used.slice(0, 3)) {
      const v = document.scenario.vehicles.find(
        (item) => item.id === vehicleId,
      )!;
      if (document.scenario.vehicles.filter((item) => item.enabled).length < 2)
        break;
      add(
        `without-${vehicleId}`,
        `Без ${v.name}`,
        'Не назначать этот БВС. Он остаётся на площадке и учитывается как препятствие. Ручные назначения не меняются.',
        'fleet-value',
        (d) => {
          d.scenario.vehicles.find((item) => item.id === vehicleId)!.enabled =
            false;
        },
      );
    }
  }
  return trials;
}

export function compareMissionTrial(
  original: MissionCandidate,
  alternative: MissionCandidate,
) {
  const admissible = (c: MissionCandidate) =>
    c.status === 'feasible_model' &&
    c.metrics.grossCoveragePct >= 99 &&
    c.sorties.length > 0 &&
    !c.checks.some((check) => check.status === 'fail');
  const feasible = admissible(alternative);
  return {
    feasible,
    comparable: feasible && admissible(original),
    makespanDeltaSec:
      feasible && admissible(original)
        ? alternative.metrics.makespanSec - original.metrics.makespanSec
        : null,
    flightTimeDeltaSec:
      feasible && admissible(original)
        ? alternative.metrics.flightTimeSec - original.metrics.flightTimeSec
        : null,
    summary: feasible
      ? 'Полный допустимый план найден в изменённых условиях.'
      : 'Полный допустимый план не найден в пределах поиска. Это не доказательство невозможности.',
  };
}
