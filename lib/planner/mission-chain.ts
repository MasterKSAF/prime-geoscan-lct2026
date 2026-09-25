import type { MissionDocument, ScheduledSortie } from './mission-schema.ts';
import type { Segment } from './schema.ts';
import type { JobContext } from './mission-engine.ts';
import { missionLegSpeed } from './mission-engine.ts';
import { distance } from './geometry.ts';
import {
  sameFlightProfile,
  segmentJobId,
  sortieJobIds,
} from './mission-sortie-jobs.ts';

/** Candidate only. Caller MUST independently validate the entire mission before accepting.
 * Keep the first departure, join compatible work, retain the final safe landing.
 * Only the last two flights of a vehicle may be joined: later battery states stay immutable.
 */
export function joinAreaFlights(
  d: MissionDocument,
  a: ScheduledSortie,
  b: ScheduledSortie,
  contexts: JobContext[],
): { flight: ScheduledSortie | null; reason: string } {
  const rejected = (reason: string) => ({ flight: null, reason });
  if (
    !d.planning.areaTransferPolicy ||
    !d.planning.safetyPolicy ||
    !d.planning.batteryPolicy ||
    a.vehicleId !== b.vehicleId ||
    a.batteryId !== b.batteryId ||
    a.cameraId !== b.cameraId ||
    a.endSec > b.startSec
  )
    return rejected(
      'Вылеты нельзя связать на одной текущей батарее и в одном расписании.',
    );
  const vehicle = d.scenario.vehicles.find((v) => v.id === a.vehicleId);
  const context = contexts.find((c) => c.job.id === a.jobId);
  if (!vehicle || vehicle.kind !== 'multirotor' || !context)
    return rejected('Объединение поддерживается для мультироторного профиля.');
  const ids = [...new Set([...sortieJobIds(a), ...sortieJobIds(b)])];
  if (
    ids.some((id) => {
      const job = d.jobs.find((j) => j.id === id);
      return (
        !job ||
        !sameFlightProfile(context.job, job) ||
        (job.assignedVehicleIds.length &&
          !job.assignedVehicleIds.includes(vehicle.id))
      );
    })
  )
    return rejected(
      'Различаются оборудование, параметры съёмки, высота, временные окна или назначение БВС.',
    );
  const returnAt = a.segments.findIndex(
    (s) => s.phase === 'return' || s.phase === 'landing',
  );
  const surveyAt = b.segments.findIndex((s) => s.phase === 'survey');
  if (returnAt < 1 || surveyAt < 1)
    return rejected('Нет подходящих фаз для перехода между участками.');
  const segments: Segment[] = a.segments
    .slice(0, returnAt)
    .map((s) => ({ ...s, jobId: segmentJobId(a, s) }));
  const g = context.geometry,
    altitude = context.scenario.job.altitudeM;
  let pos = g.forward(segments.at(-1)!.to);
  const target = g.forward(b.segments[surveyAt].from);
  try {
    const path = context.route(pos, target);
    if (!path)
      return rejected(
        'Между участками нет допустимого перехода с учётом запретов и препятствий.',
      );
    const add = (
      to: typeof pos,
      phase: Segment['phase'],
      duration: number,
      air: number,
    ) => {
      segments.push({
        from: g.inverse(pos),
        to: g.inverse(to),
        phase,
        altitudeFromM: altitude,
        altitudeToM: altitude,
        airspeedMps: air,
        groundSpeedMps: duration ? distance(pos, to) / duration : 0,
        distanceM: distance(pos, to),
        startSec: 0,
        endSec: duration,
        batteryFromPct: 0,
        batteryToPct: 0,
        jobId: b.jobId,
      });
      pos = to;
    };
    for (let i = 1; i < path.length; i++) {
      if (i > 1 && vehicle.turnSeconds > 0)
        add(pos, 'turn', vehicle.turnSeconds, 0);
      const length = distance(pos, path[i]);
      if (length < 1e-6) continue;
      const speed = missionLegSpeed(
        pos,
        path[i],
        vehicle,
        context.scenario,
        d,
        false,
      );
      add(path[i], 'transit', length / speed.ground, speed.air);
    }
    if (vehicle.turnSeconds > 0) add(pos, 'turn', vehicle.turnSeconds, 0);
    segments.push(
      ...b.segments
        .slice(surveyAt)
        .map((s) => ({ ...s, jobId: segmentJobId(b, s) })),
    );
  } catch (e) {
    return rejected(
      e instanceof Error ? e.message : 'Не удалось рассчитать переход.',
    );
  }
  const initial = a.segments[0].batteryFromPct;
  let elapsed = 0;
  for (const s of segments) {
    const duration = s.endSec - s.startSec;
    s.startSec = a.startSec + elapsed;
    s.batteryFromPct =
      initial - (elapsed / (vehicle.effectiveEnduranceMin * 60)) * 100;
    elapsed += duration;
    s.endSec = a.startSec + elapsed;
    s.batteryToPct =
      initial - (elapsed / (vehicle.effectiveEnduranceMin * 60)) * 100;
  }
  const remainingPct = segments.at(-1)!.batteryToPct;
  if (remainingPct < d.scenario.reservePct)
    return rejected(
      'После перехода и возврата не остаётся требуемого резерва батареи.',
    );
  if (elapsed >= a.durationSec + b.durationSec - 1e-6)
    return rejected('Прямой переход не сокращает суммарное время полёта.');
  return {
    reason: 'Участки объединены без промежуточной посадки.',
    flight: {
      ...a,
      segments,
      durationSec: elapsed,
      endSec: a.startSec + elapsed,
      readySec: a.startSec + elapsed + d.planning.serviceSec,
      distanceM: segments.reduce((n, s) => n + s.distanceM, 0),
      remainingPct,
      strips: a.strips + b.strips,
      shots: a.shots === null ? null : a.shots + (b.shots ?? 0),
    },
  };
}
