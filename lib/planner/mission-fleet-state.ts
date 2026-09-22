import { z } from 'zod';
import { scenarioSchema } from './schema.ts';
import {
  missionDocumentSchema,
  parseMissionDocument,
} from './mission-schema.ts';
import type { MissionDocument } from './mission-schema.ts';
import { assertSafeTree, checkMissionSize } from './mission-io.ts';

export const FLEET_STATE_STORE = 'fleet-state';
const instant = z.iso.datetime({ offset: true });
export const fleetStateSchema = z
  .object({
    id: scenarioSchema.shape.vehicles.element.shape.id,
    revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    observedAt: instant,
    source: z.enum(['simulation', 'operator']),
    ready: z.boolean(),
    grounded: z.boolean(),
    preparationRemainingSec: z.number().min(0).max(14400),
    vehicle: scenarioSchema.shape.vehicles.element,
    battery: missionDocumentSchema.shape.batteries.element,
    operationId: z.string().nullable(),
    lastEvent: z.string().max(500),
    replacements: z
      .array(
        z
          .object({
            at: instant,
            fromId: z.string(),
            toId: z.string(),
            pct: z.number().min(0).max(100),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
export type FleetState = z.infer<typeof fleetStateSchema>;
export type FleetReport = {
  expectedRevision: number;
  state: FleetState;
  replacement: boolean;
};

export function parseFleetState(value: unknown): FleetState {
  assertSafeTree(value);
  const s = fleetStateSchema.parse(value);
  if (
    s.id !== s.vehicle.id ||
    s.id !== s.battery.vehicleId ||
    s.vehicle.batteryPct !== s.battery.initialPct ||
    s.battery.rechargeSec !== null ||
    (s.ready && !s.grounded)
  )
    throw new Error(
      'Состояние БВС, текущая батарея и готовность противоречат друг другу.',
    );
  return s;
}

/** Explicit migration for NEW working drafts only; never mutate a saved run. */
export function installedBatteryDocument(
  input: MissionDocument,
): MissionDocument {
  const d = structuredClone(input);
  d.planning.safetyPolicy = 'continuous-occupancy-v1';
  if (d.planning.batteryPolicy) return parseMissionDocument(d);
  d.planning.batteryPolicy = 'installed-current-v1';
  d.batteries = d.scenario.vehicles.map((v) => {
    const existing = d.batteries.find((b) => b.vehicleId === v.id);
    // First listed battery is explicitly selected when converting a legacy draft.
    const b = existing ?? {
      id: `${v.id}-current`,
      vehicleId: v.id,
      name: `Текущая · ${v.name}`,
      initialPct: v.batteryPct,
      readyAt: d.window.start,
      rechargeSec: null,
      cycles: null,
      commissionedAt: null,
      source: 'Начальный расчётный профиль; не телеметрия.',
    };
    v.batteryPct = b.initialPct;
    return { ...b, rechargeSec: null };
  });
  return parseMissionDocument(d);
}

export function fleetStateFromDocument(
  d: MissionDocument,
  vehicleId: string,
  at: string,
): FleetState {
  const v = d.scenario.vehicles.find((v) => v.id === vehicleId)!;
  const b = d.batteries.find((b) => b.vehicleId === vehicleId)!;
  return parseFleetState({
    id: v.id,
    revision: 1,
    observedAt: at,
    source: 'operator',
    ready: v.enabled,
    grounded: true,
    preparationRemainingSec: 0,
    vehicle: v,
    battery: { ...b, rechargeSec: null, initialPct: v.batteryPct },
    operationId: null,
    lastEvent: 'Начальные данные стенда, не телеметрия.',
    replacements: [],
  });
}

/** Capture current state, including newly joined vehicles. Unavailable UAVs stay
 * visible, but are disabled; a 100% SOC alone is never a readiness signal. */
export function applyFleetState(
  input: MissionDocument,
  states: readonly FleetState[],
): MissionDocument {
  const d = installedBatteryDocument(input);
  for (const raw of states) {
    const s = parseFleetState(raw);
    const i = d.scenario.vehicles.findIndex((v) => v.id === s.id);
    const temporarilyDisabled =
      d.fleetSnapshot?.find((x) => x.vehicleId === s.id)?.unavailable === true;
    const enabled =
      i < 0 || temporarilyDisabled
        ? s.vehicle.enabled
        : d.scenario.vehicles[i].enabled;
    const v = {
      ...structuredClone(s.vehicle),
      enabled: enabled && s.vehicle.enabled && s.ready && s.grounded,
    };
    if (i < 0) d.scenario.vehicles.push(v);
    else d.scenario.vehicles[i] = v;
    d.batteries = d.batteries.filter((b) => b.vehicleId !== s.id);
    d.batteries.push({
      ...structuredClone(s.battery),
      readyAt: new Date(
        Date.parse(d.window.start) + s.preparationRemainingSec * 1000,
      ).toISOString(),
    });
  }
  d.fleetSnapshot = states.map((s) => ({
    vehicleId: s.id,
    revision: s.revision,
    unavailable: !s.ready || !s.grounded || !s.vehicle.enabled,
  }));
  const parsed = parseMissionDocument(d);
  checkMissionSize(parsed);
  return parsed;
}
