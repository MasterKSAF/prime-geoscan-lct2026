import clipping from 'polygon-clipping';
import { area, distance, projection } from './geometry.ts';
import type { Multi, Point } from './geometry.ts';
import type { MissionDocument, ScheduledSortie } from './mission-schema.ts';
import type { Check } from './schema.ts';
import { qualityForJob } from './quality.ts';

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
  const p = projection(d.scenario.area.coordinates[0][0]);
  return d.jobs
    .filter((j) => j.quality.mode === 'camera')
    .map((j) => {
      const q = j.quality,
        model = qualityForJob(j).job;
      const requested: Multi = [
        j.area.coordinates.map((r) => r.map(p.forward)),
      ];
      const requestedM2 = area(requested),
        checks: Check[] = [];
      const unavailable = (reason: string): PhotoCoverage => ({
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
            status: 'unknown',
            title: 'Ожидаемые отпечатки кадров',
            detail: reason,
          },
        ],
      });
      if (d.terrainModel.kind !== 'flat')
        return unavailable(
          'Нужен подтверждённый режим плоской поверхности; DEM и наклон камеры этой моделью не проверяются.',
        );
      const width = model.swathM,
        length =
          (j.job.altitudeM * (q.sensorHeightMm ?? 0)) / (q.focalLengthMm ?? 1),
        step = model.triggerDistanceM;
      if (!(width > 0 && length > 0 && step && step > 0 && step <= length))
        return unavailable(
          'Не хватает геометрии камеры или шаг кадров превышает длину отпечатка.',
        );
      const survey = sorties
        .filter((s) => s.jobId === j.id)
        .flatMap((s) => s.segments.filter((x) => x.phase === 'survey'));
      if (survey.length > 1200)
        return unavailable(
          'Превышен проверяемый лимит 1200 съёмочных проходов.',
        );
      let plannedFrames = 0;
      const footprints: Multi = [];
      for (const seg of survey) {
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
        const overlap = 1 - step / length;
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
