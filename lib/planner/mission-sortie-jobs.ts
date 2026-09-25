import type { ScheduledSortie, MissionJob } from './mission-schema.ts';
import type { Segment } from './schema.ts';
import { canonicalStringify } from './mission-schema.ts';

/** Legacy single-work sorties remain readable; a joint flight tags every segment. */
export const segmentJobId = (sortie: ScheduledSortie, segment: Segment) =>
  segment.jobId ?? sortie.jobId;
export const sortieJobIds = (sortie: ScheduledSortie): string[] => [
  ...new Set([
    sortie.jobId,
    ...sortie.segments.map((s) => segmentJobId(sortie, s)),
  ]),
];
export const sortieHasJob = (sortie: ScheduledSortie, jobId: string) =>
  sortieJobIds(sortie).includes(jobId);
export const jobSurveySegments = (sorties: ScheduledSortie[], jobId: string) =>
  sorties.flatMap((s) =>
    s.segments.filter(
      (p) => p.phase === 'survey' && segmentJobId(s, p) === jobId,
    ),
  );

/** Deliberately narrow: no in-air payload exchange, altitude change or new window semantics. */
export function sameFlightProfile(a: MissionJob, b: MissionJob): boolean {
  const key = (j: MissionJob) =>
    canonicalStringify({
      type: j.job.type,
      altitudeM: j.job.altitudeM,
      swathM: j.quality.mode === 'camera' ? undefined : j.job.swathM,
      sideOverlap: j.job.sideOverlap,
      triggerDistanceM:
        j.quality.mode === 'camera' ? undefined : j.job.triggerDistanceM,
      quality:
        j.quality.mode === 'camera'
          ? {
              mode: 'camera',
              maximumGsdCm: j.quality.maximumGsdCm,
              forwardOverlap: j.quality.forwardOverlap,
              maximumBlurPx: j.quality.maximumBlurPx,
              altitudeMode: j.quality.altitudeMode,
            }
          : j.quality,
      daylight: j.daylight,
      window: j.window ?? null,
    });
  return key(a) === key(b);
}
