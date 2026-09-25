import { z } from 'zod';
import { distance } from './geometry.ts';
import { fixedWingSegmentKinematics } from './fixed-wing-mission.ts';
import { missionJobContext, missionLegSpeed } from './mission-engine.ts';
import type { JobContext } from './mission-engine.ts';
import {
  assertSafeTree,
  checkTextSize,
  checkMissionSize,
} from './mission-io.ts';
import { MAX_OBSTACLE_MISSION_BYTES } from './obstacle-layer.ts';
import {
  missionDocumentSchema,
  parseMissionDocument,
  sha256,
} from './mission-schema.ts';
import type {
  MissionCandidate,
  MissionDocument,
  ScheduledSortie,
} from './mission-schema.ts';
import {
  scenarioSchema,
  coordinate,
  fixedWingSegmentMetadataSchema,
} from './schema.ts';
import type { Check } from './schema.ts';
import {
  validateExportedCandidate,
  validateMissionCandidate,
} from './mission-validation.ts';
import { missionWeatherChecks, weatherEnvelope } from './mission-weather.ts';
import { migrateMissionCameraBindings } from './camera-profile.ts';

export const MAX_ROBUSTNESS_REQUEST_BYTES = 2 * 1024 * 1024;
export const MAX_ROBUSTNESS_SEGMENTS = 1200;
export const MAX_ROBUSTNESS_SORTIES = 60;
const finite = (min = 0, max = 1e12) => z.number().min(min).max(max);
const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/);
const checkSchema = z
  .object({
    id: z.string().min(1).max(150),
    status: z.enum(['pass', 'fail', 'unknown']),
    title: z.string().max(500),
    detail: z.string().max(15000),
  })
  .strict();
const traceSchema = z
  .array(
    z
      .object({
        event: z.string().max(100),
        detail: z.string().max(10000),
      })
      .strict(),
  )
  .max(3000);
const segmentSchema = z
  .object({
    from: coordinate,
    to: coordinate,
    phase: z.enum([
      'takeoff',
      'transit',
      'survey',
      'turn',
      'return',
      'landing',
    ]),
    altitudeFromM: finite(0, 6000),
    altitudeToM: finite(0, 6000),
    airspeedMps: finite(0, 100),
    groundSpeedMps: finite(0, 100),
    distanceM: finite(0, 1000000),
    startSec: finite(0, 604800),
    endSec: finite(0, 604800),
    batteryFromPct: finite(0, 100),
    batteryToPct: finite(0, 100),
    stripId: finite(0, 400).int().optional(),
    jobId: identifier.optional(),
    fixedWing: fixedWingSegmentMetadataSchema.optional(),
  })
  .strict();
const sortieSchema = z
  .object({
    id: identifier,
    jobId: identifier,
    batteryId: identifier,
    cameraId: identifier.optional(),
    vehicleId: identifier,
    name: z.string().min(1).max(60),
    startSec: finite(0, 604800),
    endSec: finite(0, 604800),
    readySec: finite(0, 619200),
    durationSec: finite(0, 604800),
    distanceM: finite(0, 1e8),
    remainingPct: finite(0, 100),
    strips: finite(1, 400).int(),
    shots: finite(0, 1e9).int().nullable(),
    segments: z.array(segmentSchema).min(2).max(MAX_ROBUSTNESS_SEGMENTS),
  })
  .strict();

