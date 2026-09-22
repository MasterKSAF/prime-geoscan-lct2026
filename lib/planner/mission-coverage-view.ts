import clipping from 'polygon-clipping';
import { area, distance, projection } from './geometry.ts';
import type { Multi, Point } from './geometry.ts';
import type { MissionDocument, MissionCandidate } from './mission-schema.ts';
import { qualityForJob } from './quality.ts';

export type CoverageView = {
  jobId: string;
  name: string;
  status: 'calculated' | 'not_checked';
  requested: Multi;
  covered: Multi;
  missing: Multi;
  requestedM2: number;
  coveredM2: number;
  missingM2: number;
  qualityStatus: 'pass' | 'fail' | 'unknown';
  details: string[];
};

/** Same nominal band model as the planner, against ORIGINAL geometry incl. prohibited gaps.
 * It is not a raster DEM, real photo footprint or proof of acquired imagery. */
export function missionCoverageViews(
  document: MissionDocument,
  candidate: MissionCandidate,
): CoverageView[] {
  const project = projection(document.scenario.area.coordinates[0][0]);
  const count = candidate.sorties.reduce((n, s) => n + s.segments.length, 0);
  return document.jobs.map((job) => {
    const requested: Multi = [
      job.area.coordinates.map((ring) => ring.map(project.forward)),
    ];
    const own = candidate.sorties.filter((s) => s.jobId === job.id);
    const q = qualityForJob(job);
    const checks = [
      ...q.checks,
      ...own.flatMap((s) => {
        const vehicle = document.scenario.vehicles.find(
          (v) => v.id === s.vehicleId,
        );
        const maxGround = Math.max(
          0,
          ...s.segments
            .filter((seg) => seg.phase === 'survey')
            .map((seg) => seg.groundSpeedMps),
        );
        // Image cadence/blur and point density depend on speed OVER GROUND,
        // including tailwind, not nominal airspeed from the vehicle card.
        return qualityForJob(
          job,
          vehicle
            ? { ...vehicle, airspeedMps: maxGround || vehicle.airspeedMps }
            : undefined,
        ).checks;
      }),
    ];
    const base = {
      jobId: job.id,
      name: job.name,
      requested,
      requestedM2: area(requested),
      qualityStatus: checks.some((c) => c.status === 'fail')
        ? ('fail' as const)
        : checks.some((c) => c.status === 'unknown')
          ? ('unknown' as const)
          : ('pass' as const),
      details: [
        ...new Set(
          checks.filter((c) => c.status !== 'pass').map((c) => c.detail),
        ),
      ],
    };
    if (count > 1200)
      return {
        ...base,
        status: 'not_checked' as const,
        covered: [],
        missing: [],
        coveredM2: 0,
        missingM2: 0,
        details: [
          'Для карты покрытия превышен лимит 1200 сегментов. Используйте основной отчёт.',
          ...base.details,
        ],
      };
    try {
      const bands: Multi = own.flatMap((s) =>
        s.segments
          .filter((seg) => seg.phase === 'survey')
          .flatMap((seg) => {
            const a = project.forward(seg.from),
              b = project.forward(seg.to),
              length = distance(a, b);
            if (length < 1e-6) return [];
            const nx = ((-(b[1] - a[1]) / length) * q.job.swathM) / 2,
              ny = (((b[0] - a[0]) / length) * q.job.swathM) / 2;
            const ring: Point[] = [
              [a[0] + nx, a[1] + ny],
              [b[0] + nx, b[1] + ny],
              [b[0] - nx, b[1] - ny],
              [a[0] - nx, a[1] - ny],
              [a[0] + nx, a[1] + ny],
            ];
            return [[ring]];
          }),
      );
      const union = bands.length ? (clipping.union(bands) as Multi) : [];
      const covered = union.length
        ? (clipping.intersection(requested, union) as Multi)
        : [];
      const missing = covered.length
        ? (clipping.difference(requested, covered) as Multi)
        : requested;
      return {
        ...base,
        status: 'calculated' as const,
        covered,
        missing,
        coveredM2: area(covered),
        missingM2: area(missing),
      };
    } catch {
      return {
        ...base,
        status: 'not_checked' as const,
        covered: [],
        missing: [],
        coveredM2: 0,
        missingM2: 0,
        details: [
          'Не удалось устойчиво построить геометрию покрытия; зелёная карта не выдаётся.',
          ...base.details,
        ],
      };
    }
  });
}

export function coverageGeoJSON(
  document: MissionDocument,
  views: CoverageView[],
) {
  const project = projection(document.scenario.area.coordinates[0][0]);
  return {
    type: 'FeatureCollection',
    properties: {
      missionId: document.id,
      model: 'nominal-survey-bands-v1',
      acquiredData: false,
      warning:
        'Ожидаемое геометрическое покрытие, не фактические снимки и не гарантия качества.',
    },
    features: views.flatMap((view) =>
      (['covered', 'missing'] as const).map((kind) => ({
        type: 'Feature',
        properties: {
          jobId: view.jobId,
          name: view.name,
          kind,
          status: view.status,
          qualityStatus: view.qualityStatus,
          details: view.details,
        },
        geometry:
          view.status !== 'calculated'
            ? null
            : {
                type: 'MultiPolygon',
                coordinates: view[kind].map((p) =>
                  p.map((ring) => ring.map(project.inverse)),
                ),
              },
      })),
    ),
  };
}
