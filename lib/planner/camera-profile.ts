import { z } from 'zod';
import type { Vehicle } from './schema.ts';
import type {
  MissionDocument,
  MissionJob,
  QualityProfile,
} from './mission-schema.ts';

const positive = (max: number) => z.number().positive().max(max);
export const cameraProfileSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),
    name: z.string().min(1).max(120),
    type: z.enum(['RGB', 'MS', 'IR']),
    status: z.enum(['documented', 'assumed', 'unknown']),
    source: z.string().min(1).max(1000),
    supportedModels: z
      .array(z.enum(['Gemini', '801', '201', 'Custom']))
      .min(1)
      .max(4),
    sensorWidthMm: positive(100).optional(),
    sensorHeightMm: positive(100).optional(),
    focalLengthMm: positive(1000).optional(),
    imageWidthPx: positive(100000).int().optional(),
    imageHeightPx: positive(100000).int().optional(),
    minimumIntervalSec: positive(60).optional(),
    shutterSec: positive(10).optional(),
    maximumSpeedMps: positive(100).optional(),
  })
  .strict();
export type CameraProfile = z.infer<typeof cameraProfileSchema>;
const knownModels: Record<string, Vehicle['model'][]> = {
  pf1b: ['Gemini'],
  pollux: ['Gemini', '201', 'Custom'],
  '801-wide': ['801'],
  '801-tele': ['801'],
  '801-thermal': ['801'],
  'sony-rx1rm2': ['201'],
  'sony-zv-e10': ['201'],
  'riebo-r4': ['201'],
  'riebo-r6': ['201'],
};

/** Identity and numerical geometry both matter: a copied ID cannot overwrite optics. */
export function cameraGeometryKey(camera: CameraProfile): string {
  return JSON.stringify([
    camera.type,
    camera.sensorWidthMm,
    camera.sensorHeightMm,
    camera.focalLengthMm,
    camera.imageWidthPx,
    camera.imageHeightPx,
    camera.minimumIntervalSec,
    camera.shutterSec,
    camera.maximumSpeedMps,
  ]);
}

export function resolveVehicleCamera(
  vehicle: Vehicle,
  type: MissionJob['job']['type'],
  cameraId?: string,
): { camera?: CameraProfile; reason?: string } {
  const profiles = vehicle.cameraProfiles ?? [];
  const active = profiles.filter(
    (c) => vehicle.cameraIds?.includes(c.id) && c.type === type,
  );
  if (active.length !== 1)
    return {
      reason: active.length
        ? `БВС ${vehicle.id}: выбрано несколько камер ${type}; выберите ровно одну активную оптику.`
        : `БВС ${vehicle.id}: не выбрана установленная камера ${type}; параметры работы не заменяют паспорт камеры.`,
    };
  const camera = active[0];
  if (cameraId && camera.id !== cameraId)
    return {
      reason: `Камера ${cameraId} не является активной ${type} на БВС ${vehicle.id}.`,
    };
  // These known physical payloads cannot be re-labelled through imported metadata.
  if (
    !camera.supportedModels.includes(vehicle.model) ||
    (knownModels[camera.id.toLowerCase()] &&
      !knownModels[camera.id.toLowerCase()].includes(vehicle.model))
  )
    return {
      reason: `Камера ${camera.name} не совместима с моделью ${vehicle.model}.`,
    };
  if (
    camera.status === 'unknown' ||
    [
      camera.sensorWidthMm,
      camera.sensorHeightMm,
      camera.focalLengthMm,
      camera.imageWidthPx,
      camera.imageHeightPx,
      camera.minimumIntervalSec,
    ].some((v) => v === undefined || !Number.isFinite(v) || v <= 0)
  )
    return {
      reason: `Камера ${camera.name}: оптика или минимальный интервал кадров не подтверждены/не заданы; расчёт заблокирован.`,
    };
  if (
    vehicle.model !== 'Custom' &&
    camera.status === 'documented' &&
    ((/PF1B/i.test(camera.name) && vehicle.model !== 'Gemini') ||
      (/Pollux/i.test(camera.name) &&
        !['Gemini', '201'].includes(vehicle.model)))
  )
    return {
      reason: `Профиль ${camera.name} не подтверждает документированную установку на ${vehicle.model}.`,
    };
  return { camera };
}