// This boundary intentionally includes all candidate fields. A checked subset
// must not acquire a hash that looks like approval of arbitrary extra payload.
const candidateSchema = z
  .object({
    id: identifier,
    objective: z.enum(['makespan', 'flightTime']),
    status: z.enum([
      'feasible_model',
      'invalid',
      'not_found',
      'partial',
      'unsupported',
    ]),
    sorties: z.array(sortieSchema).max(MAX_ROBUSTNESS_SORTIES),
    plan: z
      .object({
        engineVersion: z.string().max(50),
        scenario: scenarioSchema,
        inputHash: z.string().regex(/^[a-f0-9]{64}$/),
        createdAt: z.iso.datetime({ offset: true }),
        status: z.enum(['invalid', 'undetermined']),
        missions: z.array(sortieSchema).max(MAX_ROBUSTNESS_SORTIES),
        checks: z.array(checkSchema).max(300),
        metrics: z
          .object({
            areaHa: finite(),
            targetHa: finite(),
            excludedHa: finite(),
            coveragePct: finite(0, 100),
            makespanSec: finite(),
            flightTimeSec: finite(),
            distanceM: finite(),
            stripCount: finite().int(),
            bearingDeg: finite(0, 180),
          })
          .strict(),
        baseline: z
          .object({
            makespanSec: finite(),
            flightTimeSec: finite(),
            distanceM: finite(),
          })
          .strict()
          .nullable(),
        trace: traceSchema,
        computationMs: finite(),
      })
      .strict(),
    checks: z.array(checkSchema).max(300),
    events: z
      .array(
        z
          .object({
            timeSec: finite(0, 619200),
            type: z.enum([
              'prepare',
              'takeoff',
              'survey',
              'landing',
              'service',
              'battery',
              'complete',
            ]),
            vehicleId: identifier,
            sortieId: identifier.optional(),
            batteryId: identifier.optional(),
            detail: z.string().max(15000),
          })
          .strict(),
      )
      .max(5000),
    metrics: z
      .object({
        makespanSec: finite(),
        flightTimeSec: finite(),
        distanceM: finite(),
        sortieCount: finite().int(),
        vehicleCount: finite().int(),
        coveragePct: finite(0, 100),
        grossCoveragePct: finite(0, 100),
        batteryChanges: finite().int(),
        minimumRemainingPct: finite(0, 100),
      })
      .strict(),
    jobCoverage: z
      .array(
        z
          .object({
            jobId: identifier,
            cameraProfileId: identifier.optional(),
            cameraVehicleId: identifier.optional(),
            bearingDeg: finite(0, 180),
            grossAreaHa: finite(),
            targetAreaHa: finite(),
            coveragePct: finite(0, 100),
            grossCoveragePct: finite(0, 100),
          })
          .strict(),
      )
      .max(8),
    assumptions: z.array(z.string().max(15000)).max(300),
    trace: traceSchema,
  })
  .strict()
  .superRefine((candidate, ctx) => {
    for (const [name, sorties] of [
      ['sorties', candidate.sorties],
      ['plan.missions', candidate.plan.missions],
    ] as const) {
      if (
        sorties.reduce((sum, sortie) => sum + sortie.segments.length, 0) >
        MAX_ROBUSTNESS_SEGMENTS
      )
        ctx.addIssue({
          code: 'custom',
          message: `${name}: не более ${MAX_ROBUSTNESS_SEGMENTS} сегментов для стресс-проверки.`,
        });
    }
  });

/** Shared strict boundary for hash-linked analysis/certificate inputs. */
export const missionAnalysisCandidateSchema = candidateSchema;

export const robustnessPerturbationSchema = z
  .object({
    id: identifier,
    label: z.string().min(1).max(120),
    windSpeedDeltaMps: finite(0, 10).default(0),
    windDirectionDeltaDeg: finite(-180, 180).default(0),
    startDelaySec: finite(0, 7200).default(0),
    // Absolute percentage points, not percentage of the remaining charge.
    batteryReductionPct: finite(0, 50).default(0),
  })
  .strict();
export type RobustnessPerturbation = z.infer<
  typeof robustnessPerturbationSchema
>;

