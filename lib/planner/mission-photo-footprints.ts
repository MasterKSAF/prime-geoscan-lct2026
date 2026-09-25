import clipping from 'polygon-clipping';
import { area, distance, projection } from './geometry.ts';
import type { Multi, Point } from './geometry.ts';
import type { MissionDocument, ScheduledSortie } from './mission-schema.ts';
import type { Check } from './schema.ts';
import { qualityForJob } from './quality.ts';
import { segmentJobId } from './mission-sortie-jobs.ts';
import {
  migrateMissionCameraBindings,
  resolveVehicleCamera,
  qualityWithCamera,
} from './camera-profile.ts';

export type PhotoCoverage = {
  jobId: string;
  status: 'calculated' | 'not_checked';
  plannedFrames: number;
  requestedM2: number;
  coveredM2: number;
  missingM2: number;
  covered: Multi;
  missing: Multi;
  checks: Check[];
};

/** Planned nadir exposures on a declared flat ground plane. This independently
 * checks actual trigger centres, rather than equating travelled strips to photos.
 * Along a straight line, overlapping equal rectangles have an EXACT rectangular
 * union; aggregate them without allocating tens of thousands of individual frames.
 * No delivered/acquired images, terrain, pose errors or hardware response implied. */
export function plannedPhotoCoverage(
  d: MissionDocument,
  sorties: ScheduledSortie[],
): PhotoCoverage[] {
  d = migrateMissionCameraBindings(d).document;
  const p = projection(d.scenario.area.coordinates[0][0]);
  return d.jobs
    .filter((j) => j.quality.mode === 'camera')
    .map((j) => {
      const q = j.quality;
      const requested: Multi = [
        j.area.coordinates.map((r) => r.map(p.forward)),
      ];
      const requestedM2 = area(requested),
        checks: Check[] = [];
      const unavailable = (
        reason: string,
        status: Check['status'] = 'unknown',
      ): PhotoCoverage => ({
        jobId: j.id,
        status: 'not_checked',
        plannedFrames: 0,
        requestedM2,
        coveredM2: 0,
        missingM2: 0,
        covered: [],
        missing: [],
        checks: [
          {
            id: `PHOTO_${j.id}_MODEL`,
            status,
            title: 'Ожидаемые отпечатки кадров',
            detail: reason,
          },
        ],
      });
      if (d.terrainModel.kind !== 'flat')
        return unavailable(
          'Нужен подтверждённый режим плоской поверхности; DEM и наклон камеры этой моделью не проверяются.',
        );
      const survey = sorties.flatMap((sortie) =>
        sortie.segments
          .filter(
            (seg) =>
              seg.phase === 'survey' && segmentJobId(sortie, seg) === j.id,
          )
          .map((seg) => ({ sortie, seg })),
      );
      if (
        !survey.length &&
        !d.scenario.vehicles.some(
          (v) =>
            v.enabled &&
            v.jobs.includes(j.job.type) &&
            (!j.assignedVehicleIds.length ||
              j.assignedVehicleIds.includes(v.id)) &&
            resolveVehicleCamera(v, j.job.type).camera,
        )
      )
        return unavailable(
          'Нет полной активной камеры для проверки ожидаемых снимков.',
          'fail',
        );
      if (survey.length > 1200)
        return unavailable(
          'Превышен проверяемый лимит 1200 съёмочных проходов.',
        );
      let plannedFrames = 0;
      let minimumOverlap = 1;
      const footprints: Multi = [];
      for (const { sortie, seg } of survey) {
        const vehicle = d.scenario.vehicles.find(
          (v) => v.id === sortie.vehicleId,
        );
        const resolved =
          vehicle && resolveVehicleCamera(vehicle, j.job.type, sortie.cameraId);
        if (!vehicle || !sortie.cameraId || !resolved?.camera)
          return unavailable(
            resolved?.reason ??
              'У вылета отсутствует однозначно привязанная установленная камера.',
            'fail',
          );
        const actual = qualityWithCamera(q, resolved.camera),
          calculated = qualityForJob(
            j,
            { ...vehicle, airspeedMps: seg.groundSpeedMps },
            d.flightEnvelope,
            sortie.cameraId,
          ),
          model = calculated.job,
          width = model.swathM,
          length =
            (model.altitudeM * actual.sensorHeightMm!) / actual.focalLengthMm!,
          step = model.triggerDistanceM;
        if (
          calculated.checks.some((c) => c.status === 'fail') ||
          Math.abs(seg.altitudeFromM - model.altitudeM) > 1e-6 ||
          Math.abs(seg.altitudeToM - model.altitudeM) > 1e-6 ||
          !(width > 0 && length > 0 && step > 0 && step <= length)
        )
          return unavailable(
            'Параметры установленной камеры, высота сегмента или частота кадров не соответствуют работе.',
            'fail',
          );
        minimumOverlap = Math.min(minimumOverlap, 1 - step / length);
        const a = p.forward(seg.from),
          b = p.forward(seg.to),
          len = distance(a, b);
        if (len < 1e-6) continue;
        const count = Math.floor(len / step + 1e-6) + 1;
        plannedFrames += count;
        const ux = (b[0] - a[0]) / len,
          uy = (b[1] - a[1]) / len;
        const start = -length / 2,
          end = (count - 1) * step + length / 2;
        const pt = (t: number, w: number): Point => [
          a[0] + ux * t - uy * w,
          a[1] + uy * t + ux * w,
        ];
        footprints.push([
          [
            pt(start, width / 2),
            pt(end, width / 2),
            pt(end, -width / 2),
            pt(start, -width / 2),
            pt(start, width / 2),
          ],
        ]);
      }
      try {
        const union = footprints.length
          ? (clipping.union(footprints) as Multi)
          : [];
        const covered = union.length
          ? (clipping.intersection(requested, union) as Multi)
          : [];
        const missing = covered.length
          ? (clipping.difference(requested, covered) as Multi)
          : requested;
        const missingM2 = area(missing),
          coveredM2 = area(covered);
        checks.push({
          id: `PHOTO_${j.id}_COVERAGE`,
          status:
            missingM2 <= Math.max(0.05, requestedM2 * 1e-8) ? 'pass' : 'fail',
          title: 'Покрытие ожидаемыми кадрами',
          detail: `${plannedFrames} модельных экспозиций; непокрыто ${missingM2.toFixed(2)} из ${requestedM2.toFixed(2)} м². Проверяются исходный контур, отверстия, края и стыки. Камера вниз, плоская поверхность; реальные фото не получены.`,
        });
        const overlap = minimumOverlap;
        checks.push({
          id: `PHOTO_${j.id}_OVERLAP`,
          status: overlap + 1e-8 >= (q.forwardOverlap ?? 0) ? 'pass' : 'fail',
          title: 'Продольное перекрытие ожидаемых кадров',
          detail: `${(overlap * 100).toFixed(2)}% на каждом прямом проходе; требование ${((q.forwardOverlap ?? 0) * 100).toFixed(2)}%. Между разворотами непрерывность съёмки не предполагается.`,
        });
        return {
          jobId: j.id,
          status: 'calculated',
          plannedFrames,
          requestedM2,
          coveredM2,
          missingM2,
          covered,
          missing,
          checks,
        };
      } catch {
        return unavailable(
          'Геометрическая операция не завершилась устойчиво; покрытие не подтверждено.',
        );
      }
    });
}

export function photoCoverageGeoJSON(
  d: MissionDocument,
  sorties: ScheduledSortie[],
) {
  const p = projection(d.scenario.area.coordinates[0][0]);
  return {
    type: 'FeatureCollection',
    properties: {
      missionId: d.id,
      model: 'planned-nadir-exposures-flat-v1',
      acquiredData: false,
    },
    features: plannedPhotoCoverage(d, sorties).flatMap((v) =>
      (['covered', 'missing'] as const).map((kind) => ({
        type: 'Feature',
        properties: {
          jobId: v.jobId,
          kind,
          status: v.status,
          plannedFrames: v.plannedFrames,
          checks: v.checks,
        },
        geometry:
          v.status === 'calculated'
            ? {
                type: 'MultiPolygon',
                coordinates: v[kind].map((poly) =>
                  poly.map((r) => r.map(p.inverse)),
                ),
              }
            : null,
      })),
    ),
  };
}
