import { z } from 'zod';
import { demoScenario } from './demo.ts';
import {
  missionDocumentSchema,
  parseMissionDocument,
} from './mission-schema.ts';
import type { MissionDocument } from './mission-schema.ts';
import { scenarioSchema } from './schema.ts';
import type { Vehicle } from './schema.ts';
import {
  assertSafeTree,
  canonicalMissionJson,
  checkTextSize,
  parseStructuredText,
} from './mission-io.ts';

export const MAX_FLEET_FILE_BYTES = 200 * 1024;
export const MAX_FLEET_VEHICLES = 10;
export const MAX_FLEET_BATTERIES = 100;
const fleetSchema = z
  .object({
    type: z.literal('prime-fleet'),
    schemaVersion: z.literal('1.0'),
    vehicles: scenarioSchema.shape.vehicles,
    batteries: z.array(missionDocumentSchema.shape.batteries.element).max(100),
  })
  .strict();
export type MissionFleet = z.infer<typeof fleetSchema>;

function parseFleet(value: unknown): MissionFleet {
  assertSafeTree(value);
  const fleet = fleetSchema.parse(value);
  const vehicleIds = new Set(fleet.vehicles.map((v) => v.id));
  if (vehicleIds.size !== fleet.vehicles.length)
    throw new Error('Профили БВС: повторяющиеся идентификаторы.');
  if (new Set(fleet.batteries.map((b) => b.id)).size !== fleet.batteries.length)
    throw new Error('Батареи: повторяющиеся идентификаторы.');
  for (const vehicle of fleet.vehicles) {
    if (new Set(vehicle.jobs).size !== vehicle.jobs.length)
      throw new Error(`БВС ${vehicle.id}: виды работ повторяются.`);
    if (vehicle.model === '201' && vehicle.kind !== 'fixedWing')
      throw new Error('Геоскан 201 должен сохранять самолётный тип.');
  }
  for (const battery of fleet.batteries)
    if (!vehicleIds.has(battery.vehicleId))
      throw new Error(`Батарея ${battery.id}: неизвестный БВС.`);
  return fleet;
}

export function parseFleetText(text: string): MissionFleet {
  return parseFleet(parseStructuredText(text, 'json', MAX_FLEET_FILE_BYTES));
}

export function serializeMissionFleet(document: MissionDocument): string {
  const fleet = parseFleet({
    type: 'prime-fleet',
    schemaVersion: '1.0',
    vehicles: document.scenario.vehicles,
    batteries: document.batteries,
  });
  const compact = JSON.stringify(fleet);
  checkTextSize(compact, MAX_FLEET_FILE_BYTES);
  const pretty = JSON.stringify(fleet, null, 2);
  // Formatting must not prevent a lossless export that fits the import limit.
  return new TextEncoder().encode(pretty).length <= MAX_FLEET_FILE_BYTES
    ? pretty
    : compact;
}

/** Append the complete bundle or reject it; existing identifiers are never remapped. */
export function importMissionFleet(
  document: MissionDocument,
  value: MissionFleet,
): MissionDocument {
  const fleet = parseFleet(value);
  if (
    document.scenario.vehicles.length + fleet.vehicles.length >
    MAX_FLEET_VEHICLES
  )
    throw new Error('В миссии допускается не более 10 БВС.');
  if (document.batteries.length + fleet.batteries.length > MAX_FLEET_BATTERIES)
    throw new Error('В миссии допускается не более 100 АКБ.');
  for (const vehicle of fleet.vehicles)
    if (document.scenario.vehicles.some((v) => v.id === vehicle.id))
      throw new Error(
        `БВС с ID «${vehicle.id}» уже существует. Импорт отменён целиком.`,
      );
  for (const battery of fleet.batteries)
    if (document.batteries.some((b) => b.id === battery.id))
      throw new Error(
        `АКБ с ID «${battery.id}» уже существует. Импорт отменён целиком.`,
      );
  const merged = parseMissionDocument({
    ...document,
    scenario: {
      ...document.scenario,
      vehicles: [...document.scenario.vehicles, ...fleet.vehicles],
    },
    batteries: [...document.batteries, ...fleet.batteries],
  });
  // The bundle may fit by itself while the resulting mission cannot be saved.
  checkTextSize(canonicalMissionJson(merged));
  return merged;
}