export const DEFAULT_ROBUSTNESS_PERTURBATIONS: RobustnessPerturbation[] = [
  {
    id: 'wind-speed',
    label: 'Ветер сильнее на 2 м/с',
    windSpeedDeltaMps: 2,
    windDirectionDeltaDeg: 0,
    startDelaySec: 0,
    batteryReductionPct: 0,
  },
  {
    id: 'wind-direction',
    label: 'Ветер повернул на 45°',
    windSpeedDeltaMps: 0,
    windDirectionDeltaDeg: 45,
    startDelaySec: 0,
    batteryReductionPct: 0,
  },
  {
    id: 'start-delay',
    label: 'Все вылеты задержаны на 5 минут',
    windSpeedDeltaMps: 0,
    windDirectionDeltaDeg: 0,
    startDelaySec: 300,
    batteryReductionPct: 0,
  },
  {
    id: 'battery-reduction',
    label: 'Исходный заряд ниже на 10 п.п.',
    windSpeedDeltaMps: 0,
    windDirectionDeltaDeg: 0,
    startDelaySec: 0,
    batteryReductionPct: 10,
  },
];
const requestSchema = z
  .object({
    document: missionDocumentSchema,
    candidate: candidateSchema,
    perturbations: z
      .array(robustnessPerturbationSchema)
      .min(1)
      .max(6)
      .optional(),
    maxComputeMs: finite(100, 5000).int().default(5000),
  })
  .strict()
  .superRefine((request, ctx) => {
    const ids = request.perturbations?.map((p) => p.id) ?? [];
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Идентификаторы стресс-сценариев повторяются.',
      });
  });

export type RobustnessCase = {
  id: string;
  label: string;
  perturbation: RobustnessPerturbation;
  status: 'safe' | 'unsafe_in_model' | 'not_checked';
  detail: string;
  failedChecks: Check[];
  unknownChecks: Check[];
  metrics: {
    makespanSec: number;
    flightTimeSec: number;
    minRemainingPct: number;
    reserveMarginPct: number;
    deadlineMarginSec: number;
  } | null;
};
export type MissionRobustnessReport = {
  type: 'prime-mission-robustness';
  schemaVersion: '1.0';
  policy: 'fixed-route-retiming-v1';
  inputHash: string;
  planHash: string;
  candidateId: string;
  createdAt: string;
  baseline: {
    status: 'verified' | 'rejected' | 'not_checked';
    failedChecks: Check[];
    unknownChecks: Check[];
  };
  cases: RobustnessCase[];
  assumptions: string[];
  elapsedMs: number;
  budgetExhausted: boolean;
  flightReady: false;
};

class ModelViolation extends Error {
  constructor(
    readonly checkId: string,
    message: string,
  ) {
    super(message);
  }
}
function contextsFor(
  document: MissionDocument,
  candidate: MissionCandidate,
): JobContext[] {
  return document.jobs.map((job) =>
    missionJobContext(
      document,
      {
        ...job,
        job: {
          ...job.job,
          bearingDeg: candidate.jobCoverage.find((row) => row.jobId === job.id)!
            .bearingDeg,
          autoBearing: false,
        },
      },
      false,
      document.scenario.vehicles.find(
        (v) =>
          v.id ===
          candidate.jobCoverage.find((row) => row.jobId === job.id)
            ?.cameraVehicleId,
      ),
    ),
  );
}

/** Keep all geometry, chosen UAVs, jobs and ordering. Only recompute phase time
 * and energy, delaying a UAV's next flight if its previous return is later.
 * No new spatial route, inter-UAV delay optimization, or future battery exists. */
