import { z } from 'zod';
import { AUTO_ALTITUDE_CEILING_M } from './altitude-policy.ts';
import { obstacleSourceSchema } from './obstacle-layer.ts';
import { missionWeatherSchema } from './mission-weather.ts';
import { catalogSourceSchema, checkCatalogSources } from './mission-catalog.ts';
import { airspaceAltitudeReferenceSchema } from './airspace-altitudes.ts';
import {
  scenarioSchema,
  polygon,
  coordinate,
  parseScenario,
} from './schema.ts';
import type { Scenario, Mission, Plan, Check, Polygon } from './schema.ts';

export const MISSION_VERSION = '2.0' as const;
export const MAX_MISSION_FILE_BYTES = 200 * 1024;
export const MISSION_ENGINE_VERSION = '0.4.0';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/);
const text = z.string().min(1).max(500);
const num = (min: number, max: number) => z.number().min(min).max(max);
const instant = z.iso.datetime({ offset: true });
export const qualitySchema = z
  .object({
    mode: z.enum(['manual', 'camera', 'lidar', 'geophysics']),
    status: z.enum(['documented', 'assumed', 'unknown']),
    source: text,
    sensorWidthMm: num(0.1, 100).optional(),
    sensorHeightMm: num(0.1, 100).optional(),
    focalLengthMm: num(0.1, 1000).optional(),
    imageWidthPx: num(1, 100000).int().optional(),
    imageHeightPx: num(1, 100000).int().optional(),
    forwardOverlap: num(0, 0.95).optional(),
    minimumIntervalSec: num(0.01, 60).optional(),
    maximumGsdCm: num(0.01, 1000).optional(),
    // Omitted preserves the explicit height and hashes of existing documents.
    altitudeMode: z.enum(['fixed', 'gsd']).optional(),
    shutterSec: num(0.000001, 10).optional(),
    maximumBlurPx: num(0.01, 100).optional(),
    fieldOfViewDeg: num(1, 170).optional(),
    pulseRateHz: num(1, 2000000).optional(),
    minimumDensityM2: num(0.01, 10000).optional(),
    sampleRateHz: num(0.01, 10000).optional(),
    maximumSampleSpacingM: num(0.01, 1000).optional(),
    sensorOffsetM: num(0, 100).optional(),
  })
  .strict();
export type QualityProfile = z.infer<typeof qualitySchema>;
export const missionJobSchema = z
  .object({
    id,
    name: z.string().min(1).max(100),
    area: polygon,
    job: scenarioSchema.shape.job,
    assignedVehicleIds: z.array(id).max(20),
    quality: qualitySchema,
    daylight: z.enum(['none', 'sunAboveHorizon', 'topographicClearSky']),
    // Optional extension: old documents retain their exact canonical hashes.
    window: z.object({ start: instant, end: instant }).strict().optional(),
    inheritsFrom: id.optional(),
    // Omitted = automatic. Optional fields preserve existing document hashes.
    priority: num(1, 8).int().optional(),
    workPriority: num(1, 5).int().optional(),
  })
  .strict();
export const missionEnvironmentSchema = z
  .object({
    // These are engineering input bounds, not regulatory weather minima.
    // Cloud heights share the trajectory's common start/flat-plane datum.
    cloudBaseM: num(0, 20000).nullable(),
    cloudClearanceM: num(0, 6000),
    visibilityM: num(0, 100000).nullable(),
    minVisibilityM: num(0, 100000).nullable(),
    source: text,
  })
  .strict();
