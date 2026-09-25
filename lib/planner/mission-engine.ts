import { prioritizeMissionJobs } from './mission-editing.ts';
import { obstacleFootprints } from './obstacle-layer.ts';
import {
  parseMissionDocument,
  sha256,
  MISSION_ENGINE_VERSION,
} from './mission-schema.ts';
import type {
  MissionDocument,
  MissionJob,
  MissionCandidate,
  MissionResult,
  ScheduledSortie,
} from './mission-schema.ts';
import { buildMissionEvents } from './mission-events.ts';
import { weatherEnvelope, missionWeatherChecks } from './mission-weather.ts';
import { buildMissionRecommendation } from './mission-comparison.ts';
import { buildResourceStudy } from './mission-resources.ts';
import { maintenanceProjection } from './mission-maintenance.ts';
import { isVehicleReserved } from './mission-resource-reservations.ts';
import { vehiclePlanningEligibility } from './fixed-wing-profile.ts';
import { buildFixedWingSortie } from './fixed-wing-mission.ts';
import type {
  Scenario,
  Vehicle,
  Segment,
  Phase,
  Check,
  Plan,
} from './schema.ts';
import { groundSpeed } from './engine.ts';
import {
  area,
  coveredArea,
  distance,
  generateStrips,
  inside,
  prepareGeometry,
  router,
} from './geometry.ts';
import type { Geometry, Point, Strip } from './geometry.ts';
import { qualityForJob } from './quality.ts';
import {
  cameraGeometryKey,
  migrateMissionCameraBindings,
  resolveVehicleCamera,
} from './camera-profile.ts';
import type { CameraProfile } from './camera-profile.ts';
import { trackAltitudeAllowed } from './altitude-policy.ts';
import {
  compileRestrictions,
  findSortieConflicts,
  validateMissionCandidate,
  segmentSunlight,
  missionEnvironmentChecks,
  groundSeparationConflicts,
} from './mission-validation.ts';
import type { CompiledRestriction } from './mission-validation.ts';
import { jobSurveySegments } from './mission-sortie-jobs.ts';
import { joinAreaFlights } from './mission-chain.ts';
import {
  effectiveMissionRestrictions,
  catalogRestrictions,
} from './mission-catalog.ts';
import {
  betterMission,
  compactMissionSchedule,
  missionJobOrders,
} from './mission-schedule-search.ts';

const EPS = 1e-6;
type Route = ReturnType<typeof router>;
export type JobContext = {
  job: MissionJob;
  scenario: Scenario;
  geometry: Geometry;
  route: Route;
  strips: Strip[];
  checks: Check[];
  assumptions: string[];
  restrictions: CompiledRestriction[];
  cameraProfile?: CameraProfile;
  cameraVehicleId?: string;
};
type BatteryState = {
  id: string;
  vehicleId: string;
  pct: number;
  readySec: number;
  rechargeSec: number | null;
  used: number;
};
type VehicleState = {
  vehicle: Vehicle;
  position: Point;
  readySec: number;
  count: number;
  lastBatteryId?: string;
  chargerReadySec: number;
};
type Budget = {
  deadline: number;
  candidates: number;
  exhausted: boolean;
  contexts?: Map<string, JobContext>;
  preciseStarts?: boolean;
};
type SearchStrategy = {
  name: string;
  reverseStrips?: boolean;
  constrainedJobsFirst?: boolean;
  reverseJobs?: boolean;
  repair?: boolean;
  maximumPacksOnly?: boolean;
  wholeJobsOnly?: boolean;
  assignments?: Record<string, string>;
  jobOrder?: string[];
  // Explicit spatial splitting avoids the end-time-per-strip heuristic always
  // assigning an entire job to one aircraft. All normal gates still apply.
  partitionCount?: number;
  maxVehicles?: number;
  preciseStarts?: boolean;
  cameraIndex?: number;
};
const GREEDY_STRATEGY: SearchStrategy = {
  name: 'parallel-maximum-prefix-v1',
  maximumPacksOnly: true,
};
const overBudget = (budget: Budget) => {
  if (performance.now() >= budget.deadline) budget.exhausted = true;
  return budget.exhausted;
};

function cachedContext(
  d: MissionDocument,
  job: MissionJob,
  perpendicular: boolean,
  budget: Budget,
  vehicle?: Vehicle,
) {
  const key = `${job.id}:${perpendicular}:${vehicle?.id ?? 'auto'}`;
  const saved = budget.contexts?.get(key);
  if (saved) return saved;
  const context = missionJobContext(d, job, perpendicular, vehicle);
  budget.contexts?.set(key, context);
  return context;
}

export function missionJobContext(
  d: MissionDocument,
  job: MissionJob,
  perpendicular = false,
  cameraVehicle?: Vehicle,
): JobContext {
  d = migrateMissionCameraBindings(d).document;
  cameraVehicle ??= d.scenario.vehicles.find(
    (v) =>
      v.enabled &&
      v.jobs.includes(job.job.type) &&
      (!job.assignedVehicleIds.length ||
        job.assignedVehicleIds.includes(v.id)) &&
      resolveVehicleCamera(v, job.job.type).camera,
  );
  const resolvedCamera =
      job.quality.mode === 'camera' && cameraVehicle
        ? resolveVehicleCamera(cameraVehicle, job.job.type).camera
        : undefined,
    quality = qualityForJob(
      job,
      job.quality.mode === 'camera'
        ? cameraVehicle
          ? { ...cameraVehicle, airspeedMps: 0 }
          : d.scenario.vehicles[0]
        : undefined,
      d.flightEnvelope,
    ),
    altitude = quality.job.altitudeM,
    sensorOffset =
      job.quality.mode === 'geophysics' ? (job.quality.sensorOffsetM ?? 0) : 0,
    permanent = effectiveMissionRestrictions(d).filter(
      (r) =>
        r.startAt === null &&
        altitude >= r.minAltitudeM - d.scenario.clearanceM &&
        altitude - sensorOffset <=
          (r.maxAltitudeM ?? Infinity) + d.scenario.clearanceM,
    ),
    scenario: Scenario = {
      ...d.scenario,
      clearanceM: Math.max(
        d.scenario.clearanceM,
        d.obstacleLayer?.bufferM ?? 0,
      ),
      area: job.area,
      job: {
        ...quality.job,
        bearingDeg:
          perpendicular && quality.job.autoBearing
            ? (quality.job.bearingDeg + 90) % 180
            : quality.job.bearingDeg,
      },
      exclusions: [
        ...d.scenario.exclusions,
        ...permanent.map((r) => r.geometry),
        ...obstacleFootprints(d),
      ],
    },
    geometry = prepareGeometry(
      scenario,
      d.planning.safetyPolicy ? d.scenario.clearanceM : 0,
      d.planning.safetyPolicy ? d.scenario.area.coordinates[0][0] : undefined,
    ),
    strips = generateStrips(
      geometry,
      scenario.job.swathM * (1 - scenario.job.sideOverlap),
      scenario.job.bearingDeg,
    ),
    // Visibility routing otherwise follows the exact closed restriction
    // boundary, which the independent 4D validator correctly treats as a touch.
    // Pad only routing obstacles, not the requested/covered area or acceptance
    // clearance. This is a numerical planning guard, never a weaker safety rule.
    routingGeometry = scenario.exclusions.length
      ? prepareGeometry(
          {
            ...scenario,
            clearanceM: Math.min(100, scenario.clearanceM + 0.25),
          },
          d.planning.safetyPolicy ? d.scenario.clearanceM : 0,
          d.planning.safetyPolicy
            ? d.scenario.area.coordinates[0][0]
            : undefined,
        )
      : geometry;
  return {
    job,
    scenario,
    geometry,
    route: router(routingGeometry),
    strips,
    checks: quality.checks,
    assumptions: [
      ...quality.assumptions,
      ...new Set(
        catalogRestrictions(d).flatMap((r) => [
          ...(r.catalog?.model ? [r.catalog.model] : []),
          ...(r.catalog?.timePolicy === 'unknown'
            ? [
                'У зон без расписания учитывается весь период миссии в указанном высотном слое.',
              ]
            : []),
          ...(r.catalog?.altitudePolicy !== 'declared-datum'
            ? [
                `${r.name}: неполные высотные данные, неразрешённая часть диапазона закрыта консервативно.`,
              ]
            : []),
        ]),
      ),
    ],
    restrictions: compileRestrictions(d, geometry, sensorOffset),
    ...(resolvedCamera
      ? { cameraProfile: resolvedCamera, cameraVehicleId: cameraVehicle!.id }
      : {}),
  };
}