function retimeRoutes(
  document: MissionDocument,
  candidate: MissionCandidate,
  contexts: JobContext[],
  perturbation: RobustnessPerturbation,
): ScheduledSortie[] {
  const output: ScheduledSortie[] = [];
  for (const vehicle of document.scenario.vehicles) {
    const source = candidate.sorties
      .filter((s) => s.vehicleId === vehicle.id)
      .sort((a, b) => a.startSec - b.startSec);
    if (!source.length) continue;
    if (document.scenario.wind.speedMps > vehicle.maxWindMps)
      throw new ModelViolation(
        'COMPATIBILITY',
        `${vehicle.name}: ветер ${document.scenario.wind.speedMps} м/с выше предела ${vehicle.maxWindMps} м/с.`,
      );
    const battery = document.batteries.find((b) => b.vehicleId === vehicle.id)!;
    let remaining = battery.initialPct;
    let readySec = Math.max(
      document.planning.preparationSec,
      (Date.parse(battery.readyAt) - Date.parse(document.window.start)) / 1000,
    );
    for (const original of source) {
      const sortie = structuredClone(original);
      const context = contexts.find((c) => c.job.id === sortie.jobId)!;
      sortie.startSec = Math.max(
        original.startSec + perturbation.startDelaySec,
        readySec,
      );
      let elapsed = 0;
      for (const segment of sortie.segments) {
        const from = context.geometry.forward(segment.from);
        const to = context.geometry.forward(segment.to);
        const length = distance(from, to);
        let duration: number;
        let airspeed = 0;
        if (vehicle.kind === 'fixedWing') {
          const fixed = fixedWingSegmentKinematics(
            document,
            vehicle,
            segment,
            context.geometry.forward,
          );
          if (fixed.errors.length)
            throw new ModelViolation(
              'FIXED_WING_KINEMATICS',
              fixed.errors.join(' '),
            );
          duration = fixed.durationSec;
          airspeed = fixed.airspeedMps;
        } else if (segment.phase === 'takeoff')
          duration = context.scenario.job.altitudeM / vehicle.climbMps;
        else if (segment.phase === 'landing')
          duration = context.scenario.job.altitudeM / vehicle.descentMps;
        else if (segment.phase === 'turn') duration = vehicle.turnSeconds;
        else {
          let speed;
          try {
            speed = missionLegSpeed(
              from,
              to,
              vehicle,
              context.scenario,
              document,
              segment.phase === 'survey',
            );
          } catch (error) {
            throw new ModelViolation(
              'COMPATIBILITY',
              `${vehicle.name}: ${error instanceof Error ? error.message : 'Маршрут недостижим при изменённом ветре.'}`,
            );
          }
          duration = length / speed.ground;
          airspeed = speed.air;
        }
        if (!Number.isFinite(duration) || duration < 0)
          throw new ModelViolation(
            'TIME',
            `${vehicle.name}: конечная длительность фазы не получена.`,
          );
        segment.startSec = sortie.startSec + elapsed;
        segment.endSec = segment.startSec + duration;
        segment.distanceM = length;
        segment.airspeedMps = airspeed;
        segment.groundSpeedMps = duration ? length / duration : 0;
        segment.batteryFromPct =
          remaining - (elapsed / (vehicle.effectiveEnduranceMin * 60)) * 100;
        elapsed += duration;
        segment.batteryToPct =
          remaining - (elapsed / (vehicle.effectiveEnduranceMin * 60)) * 100;
        if (segment.batteryToPct < 0)
          throw new ModelViolation(
            'ENERGY',
            `${vehicle.name}: расчётный ресурс исчерпан до завершения сохранённого маршрута; заряд не восстанавливается между вылетами.`,
          );
      }
      remaining -= (elapsed / (vehicle.effectiveEnduranceMin * 60)) * 100;
      sortie.durationSec = elapsed;
      sortie.endSec = sortie.startSec + elapsed;
      sortie.readySec = sortie.endSec + document.planning.serviceSec;
      sortie.remainingPct = remaining;
      sortie.distanceM = sortie.segments.reduce(
        (sum, s) => sum + s.distanceM,
        0,
      );
      readySec = sortie.readySec;
      output.push(sortie);
    }
  }
  return output.sort(
    (a, b) => a.startSec - b.startSec || a.id.localeCompare(b.id),
  );
}

/** Pure, bounded analysis. The input and running operation are never modified.
 * A soft wall-clock deadline is checked between synchronous verification passes;
 * a single bounded pass may exceed it. This is not hard real-time scheduling. */
