import { z } from 'zod';

export const ENGINE_VERSION = '0.1.0';
export const coordinate = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-70).max(70),
]);
const ring = z.array(coordinate).min(4).max(70);
export const polygon = z
  .object({
    type: z.literal('Polygon'),
    coordinates: z.array(ring).min(1).max(5),
  })
  .strict();
const finite = (min: number, max: number) => z.number().min(min).max(max);
export const scenarioSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    name: z.string().min(1).max(100),
    area: polygon,
    airspace: polygon,
    exclusions: z.array(polygon).max(5),
    reserveSites: z.array(coordinate).max(10),
    job: z
      .object({
        type: z.enum(['RGB', 'MS', 'IR', 'LiDAR', 'Geophysics']),
        altitudeM: finite(10, 500),
        swathM: finite(5, 500),
        sideOverlap: finite(0, 0.95),
        triggerDistanceM: finite(1, 200),
        bearingDeg: finite(0, 179),
        autoBearing: z.boolean(),
        qualitySource: z.string().min(1).max(400),
      })
      .strict(),
    wind: z
      .object({ speedMps: finite(0, 30), fromDeg: finite(0, 359) })
      .strict(),
    reservePct: finite(10, 80),
    clearanceM: finite(2, 100),
    objective: z.enum(['makespan', 'flightTime']),
    terrain: z.literal('unknown'),
    vehicles: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-zA-Z0-9_-]{1,30}$/),
            name: z.string().min(1).max(60),
            model: z.enum(['Gemini', '801', '201', 'Custom']),
            kind: z.enum(['multirotor', 'fixedWing']),
            enabled: z.boolean(),
            airspeedMps: finite(2, 40),
            maxWindMps: finite(0, 25),
            batteryPct: finite(0, 100),
            effectiveEnduranceMin: finite(1, 240),
            climbMps: finite(0.5, 10),
            descentMps: finite(0.3, 10),
            turnSeconds: finite(0, 30),
            start: coordinate,
            landing: coordinate,
            jobs: z
              .array(z.enum(['RGB', 'MS', 'IR', 'LiDAR', 'Geophysics']))
              .min(1)
              .max(5),
            assumptions: z.array(z.string().min(1).max(400)).min(1).max(10),
            source: z.string().max(400),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();

export type Scenario = z.infer<typeof scenarioSchema>;
export type Vehicle = Scenario['vehicles'][number];
export type Coordinate = z.infer<typeof coordinate>;
export type Polygon = z.infer<typeof polygon>;
export type Phase =
  | 'takeoff'
  | 'transit'
  | 'survey'
  | 'turn'
  | 'return'
  | 'landing';
export type Segment = {
  from: Coordinate;
  to: Coordinate;
  phase: Phase;
  altitudeFromM: number;
  altitudeToM: number;
  airspeedMps: number;
  groundSpeedMps: number;
  distanceM: number;
  startSec: number;
  endSec: number;
  batteryFromPct: number;
  batteryToPct: number;
  stripId?: number;
};
export type Mission = {
  vehicleId: string;
  name: string;
  segments: Segment[];
  durationSec: number;
  distanceM: number;
  remainingPct: number;
  strips: number;
  shots: number | null;
};
export type Check = {
  id: string;
  status: 'pass' | 'fail' | 'unknown';
  title: string;
  detail: string;
};
export type Plan = {
  engineVersion: string;
  scenario: Scenario;
  inputHash: string;
  createdAt: string;
  status: 'invalid' | 'undetermined';
  missions: Mission[];
  checks: Check[];
  metrics: {
    areaHa: number;
    targetHa: number;
    excludedHa: number;
    coveragePct: number;
    makespanSec: number;
    flightTimeSec: number;
    distanceM: number;
    stripCount: number;
    bearingDeg: number;
  };
  baseline: {
    makespanSec: number;
    flightTimeSec: number;
    distanceM: number;
  } | null;
  trace: { event: string; detail: string }[];
  computationMs: number;
};

export function parseScenario(value: unknown): Scenario {
  const result = scenarioSchema.parse(value);
  if (new Set(result.vehicles.map((v) => v.id)).size !== result.vehicles.length)
    throw new Error('Идентификаторы БВС должны быть уникальны.');
  return result;
}
