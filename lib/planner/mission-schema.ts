import { z } from 'zod';
import {
  scenarioSchema,
  polygon,
  coordinate,
  parseScenario,
} from './schema.ts';
import type { Scenario, Mission, Plan, Check, Polygon } from './schema.ts';

export const MISSION_VERSION = '2.0' as const;
export const MAX_MISSION_FILE_BYTES = 200 * 1024;
export const MISSION_ENGINE_VERSION = '0.3.0';
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
    assignedVehicleIds: z.array(id).max(10),
    quality: qualitySchema,
    daylight: z.enum(['none', 'sunAboveHorizon', 'topographicClearSky']),
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
        maxComputeMs: num(100, 30000).int(),
        altitudePreference: z.enum(['balanced', 'lower', 'higher']),
        windModel: z.enum(['constantAirspeed', 'constantGroundSpeed']),
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
    flightEnvelope: z
      .object({
        minSurveyAltitudeM: num(0, 1000),
        maxAltitudeM: num(10, 6000),
        source: text,
      })
      .strict(),
    // No default: omitted legacy weather stays omitted, including in input hashes.
    environment: missionEnvironmentSchema.optional(),
    notes: z.string().max(2000),
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
  for (const b of d.batteries)
    if (!ids.has(b.vehicleId))
      throw new Error(`Батарея ${b.id}: неизвестный БВС.`);
  for (const j of d.jobs) {
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
      maxAltitudeM: 500,
      source:
        'Учебный диапазон сценария, не разрешение воздушного пространства.',
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
  computationMs: number;
  warnings: string[];
};
export type MissionRecommendation = {
  candidate: MissionCandidate;
  policy: 'balanced-normalized-v1';
  weights: { makespan: 0.5; flightTime: 0.5 };
  score: number;
  normalized: { makespan: number; flightTime: number };
  ranges: {
    makespanSec: { min: number; max: number };
    flightTimeSec: { min: number; max: number };
  };
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