/** Required speed is kept in the exported segment, rather than claiming that
 * target ground speed is a measured or guaranteed airspeed. */
export function missionLegSpeed(
  a: Point,
  b: Point,
  v: Vehicle,
  s: Scenario,
  d: MissionDocument,
  survey: boolean,
) {
  const len = distance(a, b);
  if (len < EPS) return { ground: 0, air: 0 };
  if (!survey || d.planning.windModel === 'constantAirspeed')
    return {
      ground: groundSpeed(a, b, v.airspeedMps, s.wind),
      air: v.airspeedMps,
    };
  const theta = (s.wind.fromDeg * Math.PI) / 180,
    wind: Point = [
      -Math.sin(theta) * s.wind.speedMps,
      -Math.cos(theta) * s.wind.speedMps,
    ],
    requested = v.airspeedMps,
    needed = Math.hypot(
      ((b[0] - a[0]) / len) * requested - wind[0],
      ((b[1] - a[1]) / len) * requested - wind[1],
    ),
    passportLimit = ['Gemini', '801'].includes(v.model)
      ? 15
      : v.model === '201'
        ? 130 / 3.6
        : Infinity,
    limit = Math.min(
      passportLimit,
      v.maxAirspeedMps ??
        (Number.isFinite(passportLimit) ? passportLimit : v.airspeedMps),
    );
  if (needed > limit + EPS)
    throw new Error(
      'Невозможно удержать заданную путевую скорость съёмки в пределах воздушной скорости профиля.',
    );
  return { ground: requested, air: needed };
}

function buildSortie(
  d: MissionDocument,
  context: JobContext,
  state: VehicleState,
  battery: BatteryState,
  strips: Strip[],
  id: string,
): ScheduledSortie | null {
  if (state.vehicle.kind === 'fixedWing')
    return buildFixedWingSortie(d, context, state, battery, strips, id);
  const { scenario: s, geometry: g, route } = context,
    v = state.vehicle,
    segments: Segment[] = [];
  let pos = state.position,
    elapsed = 0;
  const add = (
    from: Point,
    to: Point,
    phase: Phase,
    dt: number,
    h1: number,
    h2: number,
    stripId?: number,
    air = 0,
  ) => {
    const len = distance(from, to),
      initial = battery.pct - (elapsed / (v.effectiveEnduranceMin * 60)) * 100;
    segments.push({
      from: g.inverse(from),
      to: g.inverse(to),
      phase,
      altitudeFromM: h1,
      altitudeToM: h2,
      airspeedMps: air,
      groundSpeedMps: dt > 0 ? len / dt : 0,
      distanceM: len,
      startSec: elapsed,
      endSec: elapsed + dt,
      batteryFromPct: initial,
      batteryToPct: initial - (dt / (v.effectiveEnduranceMin * 60)) * 100,
      ...(stripId === undefined ? {} : { stripId }),
    });
    elapsed += dt;
    pos = to;
  };
  const move = (target: Point, phase: Phase) => {
    const path = route(pos, target);
    if (!path) throw new Error('Нет допустимого перехода.');
    for (let i = 1; i < path.length; i++) {
      if (i > 1 && v.turnSeconds > 0)
        add(pos, pos, 'turn', v.turnSeconds, s.job.altitudeM, s.job.altitudeM);
      const len = distance(path[i - 1], path[i]);
      if (len > EPS) {
        const speed = missionLegSpeed(path[i - 1], path[i], v, s, d, false);
        add(
          path[i - 1],
          path[i],
          phase,
          len / speed.ground,
          s.job.altitudeM,
          s.job.altitudeM,
          undefined,
          speed.air,
        );
      }
    }
  };
  try {
    if (!inside(pos, g.free) || !inside(g.forward(v.landing), g.free))
      return null;
    add(pos, pos, 'takeoff', s.job.altitudeM / v.climbMps, 0, s.job.altitudeM);
    for (const strip of strips) {
      // Nearest endpoint alone can select an impossible headwind survey. Try
      // both directions without changing the requested speed or aircraft limit.
      const options = [
        { a: strip.a, b: strip.b },
        { a: strip.b, b: strip.a },
      ]
        .flatMap(({ a, b }) => {
          try {
            const path = route(pos, a);
            if (!path) return [];
            const speed = missionLegSpeed(a, b, v, s, d, true);
            const quality = qualityForJob(
              context.job,
              {
                ...v,
                airspeedMps: speed.ground,
              },
              d.flightEnvelope,
            );
            if (quality.checks.some((check) => check.status === 'fail'))
              return [];
            const seconds = path
              .slice(1)
              .reduce(
                (sum, p, i) =>
                  sum +
                  distance(path[i], p) /
                    missionLegSpeed(path[i], p, v, s, d, false).ground,
                0,
              );
            return [{ a, b, seconds: seconds + distance(a, b) / speed.ground }];
          } catch {
            return [];
          }
        })
        .sort((a, b) => a.seconds - b.seconds);
      if (!options.length) return null;
      const { a, b } = options[0];
      move(a, 'transit');
      if (v.turnSeconds > 0)
        add(pos, pos, 'turn', v.turnSeconds, s.job.altitudeM, s.job.altitudeM);
      const speed = missionLegSpeed(a, b, v, s, d, true);
      add(
        a,
        b,
        'survey',
        distance(a, b) / speed.ground,
        s.job.altitudeM,
        s.job.altitudeM,
        strip.id,
        speed.air,
      );
    }
    move(g.forward(v.landing), 'return');
    add(
      pos,
      pos,
      'landing',
      s.job.altitudeM / v.descentMps,
      s.job.altitudeM,
      0,
    );
  } catch {
    return null;
  }
  const remainingPct =
    battery.pct - (elapsed / (v.effectiveEnduranceMin * 60)) * 100;
  if (remainingPct < d.scenario.reservePct - EPS) return null;
  const quality = qualityForJob(
    context.job,
    {
      ...v,
      airspeedMps: Math.max(
        ...segments
          .filter((s) => s.phase === 'survey')
          .map((s) => s.groundSpeedMps),
      ),
    },
    d.flightEnvelope,
  );
  if (quality.checks.some((c) => c.status === 'fail')) return null;
  return {
    id,
    jobId: context.job.id,
    batteryId: battery.id,
    ...(context.cameraProfile
      ? { cameraId: resolveVehicleCamera(v, context.job.job.type).camera?.id }
      : {}),
    vehicleId: v.id,
    name: v.name,
    startSec: 0,
    endSec: elapsed,
    readySec: elapsed + d.planning.serviceSec,
    segments,
    durationSec: elapsed,
    distanceM: segments.reduce((sum, seg) => sum + seg.distanceM, 0),
    remainingPct,
    strips: strips.length,
    shots: ['RGB', 'MS', 'IR'].includes(s.job.type)
      ? segments
          .filter((x) => x.phase === 'survey')
          .reduce(
            (sum, seg) =>
              sum +
              Math.floor((seg.distanceM + EPS) / s.job.triggerDistanceM) +
              1,
            0,
          )
      : null,
  };
}