/** Requirements stay on the job; no fallback to its legacy optical fields. */
export function qualityWithCamera(
  requirements: QualityProfile,
  camera: CameraProfile,
): QualityProfile {
  return {
    ...requirements,
    status: camera.status,
    source: camera.source,
    sensorWidthMm: camera.sensorWidthMm,
    sensorHeightMm: camera.sensorHeightMm,
    focalLengthMm: camera.focalLengthMm,
    imageWidthPx: camera.imageWidthPx,
    imageHeightPx: camera.imageHeightPx,
    minimumIntervalSec: camera.minimumIntervalSec,
    shutterSec: camera.shutterSec,
  };
}

/** Explicit, deterministic and idempotent. Parsing old archives never calls this.
 * Legacy assumptions are not promoted to measured installations or certificates. */
export function migrateMissionCameraBindings(input: MissionDocument): {
  document: MissionDocument;
  warnings: string[];
} {
  const warnings: string[] = [];
  const document = {
    ...input,
    scenario: {
      ...input.scenario,
      vehicles: input.scenario.vehicles.map((vehicle) => {
        if (
          vehicle.cameraProfiles !== undefined ||
          vehicle.cameraIds !== undefined
        )
          return vehicle;
        const cameraProfiles: CameraProfile[] = [];
        for (const type of vehicle.jobs.filter(
          (t): t is CameraProfile['type'] => ['RGB', 'MS', 'IR'].includes(t),
        )) {
          const jobs = input.jobs.filter(
            (j) =>
              j.job.type === type &&
              j.quality.mode === 'camera' &&
              (!j.assignedVehicleIds.length ||
                j.assignedVehicleIds.includes(vehicle.id)),
          );
          const q = jobs[0]?.quality;
          if (!q) continue;
          const pf1b =
            type === 'RGB' &&
            q.sensorWidthMm === 23.5 &&
            q.sensorHeightMm === 15.6 &&
            q.focalLengthMm === 20 &&
            q.imageWidthPx === 6000 &&
            q.imageHeightPx === 4000;
          const pollux =
            type === 'MS' &&
            q.sensorWidthMm === 4.968 &&
            q.sensorHeightMm === 3.726 &&
            q.focalLengthMm === 8 &&
            q.imageWidthPx === 1440 &&
            q.imageHeightPx === 1080;
          if (
            vehicle.model !== 'Custom' &&
            !(vehicle.model === 'Gemini' && (pf1b || pollux))
          )
            continue;
          // Ambiguous legacy optical profiles require operator selection, not the first row.
          const optical = (p: QualityProfile) =>
            JSON.stringify([
              p.sensorWidthMm,
              p.sensorHeightMm,
              p.focalLengthMm,
              p.imageWidthPx,
              p.imageHeightPx,
              p.minimumIntervalSec,
              p.shutterSec,
            ]);
          if (jobs.some((j) => optical(j.quality) !== optical(q))) continue;
          cameraProfiles.push({
            id:
              pf1b && vehicle.model === 'Gemini'
                ? 'pf1b'
                : pollux && vehicle.model === 'Gemini'
                  ? 'pollux'
                  : `legacy-${type.toLowerCase()}`,
            name:
              pf1b && vehicle.model === 'Gemini'
                ? 'PF1B (миграция)'
                : pollux && vehicle.model === 'Gemini'
                  ? 'Pollux (миграция)'
                  : `Ручная ${type} (миграция)`,
            type,
            status: jobs.some((j) => j.quality.status === 'unknown')
              ? 'unknown'
              : 'assumed',
            supportedModels: [vehicle.model],
            source:
              `Миграция legacy-camera-binding-v1: перенесена оптика старой работы; фактическую установку подтверждает оператор. ${q.source}`.slice(
                0,
                1000,
              ),
            sensorWidthMm: q.sensorWidthMm,
            sensorHeightMm: q.sensorHeightMm,
            focalLengthMm: q.focalLengthMm,
            imageWidthPx: q.imageWidthPx,
            imageHeightPx: q.imageHeightPx,
            minimumIntervalSec: q.minimumIntervalSec,
            shutterSec: q.shutterSec,
          });
        }
        if (vehicle.jobs.some((t) => ['RGB', 'MS', 'IR'].includes(t)))
          warnings.push(
            `Миграция камер ${vehicle.id}: ${cameraProfiles.length ? cameraProfiles.map((c) => c.name).join(', ') + '; установка предполагается, не подтверждена.' : 'нужен явный выбор установленной камеры; оптика работы не переносится на эту модель.'}`,
          );
        return {
          ...vehicle,
          cameraProfiles,
          cameraIds: cameraProfiles.map((c) => c.id),
        };
      }),
    },
  };
  return { document, warnings };
}