export type MissionEnvironment = z.infer<typeof missionEnvironmentSchema>;
export const missionDocumentSchema = z
  .object({
    schemaVersion: z.literal(MISSION_VERSION),
    id,
    name: z.string().min(1).max(100),
    scenario: scenarioSchema,
    bases: z
      .array(
        z
          .object({
            id,
            name: z.string().min(1).max(100),
            coordinate,
            // Optional explicit pads: base centre alone never implies capacity.
            landingPads: z
              .array(
                z
                  .object({
                    id,
                    coordinate,
                    enabled: z.boolean(),
                    kinds: z
                      .array(z.enum(['multirotor', 'fixedWing']))
                      .min(1)
                      .max(2),
                  })
                  .strict(),
              )
              .min(1)
              .max(20)
              .optional(),
          })
          .strict(),
      )
      .max(40)
      .optional(),
    revisionSource: z
      .object({
        operationId: id,
        integrityHash: z.string().regex(/^[a-f0-9]{64}$/),
        rootMissionId: id,
        progressSec: num(0, 604800),
        reason: text,
        coverage: z
          .array(
            z
              .object({
                jobId: id,
                completedM2: num(0, 1e12),
                remainingM2: num(0, 1e12),
              })
              .strict(),
          )
          .max(8),
      })
      .strict()
      .optional(),
    jobs: z.array(missionJobSchema).min(1).max(8),
    window: z
      .object({
        start: instant,
        end: instant,
        timezone: z.string().min(1).max(80),
      })
      .strict(),
    planning: z
      .object({
        preparationSec: num(0, 7200),
        serviceSec: num(1, 14400),
        separationHorizontalM: num(1, 2000),
        separationVerticalM: num(1, 500),
        temporalBufferSec: num(0, 600),
        separationSource: text,
        maxSortiesPerVehicle: num(1, 30).int(),
        // Distinct aircraft over the entire mission, not concurrent flights.
        maxVehicles: num(1, 20).int().optional(),
        maxComputeMs: num(100, 30000).int(),
        altitudePreference: z.enum(['balanced', 'lower', 'higher']),
        windModel: z.enum(['constantAirspeed', 'constantGroundSpeed']),
        // Optional, never defaulted: historical input hashes must stay unchanged.
        batteryPolicy: z.literal('installed-current-v1').optional(),
        safetyPolicy: z.literal('continuous-occupancy-v1').optional(),
        areaTransferPolicy: z.literal('compatible-work-v1').optional(),
      })
      .strict(),
    batteries: z
      .array(
        z
          .object({
            id,
            vehicleId: id,
            name: z.string().min(1).max(100),
            initialPct: num(0, 100),
            readyAt: instant,
            rechargeSec: num(60, 86400).nullable(),
            cycles: num(0, 100000).int().nullable(),
            commissionedAt: z.iso.date().nullable(),
            source: text,
          })
          .strict(),
      )
      .min(1)
      .max(100),
    restrictions: z
      .array(
        z
          .object({
            id,
            name: z.string().min(1).max(100),
            kind: z.enum(['noFlight', 'obstacle']),
            geometry: polygon,
            minAltitudeM: num(-500, 6000),
            maxAltitudeM: num(-500, 6000).nullable(),
            startAt: instant.nullable(),
            endAt: instant.nullable(),
            source: text,
          })
          .strict(),
      )
      .max(20),
    terrainModel: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('unknown'), source: text }).strict(),
      z
        .object({
          kind: z.literal('flat'),
          elevationM: num(-500, 6000),
          source: text,
        })
        .strict(),
    ]),
    // Optional to preserve source documents/hashes; legacy simulation uses the declared ISA default.
    airspaceAltitudeReference: airspaceAltitudeReferenceSchema.optional(),
    flightEnvelope: z
      .object({
        minSurveyAltitudeM: num(0, 1000),
        maxAltitudeM: num(10, 6000),
        source: text,
      })
      .strict(),
    // No default: omitted legacy weather stays omitted, including in input hashes.
    environment: missionEnvironmentSchema.optional(),
    weather: missionWeatherSchema.optional(),
    fleetSnapshot: z
      .array(
        z
          .object({
            vehicleId: id,
            revision: z.number().int().min(1),
            unavailable: z.boolean().optional(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    // Optional snapshot of other runs at calculation time, not live telemetry.
    resourceReservations: z
      .array(
        z
          .object({
            vehicleId: id,
            operationId: z.string().min(1).max(120),
            missionName: z.string().min(1).max(200),
            status: z.enum(['scheduled', 'running', 'paused']),
            startAt: instant,
            endAt: instant.nullable(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    notes: z.string().max(2000),
    // Immutable attachment travels with a run; ordinary mission fields keep their 200 KiB budget.
    obstacleLayer: obstacleSourceSchema.optional(),
    catalogLayers: z.array(catalogSourceSchema).max(2).optional(),
  })
  .strict();
export type MissionDocument = z.infer<typeof missionDocumentSchema>;
export type MissionJob = MissionDocument['jobs'][number];
export type MissionRestriction = MissionDocument['restrictions'][number];

export function parseMissionDocument(value: unknown): MissionDocument {
  const d = missionDocumentSchema.parse(value);
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length)
      throw new Error(`${label}: повторяющиеся идентификаторы.`);
  };
  parseScenario(d.scenario);
  for (const vehicle of d.scenario.vehicles) {
    unique(
      (vehicle.cameraProfiles ?? []).map((c) => c.id),
      `Камеры ${vehicle.id}`,
    );
    unique(vehicle.cameraIds ?? [], `Установленные камеры ${vehicle.id}`);
    if (
      (vehicle.cameraIds ?? []).some(
        (id) => !vehicle.cameraProfiles?.some((c) => c.id === id),
      )
    )
      throw new Error(
        `БВС ${vehicle.id}: выбранная камера отсутствует в снимках профилей.`,
      );
  }
  if (d.catalogLayers) checkCatalogSources(d.catalogLayers);
  if (d.bases) {
    unique(
      d.bases.map((b) => b.id),
      'Базы',
    );
    unique(
      d.bases.map((b) => b.coordinate.join(',')),
      'Координаты баз',
    );
    for (const base of d.bases)
      if (base.landingPads) {
        unique(
          base.landingPads.map((p) => p.id),
          `Посадочные места ${base.name}`,
        );
        unique(
          base.landingPads.map((p) => p.coordinate.join(',')),
          `Координаты мест ${base.name}`,
        );
      }
  }
  for (const job of d.jobs)
    if (job.inheritsFrom) {
      const parent = d.jobs.find((j) => j.id === job.inheritsFrom);
      if (
        !parent ||
        parent.inheritsFrom ||
        parent.id === job.id ||
        parent.job.type !== job.job.type
      )
        throw new Error('Неверный источник общих параметров работы.');
      for (const key of [
        'job',
        'quality',
        'daylight',
        'window',
        'assignedVehicleIds',
      ] as const)
        if (JSON.stringify(job[key]) !== JSON.stringify(parent[key]))
          throw new Error(
            'Унаследованные параметры участка расходятся с параметрами работы.',
          );
    }
  unique(
    d.jobs.map((x) => x.id),
    'Работы',
  );
  unique(
    d.batteries.map((x) => x.id),
    'Батареи',
  );
  unique(
    d.restrictions.map((x) => x.id),
    'Ограничения',
  );
  if (
    Date.parse(d.window.end) <= Date.parse(d.window.start) ||
    Date.parse(d.window.end) - Date.parse(d.window.start) > 7 * 86400000
  )
    throw new Error('Окно миссии должно быть положительным и не более 7 дней.');
  try {
    new Intl.DateTimeFormat('ru', { timeZone: d.window.timezone }).format();
  } catch {
    throw new Error('Неизвестный часовой пояс.');
  }
  const ids = new Set(d.scenario.vehicles.map((x) => x.id));
  for (const reservation of d.resourceReservations ?? []) {
    if (
      !ids.has(reservation.vehicleId) ||
      (reservation.endAt !== null &&
        Date.parse(reservation.endAt) <= Date.parse(reservation.startAt))
    )
      throw new Error(
        'Занятость БВС: неизвестный аппарат или неверный период.',
      );
  }
  if (d.planning.batteryPolicy === 'installed-current-v1') {
    for (const v of d.scenario.vehicles) {
      const installed = d.batteries.filter((b) => b.vehicleId === v.id);
      if (
        installed.length !== 1 ||
        installed[0].rechargeSec !== null ||
        installed[0].initialPct !== v.batteryPct
      )
        throw new Error(
          `БВС ${v.id}: нужна одна текущая батарея с согласованным зарядом, без прогнозируемой зарядки.`,
        );
    }
  }
  if (d.fleetSnapshot) {
    unique(
      d.fleetSnapshot.map((s) => s.vehicleId),
      'Снимок парка',
    );
    if (d.fleetSnapshot.some((s) => !ids.has(s.vehicleId)))
      throw new Error('Снимок парка ссылается на неизвестный БВС.');
  }
  for (const b of d.batteries)
    if (!ids.has(b.vehicleId))
      throw new Error(`Батарея ${b.id}: неизвестный БВС.`);
  for (const j of d.jobs) {
    if (
      j.window &&
      (Date.parse(j.window.end) <= Date.parse(j.window.start) ||
        Date.parse(j.window.start) < Date.parse(d.window.start) ||
        Date.parse(j.window.end) > Date.parse(d.window.end))
    )
      throw new Error(
        `Работа ${j.name}: период должен находиться внутри периода миссии и иметь положительную длительность.`,
      );
    unique(j.assignedVehicleIds, `Работа ${j.id}`);
    if (j.assignedVehicleIds.some((x) => !ids.has(x)))
      throw new Error(`Работа ${j.id}: неизвестный назначенный БВС.`);
  }
  for (const r of d.restrictions) {
    if (r.maxAltitudeM !== null && r.maxAltitudeM < r.minAltitudeM)
      throw new Error(`Ограничение ${r.id}: неверный интервал высот.`);
    if ((r.startAt === null) !== (r.endAt === null))
      throw new Error(`Ограничение ${r.id}: задайте обе границы времени.`);
    if (r.startAt && r.endAt && Date.parse(r.endAt) <= Date.parse(r.startAt))
      throw new Error(`Ограничение ${r.id}: неверный интервал времени.`);
  }
  if (d.flightEnvelope.minSurveyAltitudeM > d.flightEnvelope.maxAltitudeM)
    throw new Error('Минимальная высота выше потолка.');
  return d;
}

export function migrateScenario(
  scenario: Scenario,
  missionId = 'imported-mission',
): MissionDocument {
  const s = parseScenario(scenario);
  return parseMissionDocument({
    schemaVersion: MISSION_VERSION,
    id: missionId,
    name: s.name,
    scenario: s,
    jobs: [
      {
        id: 'job-01',
        name: 'Съёмка территории',
        area: s.area,
        job: s.job,
        assignedVehicleIds: [],
        quality: {
          mode: 'manual',
          status: 'assumed',
          source: s.job.qualitySource,
        },
        daylight: 'none',
      },
    ],
    window: {
      start: '2026-09-24T10:00:00+03:00',
      end: '2026-09-24T18:00:00+03:00',
      timezone: 'Europe/Moscow',
    },
    planning: {
      preparationSec: 120,
      serviceSec: 180,
      separationHorizontalM: 30,
      separationVerticalM: 15,
      temporalBufferSec: 5,
      separationSource: 'Учебные допуски, не подтверждённая норма жюри.',
      maxSortiesPerVehicle: 8,
      maxComputeMs: 6000,
      altitudePreference: 'balanced',
      windModel: 'constantGroundSpeed',
    },
    batteries: s.vehicles.map((v) => ({
      id: `${v.id}-battery-01`,
      vehicleId: v.id,
      name: `АКБ · ${v.name}`,
      initialPct: v.batteryPct,
      readyAt: '2026-09-24T10:00:00+03:00',
      rechargeSec: null,
      cycles: null,
      commissionedAt: null,
      source:
        'Перенесён начальный заряд v1; срок службы/перезарядка неизвестны.',
    })),
    restrictions: [],
    terrainModel: { kind: 'unknown', source: 'В сценарии v1 рельеф не задан.' },
    flightEnvelope: {
      minSurveyAltitudeM: 10,
      maxAltitudeM: AUTO_ALTITUDE_CEILING_M,
      source:
        'Предел трека ниже 150 м AGL; потолок 149 м включает модельный запас 1 м. Не разрешение на полёт.',
    },
    notes:
      'Импорт v1: дата, наземные времена и разнесение заданы как учебные значения. Подтвердите их перед расчётом.',
  });
}

export type MissionEvent = {
  timeSec: number;
  type:
    | 'prepare'
    | 'takeoff'
    | 'survey'
    | 'landing'
    | 'service'
    | 'battery'
    | 'complete';
  vehicleId: string;
  sortieId?: string;
  batteryId?: string;
  detail: string;
};
export type ScheduledSortie = Mission & {
  id: string;
  jobId: string;
  batteryId: string;
  cameraId?: string;
  startSec: number;
  endSec: number;
  readySec: number;
  segments: Mission['segments'];
};
export type MissionCandidate = {
  id: string;
  objective: Scenario['objective'];
  status:
    | 'feasible_model'
    | 'invalid'
    | 'not_found'
    | 'partial'
    | 'unsupported';
  plan: Plan;
  sorties: ScheduledSortie[];
  checks: Check[];
  events: MissionEvent[];
  metrics: {
    makespanSec: number;
    flightTimeSec: number;
    distanceM: number;
    sortieCount: number;
    vehicleCount: number;
    coveragePct: number;
    grossCoveragePct: number;
    batteryChanges: number;
    minimumRemainingPct: number;
  };
  jobCoverage: {
    jobId: string;
    cameraProfileId?: string;
    cameraVehicleId?: string;
    bearingDeg: number;
    grossAreaHa: number;
    targetAreaHa: number;
    coveragePct: number;
    grossCoveragePct: number;
  }[];
  assumptions: string[];
  trace: Plan['trace'];
};
export type MissionResult = {
  schemaVersion: '2.0';
  engineVersion: string;
  inputHash: string;
  createdAt: string;
  document: MissionDocument;
  candidates: MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourceStudy?: {
    maxVehicles: number | null;
    deadlineSec: number;
    rows: {
      maxVehicles: number;
      status: 'found' | 'not_found' | 'not_searched';
      vehicleCount: number | null;
      makespanSec: number | null;
      flightTimeSec: number | null;
    }[];
    scope: string;
  };
  computationMs: number;
  warnings: string[];
};
export type MissionRecommendation = {
  candidate: MissionCandidate;
  policy: 'deadline-min-flight-v1';
  deadlineSec: number;
  slackSec: number;
  poolSize: number;
  distinctPlanCount: number;
  samePlan: boolean;
  samePlanAs: Scenario['objective'][];
  explanation: string;
  resourceProxy: 'flightTimeSec';
};
export type MissionApproval = {
  inputHash: string;
  candidateId: string;
  planHash: string;
  approvedAt: string;
};

/** Stable hash input: object key order is not meaningful; array order is meaningful. */
export function canonicalStringify(value: unknown): string {
  const normalize = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(normalize)
      : v !== null && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, x]) => [k, normalize(x)]),
          )
        : v;
  return JSON.stringify(normalize(value));
}
export async function sha256(value: unknown): Promise<string> {
  return sha256Text(canonicalStringify(value));
}
export async function sha256Text(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
}
export type { Scenario, Polygon };
export { coordinate };