function shifted(
  sortie: ScheduledSortie,
  at: number,
  serviceSec: number,
): ScheduledSortie {
  return {
    ...sortie,
    startSec: at,
    endSec: at + sortie.durationSec,
    readySec: at + sortie.durationSec + serviceSec,
    segments: sortie.segments.map((s) => ({
      ...s,
      startSec: s.startSec + at,
      endSec: s.endSec + at,
    })),
  };
}

function findStart(
  d: MissionDocument,
  context: JobContext,
  sortie: ScheduledSortie,
  earliest: number,
  existing: ScheduledSortie[],
  budget: Budget,
): ScheduledSortie | null {
  // Constant conditions cannot improve by shifting this sortie inside the window.
  if (
    missionEnvironmentChecks(d, sortie.segments).some(
      (check) => check.status === 'fail',
    )
  )
    return null;
  const startMs = Date.parse(d.window.start),
    endSec =
      (Date.parse(context.job.window?.end ?? d.window.end) - startMs) / 1000,
    restrictions = context.restrictions,
    minimumSun =
      context.job.daylight === 'none'
        ? null
        : context.job.daylight === 'topographicClearSky'
          ? 15
          : 0;
  let at = Math.max(
    d.planning.preparationSec,
    earliest,
    (Date.parse(context.job.window?.start ?? d.window.start) - startMs) / 1000,
  );
  // Whole-minute candidate scan is a bounded heuristic, not a proof of no solution.
  for (
    let iteration = 0;
    iteration < 11000 && at + sortie.durationSec <= endSec + EPS;
    iteration++
  ) {
    if (overBudget(budget)) return null;
    const candidate = shifted(sortie, at, d.planning.serviceSec),
      conflicts = findSortieConflicts(
        d,
        candidate,
        existing,
        restrictions,
        context.geometry,
      );
    if (conflicts.permanent) return null;
    if (conflicts.nextStartSec > at + EPS) {
      // Search local launch offsets; do not serialize complete flights for a
      // short-lived encounter. Legacy baselines retain their original policy.
      at =
        budget.preciseStarts && existing.length
          ? Math.min(conflicts.nextStartSec, at + 1)
          : conflicts.nextStartSec;
      continue;
    }
    if (
      minimumSun !== null &&
      candidate.segments.some(
        (seg) =>
          seg.phase === 'survey' &&
          !segmentSunlight(seg, startMs, minimumSun).pass,
      )
    ) {
      at = Math.floor(at / 60) * 60 + 60;
      continue;
    }
    return candidate;
  }
  return null;
}

function emptyPlan(
  d: MissionDocument,
  inputHash: string,
  createdAt: string,
): Plan {
  return {
    engineVersion: MISSION_ENGINE_VERSION,
    inputHash,
    createdAt,
    scenario: d.scenario,
    status: 'invalid',
    missions: [],
    checks: [],
    metrics: {
      areaHa: 0,
      targetHa: 0,
      excludedHa: 0,
      coveragePct: 0,
      makespanSec: 0,
      flightTimeSec: 0,
      distanceM: 0,
      stripCount: 0,
      bearingDeg: d.scenario.job.bearingDeg,
    },
    baseline: null,
    trace: [],
    computationMs: 0,
  };
}

function candidateFromSorties(
  d: MissionDocument,
  contexts: JobContext[],
  sorties: ScheduledSortie[],
  objective: Scenario['objective'],
  id: string,
  trace: Plan['trace'],
  inputHash: string,
  createdAt: string,
  unsupported: string[],
  notFound: boolean,
): MissionCandidate {
  // Job search order must not change canonical exported check ordering.
  contexts = [...contexts].sort(
    (a, b) =>
      d.jobs.findIndex((j) => j.id === a.job.id) -
      d.jobs.findIndex((j) => j.id === b.job.id),
  );
  const validation = validateMissionCandidate(d, sorties, contexts),
    jobCoverage = contexts.map((context) => {
      const surveys = jobSurveySegments(sorties, context.job.id),
        measured = surveys.length
          ? coveredArea(
              context.geometry,
              surveys.map((s, id) => ({
                id,
                a: context.geometry.forward(s.from),
                b: context.geometry.forward(s.to),
              })),
              context.scenario.job.swathM,
            )
          : 0,
        gross = area(context.geometry.gross),
        target = area(context.geometry.target);
      return {
        jobId: context.job.id,
        ...(context.cameraProfile
          ? {
              cameraProfileId: context.cameraProfile.id,
              cameraVehicleId: context.cameraVehicleId,
            }
          : {}),
        bearingDeg: context.scenario.job.bearingDeg,
        grossAreaHa: gross / 10000,
        targetAreaHa: target / 10000,
        coveragePct: Math.min(100, (measured / target) * 100),
        grossCoveragePct: Math.min(100, (measured / gross) * 100),
      };
    }),
    gross = jobCoverage.reduce((sum, j) => sum + j.grossAreaHa, 0),
    target = jobCoverage.reduce((sum, j) => sum + j.targetAreaHa, 0),
    measured = jobCoverage.reduce(
      (sum, j) => sum + (j.targetAreaHa * j.coveragePct) / 100,
      0,
    ),
    coveragePct = target ? (measured / target) * 100 : 0,
    grossCoveragePct = gross ? (measured / gross) * 100 : 0,
    makespanSec = Math.max(0, ...sorties.map((s) => s.endSec)),
    flightTimeSec = sorties.reduce((sum, s) => sum + s.durationSec, 0),
    distanceM = sorties.reduce((sum, s) => sum + s.distanceM, 0),
    checks: Check[] = [
      ...validation,
      ...contexts.flatMap((c) =>
        c.checks.map((check) => ({ ...check, id: `${c.job.id}:${check.id}` })),
      ),
      ...unsupported.map(
        (reason, i): Check => ({
          id: `UNSUPPORTED_${i}`,
          status: 'fail',
          title: 'Неподдержанная конфигурация',
          detail: reason,
        }),
      ),
    ],
    assignmentsComplete =
      contexts.length === d.jobs.length &&
      contexts.every((context) => {
        const actual = jobSurveySegments(sorties, context.job.id).map(
          (x) => x.stripId,
        );
        return (
          actual.length === context.strips.length &&
          new Set(actual).size === context.strips.length
        );
      }),
    status: MissionCandidate['status'] = unsupported.length
      ? 'unsupported'
      : notFound || !assignmentsComplete
        ? sorties.length
          ? 'partial'
          : 'not_found'
        : checks.some((x) => x.id === 'REQUESTED_AREA' && x.status === 'fail')
          ? 'partial'
          : checks.some((x) => x.status === 'fail')
            ? 'invalid'
            : jobCoverage.some((j) => j.grossCoveragePct < 99)
              ? 'partial'
              : 'feasible_model',
    events = buildMissionEvents(d, sorties);
  for (const coverage of jobCoverage)
    checks.push({
      id: `COVERAGE_${coverage.jobId}`,
      status:
        coverage.coveragePct >= 99 && coverage.grossCoveragePct >= 99
          ? 'pass'
          : 'fail',
      title: 'Геометрическое покрытие работы',
      detail: `${coverage.coveragePct.toFixed(3)}% доступной области; ${coverage.grossCoveragePct.toFixed(3)}% исходной. Исключённая запретами часть не засчитана как выполненная.`,
    });
  const plan = emptyPlan(d, inputHash, createdAt);
  plan.scenario = { ...d.scenario, objective };
  // Legacy map is only a view of the same absolute-time segments. Solver/approval
  // use v2 sorties, not this compatibility projection.
  plan.missions = sorties;
  plan.status =
    status === 'invalid' ||
    status === 'unsupported' ||
    status === 'not_found' ||
    status === 'partial'
      ? 'invalid'
      : 'undetermined';
  plan.checks = checks;
  plan.trace = trace;
  plan.metrics = {
    areaHa: gross,
    targetHa: target,
    excludedHa: gross - target,
    coveragePct,
    makespanSec,
    flightTimeSec,
    distanceM,
    stripCount: contexts.reduce((sum, c) => sum + c.strips.length, 0),
    bearingDeg: contexts[0]?.scenario.job.bearingDeg ?? 0,
  };
  return {
    id,
    objective,
    status,
    plan,
    sorties,
    checks,
    events,
    jobCoverage,
    trace,
    metrics: {
      makespanSec,
      flightTimeSec,
      distanceM,
      sortieCount: sorties.length,
      vehicleCount: new Set(sorties.map((s) => s.vehicleId)).size,
      coveragePct,
      grossCoveragePct,
      batteryChanges: sorties.reduce((n, s) => {
        const previous = sorties
          .filter((p) => p.vehicleId === s.vehicleId && p.endSec < s.startSec)
          .sort((a, b) => a.endSec - b.endSec)
          .at(-1);
        return n + (previous && previous.batteryId !== s.batteryId ? 1 : 0);
      }, 0),
      minimumRemainingPct: sorties.length
        ? Math.min(...sorties.map((s) => s.remainingPct))
        : 0,
    },
    assumptions: [
      ...new Set(
        contexts
          .flatMap((c) => c.assumptions)
          .concat([
            'Линейный расход ресурса по времени полёта; ток, температура, здоровье батареи и мощность нагрузки не калиброваны.',
            `Разнесение ${d.planning.separationHorizontalM}/${d.planning.separationVerticalM} м и временной запас ${d.planning.temporalBufferSec} с: ${d.planning.separationSource}`,
            d.planning.batteryPolicy
              ? 'Одна текущая батарея БВС: повторные вылеты на остатке, без прогнозирования замены или восстановления заряда. Наземное обслуживание — проверка перед вылетом, не замена.'
              : 'При заданной перезарядке: один последовательный модельный зарядник на БВС, батарея доступна только после полного указанного времени; реальная инфраструктура не подтверждена.',
            d.planning.windModel === 'constantGroundSpeed'
              ? 'При съёмке параметр скорости БВС — целевая путевая скорость, на переходах — воздушная. Требуемая воздушная скорость проверяется по пределу профиля.'
              : 'Воздушная скорость постоянна; путевая скорость зависит от направления относительно ветра.',
            'Маршруты — локальные прямолинейные сегменты для мультироторной модели; это не команды автопилоту и не разрешение полёта.',
            'Порог покрытия 99% — инженерный критерий геометрических полос, не официальная матрица жюри и не доказательство качества снимков.',
            'Планируемые кадры: в начале прохода и через заданный шаг, пока координата не превысит конец; внеполосный последний кадр не добавляется. Реальные отпечатки кадров и краевое фотопокрытие не подтверждены.',
            ...(d.environment
              ? [
                  `Облачность и видимость заданы постоянными на всё окно: ${d.environment.source} Высоты относительно общего базового уровня старта/модельной плоскости; фактическая AGL, пространственное изменение погоды и прогноз не определены.`,
                ]
              : []),
          ]),
      ),
    ],
  };
}