export function removeMissionVehicle(
  document: MissionDocument,
  vehicleId: string,
): MissionDocument {
  if (!document.scenario.vehicles.some((v) => v.id === vehicleId))
    throw new Error('БВС не найден.');
  if (document.scenario.vehicles.length <= 1)
    throw new Error('В миссии должен остаться хотя бы один БВС.');
  const batteries = document.batteries.filter((b) => b.vehicleId !== vehicleId);
  if (!batteries.length)
    throw new Error(
      'Добавьте АКБ оставшемуся БВС: в миссии нужна хотя бы одна батарея.',
    );
  return {
    ...document,
    scenario: {
      ...document.scenario,
      vehicles: document.scenario.vehicles.filter((v) => v.id !== vehicleId),
    },
    batteries,
    jobs: document.jobs.map((job) => ({
      ...job,
      assignedVehicleIds: job.assignedVehicleIds.filter(
        (id) => id !== vehicleId,
      ),
    })),
  };
}

function uniqueId(prefix: string, ids: string[]): string {
  let index = 1;
  while (ids.includes(`${prefix}-${index}`)) index++;
  return `${prefix}-${index}`;
}

export function addMissionBattery(
  document: MissionDocument,
  vehicleId: string,
): MissionDocument {
  const vehicle = document.scenario.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) throw new Error('БВС не найден.');
  if (document.batteries.length >= MAX_FLEET_BATTERIES)
    throw new Error('В миссии допускается не более 100 АКБ.');
  return {
    ...document,
    batteries: [
      ...document.batteries,
      {
        id: uniqueId(
          'battery',
          document.batteries.map((b) => b.id),
        ),
        vehicleId,
        name: `АКБ ${document.batteries.filter((b) => b.vehicleId === vehicleId).length + 1} · ${vehicle.name}`.slice(
          0,
          100,
        ),
        initialPct: 100,
        readyAt: document.window.start,
        rechargeSec: null,
        cycles: null,
        commissionedAt: null,
        source:
          'Добавлена оператором: начальный заряд — допущение; ресурс и перезарядка неизвестны.',
      },
    ],
  };
}

export function addMissionVehicle(
  document: MissionDocument,
  model: Vehicle['model'],
): MissionDocument {
  if (document.scenario.vehicles.length >= MAX_FLEET_VEHICLES)
    throw new Error('В миссии допускается не более 10 БВС.');
  const template = demoScenario().vehicles.find(
    (v) => v.model === (model === 'Custom' ? 'Gemini' : model),
  );
  if (!template) throw new Error('Неизвестный профиль БВС.');
  const vehicle: Vehicle = {
    ...structuredClone(template),
    id: uniqueId(
      model.toLowerCase(),
      document.scenario.vehicles.map((v) => v.id),
    ),
    name:
      model === 'Custom'
        ? 'Свой БВС'
        : `${model === 'Gemini' ? model : `Геоскан ${model}`} · ${document.scenario.vehicles.length + 1}`,
    model,
    enabled: true,
    start: [...document.scenario.vehicles[0].start],
    landing: [...document.scenario.vehicles[0].landing],
  };
  if (model === 'Custom') {
    vehicle.jobs = ['RGB'];
    vehicle.assumptions = [
      'Стартовые параметры — учебные допущения. Оператор должен задать ограничения своей комплектации.',
    ];
    vehicle.source =
      'Профиль оператора: параметры и совместимость требуют подтверждения.';
  }
  return addMissionBattery(
    {
      ...document,
      scenario: {
        ...document.scenario,
        vehicles: [...document.scenario.vehicles, vehicle],
      },
    },
    vehicle.id,
  );
}