export async function analyzeMissionRobustness(
  value: unknown,
): Promise<MissionRobustnessReport> {
  const started = performance.now();
  assertSafeTree(value);
  checkTextSize(
    JSON.stringify(value),
    MAX_OBSTACLE_MISSION_BYTES + MAX_ROBUSTNESS_REQUEST_BYTES,
  );
  const request = requestSchema.parse(value);
  const document = migrateMissionCameraBindings(
    parseMissionDocument(request.document),
  ).document;
  checkMissionSize(document);
  checkTextSize(
    JSON.stringify({
      ...request,
      document: {
        ...document,
        obstacleLayer: undefined,
        catalogLayers: undefined,
      },
    }),
    MAX_ROBUSTNESS_REQUEST_BYTES,
  );
  const candidate: MissionCandidate = request.candidate;
  const perturbations =
    request.perturbations ?? DEFAULT_ROBUSTNESS_PERTURBATIONS;
  const report: MissionRobustnessReport = {
    type: 'prime-mission-robustness',
    schemaVersion: '1.0',
    policy: 'fixed-route-retiming-v1',
    inputHash: await sha256(document),
    planHash: await sha256(candidate),
    candidateId: candidate.id,
    createdAt: new Date().toISOString(),
    baseline: { status: 'not_checked', failedChecks: [], unknownChecks: [] },
    cases: [],
    elapsedMs: 0,
    budgetExhausted: false,
    flightReady: false,
    assumptions: [
      'Каждый стресс-сценарий независим: изменения не накапливаются. Комбинированный случай нужно задать отдельно.',
      'Сохраняются маршруты, высоты, назначения и порядок. Пересчитываются длительности, заряд и готовность следующих вылетов того же БВС; взаимное разнесение проверяется заново. Новый план не ищется.',
      'Задержка применяется ко всем вылетам от начала исходного окна; срок окончания и интервалы запретов не сдвигаются.',
      'Снижение исходного заряда задано в процентных пунктах. Текущая батарея расходуется между вылетами, будущая замена не предполагается; это не модель физического износа.',
      'Ветер постоянен внутри каждого случая. Исходный прогноз не изменяется; прочие погодные ограничения сохранены, при усилении ветра проверяется также исходный максимум порывов плюс заданная прибавка.',
      'safe означает отсутствие нарушений в принятой модели; неизвестные проверки сохранены. Вероятность успеха, сертификация и реальная безопасность не заявляются.',
      `Не более ${MAX_ROBUSTNESS_SORTIES} вылетов, ${MAX_ROBUSTNESS_SEGMENTS} сегментов и 6 случаев. Мягкий бюджет ${request.maxComputeMs} мс проверяется между проходами; один синхронный проход может превысить его.`,
    ],
  };
  const deadline = started + request.maxComputeMs;
  let unavailableReason = '';
  if (candidate.status !== 'feasible_model' || !candidate.sorties.length)
    unavailableReason = 'Для проверки нужен полный допустимый исходный план.';
  else if (
    document.planning.safetyPolicy !== 'continuous-occupancy-v1' ||
    document.planning.batteryPolicy !== 'installed-current-v1'
  )
    unavailableReason =
      'Нужен пересчёт с действующим профилем безопасности и текущей установленной батареей.';
  else if (
    candidate.sorties.some(
      (s) =>
        document.scenario.vehicles.find((v) => v.id === s.vehicleId)?.kind !==
        'multirotor',
    )
  )
    unavailableReason =
      'Стресс-пересчёт самолётных фаз пока не поддержан; это не отрицание допустимости исходного самолётного плана.';
  else if (performance.now() >= deadline) {
    unavailableReason = 'Бюджет исчерпан до проверки исходного плана.';
    report.budgetExhausted = true;
  } else {
    const baseline = await validateExportedCandidate(document, candidate);
    report.baseline.failedChecks = baseline.filter(
      (check) => check.status === 'fail',
    );
    report.baseline.unknownChecks = baseline.filter(
      (check) => check.status === 'unknown',
    );
    report.baseline.status = report.baseline.failedChecks.length
      ? 'rejected'
      : 'verified';
    if (report.baseline.status === 'rejected')
      unavailableReason =
        'Независимая проверка исходного плана выявила нарушения. Стресс-оценка не разрешена.';
  }
  for (const perturbation of perturbations) {
    const row: RobustnessCase = {
      id: perturbation.id,
      label: perturbation.label,
      perturbation: structuredClone(perturbation),
      status: 'not_checked',
      detail: unavailableReason,
      failedChecks: [],
      unknownChecks: [],
      metrics: null,
    };
    report.cases.push(row);
    if (unavailableReason) continue;
    if (performance.now() >= deadline) {
      report.budgetExhausted = true;
      row.detail =
        'Исчерпан бюджет. Отсутствие проверки не означает допустимость.';
      continue;
    }
    const changed = structuredClone(document);
    const speed =
      document.scenario.wind.speedMps + perturbation.windSpeedDeltaMps;
    if (speed > 30) {
      row.detail =
        'Изменённый ветер выше 30 м/с — вне диапазона ядра; значение не занижено.';
      continue;
    }
    changed.scenario.wind = {
      speedMps: speed,
      fromDeg:
        (((document.scenario.wind.fromDeg +
          perturbation.windDirectionDeltaDeg) %
          360) +
          360) %
        360,
    };
    // The source snapshot must not be edited to masquerade as a new forecast.
    // Its independent limits remain checked below; only applied-wind equality
    // is superseded by this explicitly synthetic input.
    delete changed.weather;
    for (const vehicle of changed.scenario.vehicles)
      vehicle.batteryPct = Math.max(
        0,
        vehicle.batteryPct - perturbation.batteryReductionPct,
      );
    for (const battery of changed.batteries)
      battery.initialPct = Math.max(
        0,
        battery.initialPct - perturbation.batteryReductionPct,
      );
    try {
      const contexts = contextsFor(changed, candidate);
      const sorties = retimeRoutes(changed, candidate, contexts, perturbation);
      const checks = validateMissionCandidate(changed, sorties, contexts);
      checks.push(...contexts.flatMap((context) => context.checks));
      const usedIds = sorties.map((sortie) => sortie.vehicleId);
      if (document.weather) {
        checks.push(
          ...missionWeatherChecks(document, usedIds).filter(
            (c) => c.id !== 'FORECAST_APPLIED_WIND',
          ),
        );
        const gust =
          weatherEnvelope(document.weather.snapshot).gustMps +
          perturbation.windSpeedDeltaMps;
        checks.push({
          id: 'STRESS_FORECAST_GUST',
          status: changed.scenario.vehicles
            .filter((v) => usedIds.includes(v.id))
            .every((v) => gust <= v.maxWindMps)
            ? 'pass'
            : 'fail',
          title: 'Порывы в стресс-сценарии',
          detail: `Максимум порывов исходного прогноза плюс прибавка: ${gust.toFixed(2)} м/с. Это гипотеза, а не новый прогноз.`,
        });
      }
      row.failedChecks = checks.filter((c) => c.status === 'fail');
      row.unknownChecks = checks.filter((c) => c.status === 'unknown');
      row.status = row.failedChecks.length ? 'unsafe_in_model' : 'safe';
      row.detail = row.failedChecks.length
        ? 'Сохранённый маршрут с пересчитанным временем нарушает ограничения. Требуется новый расчёт; он здесь не выполнялся.'
        : 'Сохранённый маршрут выдержал этот случай в расчётной модели. Неизвестные факторы остаются неизвестными.';
      const makespan = Math.max(...sorties.map((s) => s.endSec));
      const remaining = Math.min(...sorties.map((s) => s.remainingPct));
      row.metrics = {
        makespanSec: makespan,
        flightTimeSec: sorties.reduce((sum, s) => sum + s.durationSec, 0),
        minRemainingPct: remaining,
        reserveMarginPct: remaining - document.scenario.reservePct,
        deadlineMarginSec:
          (Date.parse(document.window.end) -
            Date.parse(document.window.start)) /
            1000 -
          makespan,
      };
    } catch (error) {
      if (error instanceof ModelViolation) {
        row.status = 'unsafe_in_model';
        row.detail = error.message;
        row.failedChecks = [
          {
            id: error.checkId,
            status: 'fail',
            title: 'Нарушение при стресс-пересчёте',
            detail: error.message,
          },
        ];
        row.unknownChecks = [
          {
            id: 'REMAINING_CHECKS',
            status: 'unknown',
            title: 'Остальные проверки',
            detail:
              'Полная конечная траектория не получена, остальные проверки этого случая не выполнены.',
          },
        ];
      } else {
        row.detail = `Проверка не завершена: ${error instanceof Error ? error.message.slice(0, 500) : 'неизвестная ошибка'}`;
      }
    }
  }
  report.elapsedMs = performance.now() - started;
  report.budgetExhausted ||= report.elapsedMs > request.maxComputeMs;
  return report;
}