function schedule(
  d: MissionDocument,
  objective: Scenario['objective'],
  serial: boolean,
  perpendicular: boolean,
  budget: Budget,
  inputHash: string,
  createdAt: string,
  strategy: SearchStrategy = { name: 'adaptive-packs-repair-v2', repair: true },
): MissionCandidate {
  budget.preciseStarts = strategy.preciseStarts ?? false;
  const sorties: ScheduledSortie[] = [],
    contexts: JobContext[] = [],
    unsupported: string[] = [],
    trace: Plan['trace'] = [],
    startMs = Date.parse(d.window.start),
    batteries: BatteryState[] = d.batteries.map((b) => ({
      id: b.id,
      vehicleId: b.vehicleId,
      pct: b.initialPct,
      readySec: Math.max(0, (Date.parse(b.readyAt) - startMs) / 1000),
      rechargeSec: b.rechargeSec,
      used: 0,
    })),
    vehicleLimit = Math.min(
      d.planning.maxVehicles ?? 20,
      strategy.maxVehicles ?? 20,
    ),
    fleet = d.scenario.vehicles.filter(
      (v) =>
        v.enabled &&
        !isVehicleReserved(d, v.id) &&
        // A one-aircraft mission must use a configuration capable of every job.
        (vehicleLimit !== 1 ||
          d.jobs.every(
            (j) =>
              v.jobs.includes(j.job.type) &&
              (!j.assignedVehicleIds.length ||
                j.assignedVehicleIds.includes(v.id)),
          )),
    );
  let notFound = false;
  const jobs = [...d.jobs];
  if (strategy.jobOrder)
    jobs.sort(
      (a, b) =>
        strategy.jobOrder!.indexOf(a.id) - strategy.jobOrder!.indexOf(b.id),
    );
  if (strategy.constrainedJobsFirst) {
    const eligibleCount = (job: MissionJob) =>
      fleet.filter(
        (v) =>
          v.jobs.includes(job.job.type) &&
          (!strategy.assignments || strategy.assignments[job.id] === v.id) &&
          (!job.assignedVehicleIds.length ||
            job.assignedVehicleIds.includes(v.id)) &&
          vehiclePlanningEligibility(v).supported,
      ).length;
    jobs.sort((a, b) => eligibleCount(a) - eligibleCount(b));
  }
  if (strategy.reverseJobs) jobs.reverse();
  jobs.splice(0, jobs.length, ...prioritizeMissionJobs(jobs));
  trace.push({ event: 'SEARCH_STRATEGY', detail: strategy.name });
  if (jobs.some((job) => job.workPriority || job.priority))
    trace.push({
      event: 'JOB_PRIORITY_ORDER',
      detail: jobs
        .map(
          (j) =>
            `${j.id}: работа ${j.workPriority ?? 'авто'}, участок ${j.priority ?? 'авто'}`,
        )
        .join('; '),
    });
  for (const job of jobs) {
    if (overBudget(budget)) {
      notFound = true;
      break;
    }
    let context: JobContext;
    const eligible = fleet.filter(
      (v) =>
        v.jobs.includes(job.job.type) &&
        (!strategy.assignments || strategy.assignments[job.id] === v.id) &&
        (!job.assignedVehicleIds.length ||
          job.assignedVehicleIds.includes(v.id)),
    );
    const cameraVehicles = eligible.filter(
      (v) => resolveVehicleCamera(v, job.job.type).camera,
    );
    const opticalChoices = cameraVehicles.filter(
      (v, i) =>
        cameraVehicles.findIndex(
          (other) =>
            cameraGeometryKey(
              resolveVehicleCamera(other, job.job.type).camera!,
            ) ===
            cameraGeometryKey(resolveVehicleCamera(v, job.job.type).camera!),
        ) === i,
    );
    const cameraVehicle = opticalChoices.length
      ? opticalChoices[(strategy.cameraIndex ?? 0) % opticalChoices.length]
      : undefined;
    try {
      context = cachedContext(d, job, perpendicular, budget, cameraVehicle);
      contexts.push(context);
    } catch (error) {
      unsupported.push(
        `${job.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    // An unsupported aircraft in the registry is not evidence that the whole
    // job is unsupported: other compatible aircraft can still complete it.
    // The excluded aircraft remains in the physical ground-occupancy checks.
    for (const vehicle of eligible) {
      const capability = vehiclePlanningEligibility(vehicle);
      if (!capability.supported)
        trace.push({
          event: 'VEHICLE_EXCLUDED',
          detail: `${job.id}: ${vehicle.id} — ${capability.reasons.join(' ')}`,
        });
    }
    const supported = eligible.filter(
      (v) =>
        vehiclePlanningEligibility(v).supported &&
        (job.quality.mode !== 'camera' ||
          (!!context.cameraProfile &&
            !!resolveVehicleCamera(v, job.job.type).camera &&
            cameraGeometryKey(resolveVehicleCamera(v, job.job.type).camera!) ===
              cameraGeometryKey(context.cameraProfile))),
    );
    if (job.quality.mode === 'camera')
      trace.push({
        event: 'CAMERA_BINDING',
        detail: context.cameraProfile
          ? `${job.id}: ${context.cameraProfile.id}; полосы и высота этой оптики. Деление работы только между БВС с эквивалентной активной камерой; другие камеры сравниваются отдельными раскладками.`
          : eligible
              .map((v) => resolveVehicleCamera(v, job.job.type).reason)
              .join(' ') || 'Нет установленной камеры.',
      });
    const usable = supported.filter(
      (v) =>
        d.scenario.wind.speedMps <= v.maxWindMps &&
        (!d.weather ||
          weatherEnvelope(d.weather.snapshot).gustMps <= v.maxWindMps),
    );
    if (!usable.length) {
      if (d.weather && supported.length) {
        notFound = true;
        trace.push({
          event: 'NO_ASSIGNMENT',
          detail: `${job.name}: прогнозный ветер или порывы исключают все поддерживаемые БВС; см. FORECAST_WIND_LIMIT.`,
        });
        continue;
      }
      unsupported.push(
        `${job.name}: нет включённой совместимой и поддержанной конфигурации в пределах ветра/скорости.${supported.length ? '' : ` ${eligible.flatMap((v) => [...vehiclePlanningEligibility(v).reasons, ...(job.quality.mode === 'camera' ? [resolveVehicleCamera(v, job.job.type).reason ?? ''] : [])]).join(' ')}`}`,
      );
      continue;
    }
    if (context.checks.some((c) => c.status === 'fail')) {
      unsupported.push(
        `${job.name}: недостаточные или противоречивые параметры качества.`,
      );
      continue;
    }
    if (
      context.scenario.job.altitudeM < d.flightEnvelope.minSurveyAltitudeM ||
      context.scenario.job.altitudeM > d.flightEnvelope.maxAltitudeM ||
      !trackAltitudeAllowed(context.scenario.job.altitudeM)
    ) {
      unsupported.push(
        `${job.name}: высота съёмки вне коридора или не ниже 150 м AGL. Используйте высоту по GSD в допустимом диапазоне.`,
      );
      continue;
    }
    const weatherFailures = missionEnvironmentChecks(
      d,
      [],
      [context.scenario.job.altitudeM],
    )
      .concat(
        missionWeatherChecks(
          d,
          usable.map((v) => v.id),
        ),
      )
      .filter((check) => check.status === 'fail');
    if (weatherFailures.length) {
      notFound = true;
      trace.push({
        event: 'NO_ASSIGNMENT',
        detail: `${job.id}: заданные постоянные погодные ограничения не выполнены. ${weatherFailures.map((check) => check.detail).join(' ')}`,
      });
      continue;
    }
    const states: VehicleState[] = usable.map((vehicle) => {
      const prior = sorties
          .filter((s) => s.vehicleId === vehicle.id)
          .sort((a, b) => a.endSec - b.endSec),
        last = prior.at(-1);
      return {
        vehicle,
        position: context.geometry.forward(
          last ? last.segments.at(-1)!.to : vehicle.start,
        ),
        readySec: last ? last.readySec : d.planning.preparationSec,
        count: prior.length,
        lastBatteryId: last?.batteryId,
        chargerReadySec: Math.max(
          0,
          ...batteries
            .filter((b) => b.vehicleId === vehicle.id && b.used)
            .map((b) => b.readySec),
        ),
      };
    });
    let remaining = context.strips.slice();
    if (strategy.reverseStrips) remaining.reverse();
    const packLimit = strategy.partitionCount
      ? Math.max(
          1,
          Math.ceil(
            remaining.length / Math.min(strategy.partitionCount, usable.length),
          ),
        )
      : remaining.length;
    if (strategy.partitionCount)
      trace.push({
        event: 'SPATIAL_PARTITION',
        detail: `${job.id}: группы до ${packLimit} соседних полос; назначение по ближайшему завершению вылета. БВС выбираются по совместимости, заряду и готовности; одновременность только после проверки разнесения.`,
      });
    type Choice = {
      sortie: ScheduledSortie;
      state: VehicleState;
      battery: BatteryState;
      count: number;
      score: number;
    };
    type Decision = {
      choices: Choice[];
      remaining: Strip[];
      states: VehicleState[];
      batteries: BatteryState[];
      sortieCount: number;
      traceCount: number;
    };
    const decisions: Decision[] = [];
    let repairs = 0;
    while (remaining.length) {
      if (overBudget(budget)) {
        notFound = true;
        break;
      }
      let best: Choice | null = null;
      const choices: Choice[] = [];
      for (const state of states) {
        if (state.count >= d.planning.maxSortiesPerVehicle) continue;
        const usedIds = new Set(sorties.map((s) => s.vehicleId));
        if (!usedIds.has(state.vehicle.id) && usedIds.size >= vehicleLimit)
          continue;
        for (const battery of batteries.filter(
          (b) =>
            b.vehicleId === state.vehicle.id && b.pct > d.scenario.reservePct,
        )) {
          if (overBudget(budget)) break;
          const packs: { flight: ScheduledSortie; count: number }[] = [];
          for (let n = 1; n <= Math.min(remaining.length, packLimit); n++) {
            if (overBudget(budget)) break;
            const flight = buildSortie(
              d,
              context,
              state,
              battery,
              remaining.slice(0, n),
              `sortie-${sorties.length + 1}`,
            );
            budget.candidates++;
            if (!flight) break;
            packs.push({ flight, count: n });
          }
          if (!packs.length) continue;
          if (strategy.wholeJobsOnly && packs.length !== remaining.length)
            continue;
          // Maximum, half, quarter and one-strip packs give the scheduler a
          // chance to fit a time window, preserve scarce energy and parallelize.
          const wanted =
            strategy.maximumPacksOnly || strategy.partitionCount
              ? [packs.length]
              : [
                  ...new Set([
                    packs.length,
                    Math.ceil(packs.length / 2),
                    Math.ceil(packs.length / 4),
                    1,
                  ]),
                ];
          for (const count of wanted) {
            const packed = packs[count - 1].flight;
            const earliest = Math.max(
                state.readySec,
                battery.readySec,
                serial
                  ? Math.max(0, ...sorties.map((s) => s.endSec)) +
                      d.planning.temporalBufferSec * 2
                  : 0,
              ),
              placed = findStart(d, context, packed, earliest, sorties, budget);
            if (!placed) continue;
            const prior = sorties.filter(
              (s) => s.vehicleId === state.vehicle.id,
            );
            if (
              maintenanceProjection(
                state.vehicle,
                prior.length + 1,
                prior.reduce((n, s) => n + s.durationSec, 0) +
                  placed.durationSec,
              ).withinLimit === false
            ) {
              if (
                !trace.some(
                  (x) =>
                    x.event === 'MAINTENANCE_REJECT' &&
                    x.detail.startsWith(state.vehicle.id + ':'),
                )
              )
                trace.push({
                  event: 'MAINTENANCE_REJECT',
                  detail: `${state.vehicle.id}: вылет превысил бы ресурс до ТО. Выберите другой БВС или проведите ТО и обновите наработку в парке.`,
                });
              continue;
            }
            if (
              d.planning.safetyPolicy &&
              groundSeparationConflicts(d, [...sorties, placed]).length
            ) {
              if (
                !trace.some(
                  (x) =>
                    x.event === 'GROUND_REJECT' &&
                    x.detail.startsWith(`${state.vehicle.id}:`),
                )
              )
                trace.push({
                  event: 'GROUND_REJECT',
                  detail: `${state.vehicle.id}: вариант отклонён из-за занятой площадки или опасного сближения со стоящим БВС. Автоматическое перемещение на земле не моделируется.`,
                });
              continue;
            }
            const score = strategy.partitionCount
              ? placed.endSec
              : objective === 'makespan'
                ? placed.endSec / count
                : placed.durationSec / count;
            choices.push({ sortie: placed, state, battery, count, score });
            if (
              !best ||
              score < best.score - EPS ||
              (Math.abs(score - best.score) < EPS &&
                placed.endSec < best.sortie.endSec)
            )
              best = { sortie: placed, state, battery, count, score };
          }
          if (serial && best) break;
        }
        if (serial && best) break;
      }
      if (best && strategy.repair) {
        choices.sort(
          (a, b) => a.score - b.score || a.sortie.endSec - b.sortie.endSec,
        );
        best = choices.shift()!;
        decisions.push({
          choices: choices.slice(0, 5),
          remaining: remaining.slice(),
          states: structuredClone(states),
          batteries: structuredClone(batteries),
          sortieCount: sorties.length,
          traceCount: trace.length,
        });
      }
      if (!best && strategy.repair && repairs < 24) {
        while (decisions.length && !best) {
          const decision = decisions.at(-1)!;
          if (!decision.choices.length) {
            decisions.pop();
            continue;
          }
          best = decision.choices.shift()!;
          for (let index = 0; index < states.length; index++)
            Object.assign(states[index], decision.states[index]);
          for (let index = 0; index < batteries.length; index++)
            Object.assign(batteries[index], decision.batteries[index]);
          sorties.length = decision.sortieCount;
          trace.length = decision.traceCount;
          remaining = decision.remaining.slice();
          repairs++;
          trace.push({
            event: 'SEARCH_REPAIR',
            detail: `${job.id}: откат назначения, попытка ${repairs}/24; другой БВС или размер пакета, без изменения входных ограничений.`,
          });
        }
      }
      if (!best) {
        notFound = true;
        trace.push({
          event: 'NO_ASSIGNMENT',
          detail: `${job.id}: не назначено ${remaining.length} полос; лимит группы ${vehicleLimit} БВС. ${trace
            .filter((x) => x.event === 'MAINTENANCE_REJECT')
            .map((x) => x.detail)
            .join(' ')} Ограниченный поиск, не доказательство невозможности.`,
        });
        break;
      }
      const { sortie, state, battery, count } = best;
      sorties.push(sortie);
      state.count++;
      state.readySec = sortie.readySec;
      state.position = context.geometry.forward(sortie.segments.at(-1)!.to);
      state.lastBatteryId = battery.id;
      battery.used++;
      battery.pct = sortie.remainingPct;
      battery.readySec = sortie.readySec;
      if (battery.rechargeSec !== null) {
        const chargingStart = Math.max(sortie.endSec, state.chargerReadySec);
        battery.readySec = chargingStart + battery.rechargeSec;
        battery.pct = 100;
        state.chargerReadySec = battery.readySec;
        trace.push({
          event: 'BATTERY_CHARGE',
          detail: `${battery.id}: модельная последовательная зарядка t=${chargingStart.toFixed(1)}..${battery.readySec.toFixed(1)} с; следующий ресурс 100%, только после этого события.`,
        });
      }
      remaining = remaining.slice(count);
      trace.push({
        event: 'SORTIE',
        detail: `${sortie.id}: ${job.id}, ${state.vehicle.id}, ${battery.id}, ${count} полос, t=${sortie.startSec.toFixed(1)}..${sortie.endSec.toFixed(1)} с, остаток ${sortie.remainingPct.toFixed(1)}%.`,
      });
    }
  }
  if (budget.exhausted)
    trace.push({
      event: 'BUDGET',
      detail:
        'Истёк вычислительный бюджет между ограниченными кандидатами. Не найденный план не равен доказанной неразрешимости.',
    });
  const candidate = candidateFromSorties(
    d,
    contexts,
    sorties,
    objective,
    `${objective}-${serial ? 'baseline' : perpendicular ? 'perpendicular' : 'planned'}`,
    trace,
    inputHash,
    createdAt,
    unsupported,
    notFound,
  );
  if (d.planning.altitudePreference !== 'balanced')
    candidate.assumptions.push(
      'Пожелание ниже/выше записано, но автоматический поиск высоты ещё не реализован: используется явно заданная высота каждой работы.',
    );
  return candidate;
}

/** Reproducible comparison route, not a claimed optimum. The objective gets
 * the same half of the requested CPU budget as in solveMissionDocument. */
export async function solveMissionSerialBaseline(
  input: unknown,
  objective: Scenario['objective'],
): Promise<MissionCandidate> {
  if (objective !== 'makespan' && objective !== 'flightTime')
    throw new Error('Неизвестный критерий сравнения.');
  const started = performance.now(),
    d = migrateMissionCameraBindings(parseMissionDocument(input)).document,
    inputHash = await sha256(d),
    createdAt = new Date().toISOString(),
    budgetMs = d.planning.maxComputeMs / 2,
    budget: Budget = {
      deadline: started + budgetMs,
      candidates: 0,
      exhausted: false,
    },
    candidate = schedule(
      d,
      objective,
      true,
      false,
      budget,
      inputHash,
      createdAt,
      GREEDY_STRATEGY,
    );
  candidate.plan.computationMs = performance.now() - started;
  candidate.trace.push({
    event: 'BASELINE_PROTOCOL',
    detail: `serial-one-sortie-at-a-time-v1: первая допустимая конфигурация в исходном порядке парка, один вылет одновременно; бюджет ${budgetMs} мс, ${budget.candidates} попыток. Вход, ограничения, ресурс и проверка совпадают с основным расчётом; глобальная оптимальность не заявляется.`,
  });
  return candidate;
}

/** Parallel reference: maximum prefix, original job/strip order, no repairs or
 * restarts. Uses the same full safety validator and unchanged input budget. */
export async function solveMissionParallelBaseline(
  input: unknown,
  objective: Scenario['objective'],
): Promise<MissionCandidate> {
  if (objective !== 'makespan' && objective !== 'flightTime')
    throw new Error('Неизвестный критерий сравнения.');
  const started = performance.now(),
    d = migrateMissionCameraBindings(parseMissionDocument(input)).document,
    inputHash = await sha256(d),
    budgetMs = d.planning.maxComputeMs / 2,
    budget: Budget = {
      deadline: started + budgetMs,
      candidates: 0,
      exhausted: false,
    },
    candidate = schedule(
      d,
      objective,
      false,
      false,
      budget,
      inputHash,
      new Date().toISOString(),
      GREEDY_STRATEGY,
    );
  candidate.plan.computationMs = performance.now() - started;
  candidate.trace.push({
    event: 'PARALLEL_BASELINE_PROTOCOL',
    detail: `parallel-maximum-prefix-v1: исходный порядок работ/полос, максимальный допустимый пакет, жадное назначение по ${objective}; одновременные вылеты разрешены и проверяются. Без откатов/смены направления полос. Бюджет ${budgetMs} мс; ${budget.candidates} попыток. Это контрольный алгоритм, не глобальный оптимум.`,
  });
  return candidate;
}

/** Exhaustive only within a deliberately small, finite family: at most three
 * jobs/aircraft and eight strips per job; one whole-job sortie, declared bearing
 * and deterministic route/earliest-placement procedure. Not a global route or
 * continuous-time optimum. `exhaustive` is false if the shared budget runs out. */
export async function solveMissionSmallAssignmentOracle(
  input: unknown,
  objective: Scenario['objective'],
) {
  if (objective !== 'makespan' && objective !== 'flightTime')
    throw new Error('Неизвестный критерий сравнения.');
  const started = performance.now(),
    d = migrateMissionCameraBindings(parseMissionDocument(input)).document,
    fleet = d.scenario.vehicles.filter((v) => v.enabled),
    contexts = d.jobs.map((job) => missionJobContext(d, job));
  if (
    d.jobs.length > 3 ||
    fleet.length > 3 ||
    contexts.some((c) => c.strips.length > 8)
  )
    throw new Error(
      'Малый эталон ограничен тремя работами/БВС и восемью полосами на работу.',
    );
  const assignments = d.jobs.map((job) =>
    fleet
      .filter(
        (v) =>
          v.jobs.includes(job.job.type) &&
          vehiclePlanningEligibility(v).supported &&
          (!job.assignedVehicleIds.length ||
            job.assignedVehicleIds.includes(v.id)),
      )
      .map((v) => v.id),
  );
  const maps: Record<string, string>[] = [];
  const enumerate = (index: number, choice: Record<string, string>) => {
    if (index === d.jobs.length) {
      maps.push({ ...choice });
      return;
    }
    for (const vehicleId of assignments[index]) {
      choice[d.jobs[index].id] = vehicleId;
      enumerate(index + 1, choice);
    }
  };
  enumerate(0, Object.create(null) as Record<string, string>);
  const permutations = (ids: string[]): string[][] =>
    ids.length < 2
      ? [ids]
      : ids.flatMap((id, i) =>
          permutations(ids.filter((_, j) => j !== i)).map((rest) => [
            id,
            ...rest,
          ]),
        );
  const orders = permutations(d.jobs.map((j) => j.id)),
    inputHash = await sha256(d),
    createdAt = new Date().toISOString(),
    budget: Budget = {
      deadline: started + d.planning.maxComputeMs,
      candidates: 0,
      exhausted: false,
    },
    metric = objective === 'makespan' ? 'makespanSec' : 'flightTimeSec';
  let candidate: MissionCandidate | null = null,
    examined = 0;
  for (const assignment of maps) {
    for (const order of orders) {
      if (overBudget(budget)) break;
      const proposed = schedule(
        d,
        objective,
        false,
        false,
        budget,
        inputHash,
        createdAt,
        {
          name: 'small-whole-job-assignment-oracle-v1',
          maximumPacksOnly: true,
          wholeJobsOnly: true,
          assignments: assignment,
          jobOrder: order,
        },
      );
      examined++;
      if (
        proposed.status === 'feasible_model' &&
        (!candidate ||
          proposed.metrics[metric] < candidate.metrics[metric] - EPS)
      )
        candidate = proposed;
    }
    if (budget.exhausted) break;
  }
  return {
    protocol: 'small-whole-job-assignment-oracle-v1' as const,
    family:
      'Все совместимые назначения и порядки работ; один вылет на работу, исходное направление полос, детерминированный маршрут и первый допустимый старт. Не глобальный оптимум маршрутов/времени.',
    inputHash,
    objective,
    examined,
    familySize: maps.length * orders.length,
    exhaustive: !budget.exhausted && examined === maps.length * orders.length,
    candidate,
    computationMs: performance.now() - started,
  };
}

export async function solveMissionDocument(
  input: unknown,
): Promise<MissionResult> {
  const started = performance.now(),
    migration = migrateMissionCameraBindings(parseMissionDocument(input)),
    d = migration.document,
    inputHash = await sha256(d),
    createdAt = new Date().toISOString(),
    candidates: MissionCandidate[] = [],
    pool: MissionCandidate[] = [],
    warnings: string[] = [...migration.warnings],
    searchedCaps = new Set<number>(),
    contextCache = new Map<string, JobContext>(),
    baselines = new Map<Scenario['objective'], Plan['baseline']>();
  const consider = (original: MissionCandidate, budget: Budget) => {
    if (original.status !== 'feasible_model') return original;
    pool.push(original);
    if (
      !d.planning.areaTransferPolicy ||
      !d.planning.batteryPolicy ||
      !d.planning.safetyPolicy
    )
      return original;
    let best = original;
    const contexts = d.jobs.map((job) =>
      cachedContext(
        d,
        job,
        Math.abs(
          (original.jobCoverage.find((j) => j.jobId === job.id)?.bearingDeg ??
            job.job.bearingDeg) - job.job.bearingDeg,
        ) > EPS,
        budget,
        d.scenario.vehicles.find(
          (v) =>
            v.id ===
            original.jobCoverage.find((j) => j.jobId === job.id)
              ?.cameraVehicleId,
        ),
      ),
    );
    for (const vehicle of d.scenario.vehicles) {
      for (let attempt = 0; attempt < 64 && !overBudget(budget); attempt++) {
        const own = best.sorties
          .filter((s) => s.vehicleId === vehicle.id)
          .sort((a, b) => a.startSec - b.startSec);
        if (own.length < 2) break;
        const a = own.at(-2)!,
          b = own.at(-1)!;
        const chainAttempt = joinAreaFlights(d, a, b, contexts),
          combined = chainAttempt.flight;
        if (!combined) {
          best.trace.push({
            event: 'AREA_TRANSFER_BLOCKED',
            detail: `${vehicle.id}: возврат между участками сохранён. ${chainAttempt.reason}`,
          });
          break;
        }
        const proposed = candidateFromSorties(
          d,
          contexts,
          best.sorties
            .filter((s) => s.id !== b.id)
            .map((s) => (s.id === a.id ? combined : s)),
          original.objective,
          original.id,
          [
            ...best.trace,
            {
              event: 'DIRECT_AREA_TRANSFER',
              detail: `${vehicle.id}: участки объединены в один вылет; исключена промежуточная посадка. Полный маршрут повторно проверен с остальными БВС, ограничениями и остатком батареи.`,
            },
          ],
          inputHash,
          createdAt,
          [],
          false,
        );
        if (
          proposed.status !== 'feasible_model' ||
          proposed.metrics.makespanSec > best.metrics.makespanSec + EPS
        ) {
          best.trace.push({
            event: 'AREA_TRANSFER_BLOCKED',
            detail: `${vehicle.id}: прямой переход отклонён. ${
              proposed.checks
                .filter((c) => c.status === 'fail')
                .slice(0, 2)
                .map((c) => c.title)
                .join('; ') || 'Не сокращает время завершения миссии.'
            }`,
          });
          break;
        }
        best = proposed;
        pool.push(best);
      }
    }
    if (!overBudget(budget)) {
      const compacted = compactMissionSchedule(d, best.sorties, contexts, () =>
        overBudget(budget),
      );
      if (compacted !== best.sorties) {
        const proposed = candidateFromSorties(
          d,
          contexts,
          compacted,
          original.objective,
          original.id,
          [
            ...best.trace,
            {
              event: 'SCHEDULE_COMPACTION',
              detail:
                'Убрано наземное ожидание после объединения участков. Сетка стартов 1 с; все исходные ограничения проверены заново. Глобальный оптимум не заявляется.',
            },
          ],
          inputHash,
          createdAt,
          [],
          false,
        );
        if (
          proposed.status === 'feasible_model' &&
          betterMission(proposed, best, original.objective)
        ) {
          best = proposed;
          pool.push(best);
        }
      }
    }
    return best;
  };
  // Budget is shared across both objectives, never multiplied by fleet size.
  for (const objective of ['makespan', 'flightTime'] as const) {
    const deadline =
        started +
        d.planning.maxComputeMs * (objective === 'makespan' ? 0.5 : 1),
      budget: Budget = {
        deadline,
        candidates: 0,
        exhausted: false,
        contexts: contextCache,
      },
      planned = schedule(
        d,
        objective,
        false,
        false,
        budget,
        inputHash,
        createdAt,
        { ...GREEDY_STRATEGY, constrainedJobsFirst: !!d.planning.maxVehicles },
      );
    searchedCaps.add(d.planning.maxVehicles ?? d.scenario.vehicles.length);
    let best = consider(planned, budget);
    let baseline: MissionCandidate | null = null;
    if (!overBudget(budget)) {
      baseline = schedule(
        d,
        objective,
        true,
        false,
        budget,
        inputHash,
        createdAt,
        GREEDY_STRATEGY,
      );
      // Baseline intentionally retains independent base-to-base flights.
      if (baseline.status === 'feasible_model') pool.push(baseline);
      if (
        baseline.status === 'feasible_model' &&
        (best.status !== 'feasible_model' ||
          betterMission(baseline, best, objective))
      )
        best = baseline;
    }
    const strategies: { strategy: SearchStrategy; perpendicular: boolean }[] = [
      // Each optical layout has its own height, footprint, strip grid and gates.
      // Mixed-optics residual tiling is intentionally outside this bounded search.
      ...Array.from(
        { length: Math.min(12, d.scenario.vehicles.length) - 1 },
        (_, i) => ({
          strategy: {
            ...GREEDY_STRATEGY,
            name: `camera-layout-${i + 1}-v1`,
            cameraIndex: i + 1,
          },
          perpendicular: false,
        }),
      ),
      // Explore whole-job route orders cheaply before spending the budget on
      // one-second start scans. Joining + compaction removes conservative waits.
      ...(d.jobs.length > 1
        ? missionJobOrders(d.jobs.map((j) => j.id)).map((order, i) => ({
            strategy: {
              name: `joint-order-${i}-coarse-v1`,
              jobOrder: order,
              maximumPacksOnly: true,
            },
            perpendicular: false,
          }))
        : []),
      ...missionJobOrders(d.jobs.map((j) => j.id)).map((order, i) => ({
        strategy: {
          name: `joint-order-${i}-v1`,
          jobOrder: order,
          maximumPacksOnly: true,
          preciseStarts: true,
        },
        perpendicular: false,
      })),
      ...(d.scenario.vehicles.filter((v) => v.enabled).length > 2 &&
      (d.planning.maxVehicles ?? 20) > 2
        ? missionJobOrders(d.jobs.map((j) => j.id)).map((order, i) => ({
            strategy: {
              name: `joint-order-${i}-cap-2-v1`,
              jobOrder: order,
              maximumPacksOnly: true,
              preciseStarts: true,
              maxVehicles: 2,
            },
            perpendicular: false,
          }))
        : []),
      ...[1, 2, 3]
        .filter(
          (count) =>
            count < (d.planning.maxVehicles ?? d.scenario.vehicles.length),
        )
        .map((count) => ({
          strategy: {
            name: `fleet-cap-${count}-v1`,
            maxVehicles: count,
            partitionCount: count,
            constrainedJobsFirst: true,
          },
          perpendicular: false,
        })),
      ...[2, 3, 4]
        .filter(
          (count) =>
            count <= d.scenario.vehicles.filter((v) => v.enabled).length,
        )
        .flatMap((count) =>
          [false, true].map((reverseStrips) => ({
            strategy: {
              name: `spatial-partition-${count}${reverseStrips ? '-reverse' : ''}-v1`,
              partitionCount: count,
              reverseStrips,
            },
            perpendicular: false,
          })),
        ),
      {
        strategy: { name: 'adaptive-packs-repair-v2', repair: true },
        perpendicular: false,
      },
      ...(d.jobs.some((j) => j.job.autoBearing)
        ? [
            {
              strategy: { name: 'perpendicular-adaptive-v2', repair: true },
              perpendicular: true,
            },
          ]
        : []),
      {
        strategy: {
          name: 'reverse-strips-v2',
          reverseStrips: true,
          repair: true,
        },
        perpendicular: false,
      },
      ...(d.jobs.length > 1
        ? [
            {
              strategy: {
                name: 'scarce-capability-first-v2',
                constrainedJobsFirst: true,
                repair: true,
              },
              perpendicular: false,
            },
            {
              strategy: {
                name: 'reverse-job-order-v2',
                reverseJobs: true,
                repair: true,
              },
              perpendicular: false,
            },
          ]
        : []),
    ];
    for (const trial of strategies) {
      if (overBudget(budget)) break;
      // A difficult branch cannot consume every subsequent restart: remaining
      // time is apportioned. The parent objective budget is never multiplied.
      const trialBudget: Budget = {
        deadline: Math.min(
          budget.deadline,
          performance.now() +
            Math.max(10, (budget.deadline - performance.now()) / 2),
        ),
        candidates: 0,
        exhausted: false,
        contexts: contextCache,
      };
      const scheduled = schedule(
        d,
        objective,
        false,
        trial.perpendicular,
        trialBudget,
        inputHash,
        createdAt,
        trial.strategy,
      );
      if (trial.strategy.maxVehicles)
        searchedCaps.add(trial.strategy.maxVehicles);
      budget.candidates += trialBudget.candidates;
      const alternative = consider(scheduled, trialBudget);
      if (
        (alternative.status === 'feasible_model' &&
          (best.status !== 'feasible_model' ||
            betterMission(alternative, best, objective))) ||
        (best.status !== 'feasible_model' &&
          alternative.status !== 'feasible_model' &&
          alternative.metrics.grossCoveragePct >
            best.metrics.grossCoveragePct + EPS)
      )
        best = alternative;
    }
    if (baseline?.status === 'feasible_model') {
      best.plan.baseline = {
        makespanSec: baseline.metrics.makespanSec,
        flightTimeSec: baseline.metrics.flightTimeSec,
        distanceM: baseline.metrics.distanceM,
      };
      baselines.set(objective, best.plan.baseline);
    }
    best.id = objective;
    best.plan.computationMs = performance.now() - started;
    best.trace.push({
      event: 'SEARCH',
      detail: `${budget.candidates} ограниченных попыток упаковки; baseline ${baseline?.status ?? 'не проверен в бюджете'}; оптимальность не доказана.`,
    });
    candidates.push(best);
    if (budget.exhausted)
      warnings.push(
        `${objective}: достигнут бюджет поиска; лучшие найденные варианты не обязательно оптимальны.`,
      );
  }
  // Both objectives share all known validated routes. Never display a plan that
  // is worse on its own objective than another plan already present in memory.
  for (let i = 0; i < candidates.length; i++) {
    const objective = candidates[i].objective,
      metric = objective === 'makespan' ? 'makespanSec' : 'flightTimeSec',
      winner = pool.reduce<MissionCandidate | null>(
        (best, c) => (!best || betterMission(c, best, objective) ? c : best),
        null,
      );
    if (winner) {
      const chosen = structuredClone(winner);
      chosen.id = objective;
      chosen.objective = objective;
      chosen.plan.scenario.objective = objective;
      chosen.plan.baseline = baselines.get(objective) ?? null;
      chosen.trace.push({
        event: 'COMMON_CANDIDATE_POOL',
        detail: `Выбран минимум ${metric} среди ${pool.length} найденных и проверенных кандидатов обеих целей; глобальная оптимальность не доказана.`,
      });
      candidates[i] = chosen;
    }
  }
  if (candidates.every((c) => c.status !== 'feasible_model'))
    warnings.push(
      'Полный допустимый план не получен. Частичные/неподдержанные результаты нельзя подтверждать как готовое выполнение задания.',
    );
  warnings.push(
    'Модельная проверка не является разрешением реального полёта; внешние БВС, актуальные воздушные запреты и реальные свойства оборудования не установлены автоматически.',
  );
  const recommendation = buildMissionRecommendation(d, pool, candidates);
  return {
    schemaVersion: '2.0',
    engineVersion: MISSION_ENGINE_VERSION,
    inputHash,
    createdAt,
    document: d,
    candidates,
    resourceStudy: buildResourceStudy(d, pool, searchedCaps),
    ...(recommendation ? { recommendation } : {}),
    computationMs: performance.now() - started,
    warnings,
  };
}
