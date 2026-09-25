import { MISSION_ENGINE_VERSION, sha256 } from './mission-schema.ts';
import type { MissionCandidate, MissionDocument } from './mission-schema.ts';
import { jobSurveySegments, sortieHasJob } from './mission-sortie-jobs.ts';
import { qualityForJob } from './quality.ts';
import { migrateMissionCameraBindings } from './camera-profile.ts';

const materialNames = {
  RGB: 'Фотографии и координаты центров съёмки',
  MS: 'Мультиспектральные изображения, метаданные и калибровочные материалы',
  IR: 'Тепловые изображения и параметры съёмки',
  LiDAR: 'Исходные лазерные измерения, траектория и метаданные',
  Geophysics: 'Ряды измерений, координаты, время и калибровочные материалы',
} as const;

/** Describes expected material. It has no photo generator, telemetry or file-copy API. */
export function describeMissionDelivery(
  document: MissionDocument,
  candidate: MissionCandidate,
  completed = false,
) {
  document = migrateMissionCameraBindings(document).document;
  const feasible =
    candidate.status === 'feasible_model' &&
    candidate.metrics.grossCoveragePct >= 99 &&
    candidate.sorties.length > 0 &&
    !candidate.checks.some((c) => c.status === 'fail');
  const modelSessionCompleted = completed && feasible;
  return {
    phase: modelSessionCompleted
      ? ('simulation-completed' as const)
      : feasible
        ? ('planned' as const)
        : ('incomplete-plan' as const),
    modelSessionCompleted,
    completionBasis:
      'Caller-provided simulation-session flag; not evidence of a real flight.' as const,
    receivedData: false as const,
    transferPerformed: false as const,
    receivedFiles: [] as { name: string; sha256: string; sizeBytes: number }[],
    jobs: document.jobs.map((job) => {
      const sorties = candidate.sorties.filter((s) => sortieHasJob(s, job.id));
      const coverage = candidate.jobCoverage.find(
        (row) => row.jobId === job.id,
      );
      const isCamera = ['RGB', 'MS', 'IR'].includes(job.job.type);
      return {
        jobId: job.id,
        name: job.name,
        work: job.job.type,
        expectedMaterial: materialNames[job.job.type],
        expectedCaptureEvents: isCamera
          ? sorties.reduce((sum, sortie) => {
              const vehicle = document.scenario.vehicles.find(
                (v) => v.id === sortie.vehicleId,
              );
              const quality = qualityForJob(
                job,
                vehicle,
                document.flightEnvelope,
                sortie.cameraId,
              );
              if (!vehicle || quality.checks.some((c) => c.status === 'fail'))
                return sum;
              return (
                sum +
                jobSurveySegments([sortie], job.id).reduce(
                  (n, s) =>
                    n +
                    Math.floor(
                      (s.distanceM + 1e-6) / quality.job.triggerDistanceM,
                    ) +
                    1,
                  0,
                )
              );
            }, 0)
          : null,
        captureCountMeaning: isCamera
          ? 'Planned camera triggers, not received files. A multispectral trigger may produce multiple files.'
          : 'No camera-frame count applies to this sensor.',
        plannedGrossCoveragePct: coverage?.grossCoveragePct ?? 0,
        plannedVehicleIds: [...new Set(sorties.map((s) => s.vehicleId))],
        plannedSortieIds: sorties.map((s) => s.id),
        acquisitionConfirmed: false as const,
        filesReceived: false as const,
      };
    }),
    vehicles: document.scenario.vehicles.map((vehicle) => {
      const own = candidate.sorties
        .filter((s) => s.vehicleId === vehicle.id)
        .sort((a, b) => a.endSec - b.endSec);
      const last = own.at(-1);
      return {
        vehicleId: vehicle.id,
        name: vehicle.name,
        usedInPlan: own.length > 0,
        initialChargePct: vehicle.batteryPct,
        projectedFinalChargePct: last?.remainingPct ?? vehicle.batteryPct,
        finalLanding: last?.segments.at(-1)?.to ?? vehicle.start,
        lastLandingSec: last?.endSec ?? null,
        batteryIdAtFinalLanding:
          last?.batteryId ??
          document.batteries.find((b) => b.vehicleId === vehicle.id)?.id ??
          null,
        chargeMeaning: modelSessionCompleted
          ? 'Model estimate after the completed simulation; not fresh battery telemetry.'
          : 'Projected charge after the planned flights; not current charge.',
      };
    }),
    handoverChecklist: [
      'Подтвердить фактическую посадку и безопасное состояние аппарата.',
      'Скопировать реальные данные с носителя камеры/датчика или через документированный интерфейс оборудования.',
      'Сопоставить файлы с ID работы, БВС и вылета; проверить время и координаты.',
      'Проверить читаемость, контрольные суммы, полноту и качество. Число модельных срабатываний не заменяет контроль данных.',
      'Только после проверки подтвердить приёмку данных. В этом стенде такой передачи и приёмки файлов нет.',
    ],
    sources: [
      {
        title: 'Руководство Геоскан 201: выгрузка с microSD после посадки',
        reference:
          'https://download.geoscan.ru/site-files/201/Geoscan_201_Manual.pdf',
        at: ['с. 45'],
      },
      {
        title:
          'Ответы экспертов: данные обычно снимаются после посадки; копирование фото',
        reference: 'docs/planner/meetings/2026-09-16-full/transcript.md',
        at: ['00:41:14–00:41:40', '00:51:14–00:51:35'],
      },
      {
        title:
          'Pollux: microSDXC, TIFF 16 bit; не универсальный формат всех сенсоров',
        reference: 'https://www.geoscan.ru/ru/products/components/pollux',
        at: [] as string[],
      },
    ],
  };
}

/** Hash-linked inventory, not the evidence bundle or an assertion that imagery exists. */
export async function buildMissionDeliveryManifest(
  document: MissionDocument,
  candidate: MissionCandidate,
  completed = false,
) {
  const [inputHash, planHash] = await Promise.all([
    sha256(document),
    sha256(candidate),
  ]);
  if (candidate.plan.inputHash !== inputHash)
    throw new Error('План и задание относятся к разным входным данным.');
  return {
    type: 'prime-mission-delivery-manifest' as const,
    schemaVersion: '1.0' as const,
    engineVersion: MISSION_ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    missionId: document.id,
    missionName: document.name,
    candidateId: candidate.id,
    inputHash,
    planHash,
    modelOnly: true as const,
    flightReady: false as const,
    ...describeMissionDelivery(document, candidate, completed),
    limitations: [
      'Manifest contains no photographs, point clouds or measurements. No files were copied from an aircraft.',
      'A completed simulation is not a completed real aviation job or accepted survey.',
      'Hash linkage identifies this input and plan; it is not a digital signature, independent flight audit or survey-quality certificate.',
    ],
  };
}
