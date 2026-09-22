import type { Coordinate, Segment } from './schema.ts';
import {
  obstacleFootprints,
  checkExternalObstacles,
} from './obstacle-layer.ts';
import { projection, interpolate, inside, distance } from './geometry.ts';
import type { Multi, Point } from './geometry.ts';
import type { MissionDocument, ScheduledSortie } from './mission-schema.ts';
import {
  parseMissionDocument,
  sha256,
  canonicalStringify,
} from './mission-schema.ts';
import type { MissionCandidate } from './mission-schema.ts';
import type { Check } from './schema.ts';
import { coordinate, fixedWingSegmentMetadataSchema } from './schema.ts';
import { plannedPhotoCoverage } from './mission-photo-footprints.ts';
import {
  fixedWingSegmentKinematics,
  validateFixedWingSortie,
} from './fixed-wing-mission.ts';
import { capsuleInside } from './fixed-wing-dubins.ts';
import type { JobContext } from './mission-engine.ts';
import { missionJobContext } from './mission-engine.ts';
import {
  segmentInside,
  area,
  coveredArea,
  conservativeBuffer,
} from './geometry.ts';
import { groundSpeed } from './engine.ts';
import { qualityForJob } from './quality.ts';
import { buildMissionEvents } from './mission-events.ts';
import { z } from 'zod';
import { vehiclePlanningEligibility } from './fixed-wing-profile.ts';
import { missionWeatherChecks } from './mission-weather.ts';

const EPS = 1e-7;
const resultNumber = (min: number, max = 604800) =>
  z.number().min(min).max(max);
const resultId = z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/);
const resultSegmentSchema = z
  .object({
    from: coordinate,
    to: coordinate,
    phase: z.enum([
      'takeoff',
      'transit',
      'survey',
      'turn',
      'return',
      'landing',
    ]),
    altitudeFromM: resultNumber(0, 6000),
    altitudeToM: resultNumber(0, 6000),
    airspeedMps: resultNumber(0, 100),
    groundSpeedMps: resultNumber(0, 100),
    distanceM: resultNumber(0, 1000000),
    startSec: resultNumber(0),
    endSec: resultNumber(0),
    batteryFromPct: resultNumber(0, 100),
    batteryToPct: resultNumber(0, 100),
    stripId: resultNumber(0, 400).int().optional(),
    fixedWing: fixedWingSegmentMetadataSchema.optional(),
  })
  .strict();
const resultSortieSchema = z
  .object({
    id: resultId,
    jobId: resultId,
    batteryId: resultId,
    vehicleId: resultId,
    name: z.string().min(1).max(60),
    startSec: resultNumber(0),
    endSec: resultNumber(0),
    readySec: resultNumber(0, 619200),
    durationSec: resultNumber(0),
    distanceM: resultNumber(0, 100000000),
    remainingPct: resultNumber(0, 100),
    strips: resultNumber(1, 400).int(),
    shots: resultNumber(0, 1000000000).int().nullable(),
    segments: z.array(resultSegmentSchema).min(2).max(3000),
  })
  .strict();

/** Clip a time interval to min <= value(t) <= max, including the boundary. */
function clipLinear(
  interval: [number, number],
  value: number,
  slope: number,
  min: number,
  max: number,
): [number, number] | null {
  if (Math.abs(slope) < 1e-12)
    return value >= min - EPS && value <= max + EPS ? interval : null;
  const a = (min - value) / slope,
    b = (max - value) / slope,
    lo = Math.max(interval[0], Math.min(a, b)),
    hi = Math.min(interval[1], Math.max(a, b));
  return hi >= lo - EPS ? [lo, hi] : null;
}

export function positionAt(segment: Segment, sec: number) {
  const fraction = Math.max(
    0,
    Math.min(
      1,
      (sec - segment.startSec) /
        Math.max(EPS, segment.endSec - segment.startSec),
    ),
  );
  return {
    coordinate: interpolate(segment.from, segment.to, fraction) as Coordinate,
    altitudeM:
      segment.altitudeFromM +
      (segment.altitudeToM - segment.altitudeFromM) * fraction,
    batteryPct:
      segment.batteryFromPct +
      (segment.batteryToPct - segment.batteryFromPct) * fraction,
  };
}

/** Exact closest approach of two piecewise-linear segments during vertical overlap.
 * No frame sampling: a crossing between two rendered animation frames is detected.
 * Heights must use the same declared reference. Non-zero uncertainty is supplied
 * by the caller as a conservative enlargement of both protective distances.
 */
export function segmentSeparation(
  a: Segment,
  b: Segment,
  horizontalM: number,
  verticalM: number,
  forward?: (p: Coordinate) => Point,
): { conflict: boolean; distanceM: number; atSec: number } | null {
  const begin = Math.max(a.startSec, b.startSec),
    end = Math.min(a.endSec, b.endSec);
  if (end < begin - EPS) return null;
  // Standalone calls use an order-independent conservative longitude scale.
  // Mission calls supply ONE common local metre plane for the entire fleet.
  const latitude = Math.max(
      ...[a.from, a.to, b.from, b.to].map((p) => Math.abs(p[1])),
    ),
    p = { forward: forward ?? projection([0, latitude]).forward },
    aa = positionAt(a, begin),
    bb = positionAt(b, begin),
    pa = p.forward(aa.coordinate),
    pb = p.forward(bb.coordinate),
    ad = Math.max(EPS, a.endSec - a.startSec),
    bd = Math.max(EPS, b.endSec - b.startSec),
    av = p
      .forward(a.to)
      .map((v, i) => (v - p.forward(a.from)[i]) / ad) as Point,
    bv = p
      .forward(b.to)
      .map((v, i) => (v - p.forward(b.from)[i]) / bd) as Point,
    rel: Point = [pa[0] - pb[0], pa[1] - pb[1]],
    velocity: Point = [av[0] - bv[0], av[1] - bv[1]],
    dz = aa.altitudeM - bb.altitudeM,
    vz =
      (a.altitudeToM - a.altitudeFromM) / ad -
      (b.altitudeToM - b.altitudeFromM) / bd,
    overlap = clipLinear(
      [0, Math.max(0, end - begin)],
      dz,
      vz,
      -verticalM,
      verticalM,
    );
  if (!overlap) return null;
  const norm = velocity[0] ** 2 + velocity[1] ** 2,
    unconstrained =
      norm > EPS ? -(rel[0] * velocity[0] + rel[1] * velocity[1]) / norm : 0,
    t = Math.min(overlap[1], Math.max(overlap[0], unconstrained)),
    closest = Math.hypot(rel[0] + velocity[0] * t, rel[1] + velocity[1] * t);
  return {
    conflict: closest < horizontalM - EPS,
    distanceM: closest,
    atSec: begin + t,
  };
}

function edgesIntersect(a: Point, b: Point, c: Point, d: Point) {
  const cross = (x: Point, y: Point) => x[0] * y[1] - x[1] * y[0],
    sub = (x: Point, y: Point): Point => [x[0] - y[0], x[1] - y[1]],
    v = sub(b, a),
    w = sub(d, c),
    q = sub(c, a),
    denominator = cross(v, w);
  if (Math.abs(denominator) < EPS) {
    if (Math.abs(cross(q, v)) > EPS) return false;
    if (distance(a, b) < EPS)
      return Math.abs(distance(c, a) + distance(a, d) - distance(c, d)) < EPS;
    return (
      Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <=
        Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) + EPS &&
      Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <=
        Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) + EPS
    );
  }
  const t = cross(q, w) / denominator,
    u = cross(q, v) / denominator;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS;
}

/** Closed 4D volume intersection: footprint, altitude interval and active time. */
export function segmentIntersectsVolume(
  segment: Segment,
  volume: {
    footprint: Multi;
    minAltitudeM: number;
    maxAltitudeM: number;
    startSec: number;
    endSec: number;
  },
  forward: (p: Coordinate) => Point,
): boolean {
  const begin = Math.max(segment.startSec, volume.startSec),
    end = Math.min(segment.endSec, volume.endSec);
  if (end < begin - EPS) return false;
  const duration = Math.max(EPS, segment.endSec - segment.startSec),
    alt = positionAt(segment, begin).altitudeM,
    vz = (segment.altitudeToM - segment.altitudeFromM) / duration,
    interval = clipLinear(
      [0, Math.max(0, end - begin)],
      alt,
      vz,
      volume.minAltitudeM - (segment.fixedWing?.tubeRadiusM ?? 0),
      volume.maxAltitudeM + (segment.fixedWing?.tubeRadiusM ?? 0),
    );
  if (!interval) return false;
  const a = forward(positionAt(segment, begin + interval[0]).coordinate),
    b = forward(positionAt(segment, begin + interval[1]).coordinate);
  if (inside(a, volume.footprint) || inside(b, volume.footprint)) return true;
  const radius = segment.fixedWing?.tubeRadiusM ?? 0;
  if (radius > 0) {
    const pointEdge = (p: Point, c: Point, e: Point) => {
      const x = e[0] - c[0],
        y = e[1] - c[1],
        den = x * x + y * y;
      const t = den
        ? Math.max(
            0,
            Math.min(1, ((p[0] - c[0]) * x + (p[1] - c[1]) * y) / den),
          )
        : 0;
      return distance(p, [c[0] + x * t, c[1] + y * t]);
    };
    if (
      volume.footprint.some((poly) =>
        poly.some((ring) =>
          ring
            .slice(1)
            .some(
              (e, i) =>
                Math.min(
                  pointEdge(a, ring[i], e),
                  pointEdge(b, ring[i], e),
                  pointEdge(ring[i], a, b),
                  pointEdge(e, a, b),
                ) <=
                radius + EPS,
            ),
        ),
      )
    )
      return true;
  }
  return volume.footprint.some((poly) =>
    poly.some((ring) =>
      ring.slice(1).some((point, i) => edgesIntersect(a, b, ring[i], point)),
    ),
  );
}

/** Geometric Sun altitude, based on Julian-date solar coordinates; no refraction.
 * Not a weather model. Scheduling adds a 0.5 degree conservative margin and
 * samples at <= 60 sec to cover the bounded angular change between samples.
 */
export function sunAltitudeDeg(atMs: number, coordinate: Coordinate): number {
  const radians = Math.PI / 180,
    d = atMs / 86400000 + 2440587.5 - 2451545,
    anomaly = radians * (357.5291 + 0.98560028 * d),
    correction =
      radians *
      (1.9148 * Math.sin(anomaly) +
        0.02 * Math.sin(2 * anomaly) +
        0.0003 * Math.sin(3 * anomaly)),
    longitude = anomaly + correction + radians * 102.9372 + Math.PI,
    obliquity = radians * 23.4397,
    rightAscension = Math.atan2(
      Math.sin(longitude) * Math.cos(obliquity),
      Math.cos(longitude),
    ),
    declination = Math.asin(Math.sin(longitude) * Math.sin(obliquity)),
    sidereal = radians * (280.16 + 360.9856235 * d + coordinate[0]),
    hourAngle = sidereal - rightAscension,
    latitude = coordinate[1] * radians;
  return (
    Math.asin(
      Math.sin(latitude) * Math.sin(declination) +
        Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle),
    ) / radians
  );
}

export function segmentSunlight(
  segment: Segment,
  missionStartMs: number,
  minimumDeg: number,
): { pass: boolean; minimumDeg: number } {
  const samples = Math.max(
    1,
    Math.ceil((segment.endSec - segment.startSec) / 60),
  );
  let minimum = Infinity;
  for (let i = 0; i <= samples; i++) {
    const sec =
        segment.startSec + ((segment.endSec - segment.startSec) * i) / samples,
      position = positionAt(segment, sec);
    minimum = Math.min(
      minimum,
      sunAltitudeDeg(missionStartMs + sec * 1000, position.coordinate),
    );
  }
  return { pass: minimum >= minimumDeg + 0.5, minimumDeg: minimum };
}

export type CompiledRestriction = {
  id: string;
  footprint: Multi;
  minAltitudeM: number;
  maxAltitudeM: number;
  startSec: number;
  endSec: number;
};

export function compileRestrictions(
  d: MissionDocument,
  g: { forward: (p: Coordinate) => Point },
  sensorOffsetM = 0,
): CompiledRestriction[] {
  const start = Date.parse(d.window.start),
    guard = d.planning.safetyPolicy ? d.planning.temporalBufferSec : 0;
  return [
    ...d.restrictions.map((r) => {
      return {
        id: r.id,
        footprint: conservativeBuffer(
          r.geometry,
          d.scenario.clearanceM,
          g.forward,
        ),
        minAltitudeM: r.minAltitudeM - d.scenario.clearanceM,
        maxAltitudeM:
          r.maxAltitudeM === null
            ? Infinity
            : r.maxAltitudeM + d.scenario.clearanceM + sensorOffsetM,
        startSec:
          r.startAt === null
            ? -Infinity
            : (Date.parse(r.startAt) - start) / 1000 - guard,
        endSec:
          r.endAt === null
            ? Infinity
            : (Date.parse(r.endAt) - start) / 1000 + guard,
      };
    }),
    ...obstacleFootprints(d).map((geometry, i) => ({
      id: `external-${i}`,
      footprint: conservativeBuffer(
        geometry,
        Math.max(d.scenario.clearanceM, d.obstacleLayer?.bufferM ?? 0),
        g.forward,
      ),
      minAltitudeM: -Infinity,
      maxAltitudeM: Infinity,
      startSec: -Infinity,
      endSec: Infinity,
    })),
  ];
}

function guardSegments(s: Segment, guardSec: number): Segment[] {
  if (!guardSec) return [s];
  // Endpoint holds extend support in time. Added spatial envelopes below cover
  // the position error of a +/- guardSec shift, including phase boundaries.
  return [
    {
      ...s,
      to: s.from,
      altitudeToM: s.altitudeFromM,
      startSec: s.startSec - guardSec,
      endSec: s.startSec,
      distanceM: 0,
      groundSpeedMps: 0,
    },
    s,
    {
      ...s,
      from: s.to,
      altitudeFromM: s.altitudeToM,
      startSec: s.endSec,
      endSec: s.endSec + guardSec,
      distanceM: 0,
      groundSpeedMps: 0,
    },
  ];
}

export function sortiesConflict(
  d: MissionDocument,
  a: ScheduledSortie,
  b: ScheduledSortie,
): boolean {
  if (a.vehicleId === b.vehicleId) return false;
  const guard = d.planning.temporalBufferSec;
  if (a.endSec + guard * 2 < b.startSec || b.endSec + guard * 2 < a.startSec)
    return false;
  // The vertical occupied interval is [platform - suspension, platform].
  // Comparing interval centres with the sum of half-extents also covers cable
  // interiors, not just sensor endpoints. It is conservative near the ground
  // and assumes the declared vertical suspension, not an unmodelled swing.
  const suspension = (s: ScheduledSortie) => {
      const quality = d.jobs.find((job) => job.id === s.jobId)?.quality;
      return quality?.mode === 'geophysics' ? (quality.sensorOffsetM ?? 0) : 0;
    },
    aOffset = suspension(a),
    bOffset = suspension(b),
    centred = (s: Segment, offset: number): Segment =>
      offset
        ? {
            ...s,
            altitudeFromM: s.altitudeFromM - offset / 2,
            altitudeToM: s.altitudeToM - offset / 2,
          }
        : s,
    maxSpeed = (s: ScheduledSortie) =>
      Math.max(0, ...s.segments.map((x) => x.groundSpeedMps)),
    maxVertical = (s: ScheduledSortie) =>
      Math.max(
        0,
        ...s.segments.map(
          (x) =>
            Math.abs(x.altitudeToM - x.altitudeFromM) /
            Math.max(EPS, x.endSec - x.startSec),
        ),
      ),
    horizontal =
      d.planning.separationHorizontalM + (maxSpeed(a) + maxSpeed(b)) * guard,
    vertical =
      d.planning.separationVerticalM +
      (aOffset + bOffset) / 2 +
      (maxVertical(a) + maxVertical(b)) * guard;
  for (const first of a.segments)
    for (const second of b.segments) {
      if (
        first.endSec + guard * 2 < second.startSec ||
        second.endSec + guard * 2 < first.startSec
      )
        continue;
      for (const aa of guardSegments(first, guard))
        for (const bb of guardSegments(second, guard))
          if (
            segmentSeparation(
              centred(aa, aOffset),
              centred(bb, bOffset),
              horizontal +
                (aa.fixedWing?.tubeRadiusM ?? 0) +
                (bb.fixedWing?.tubeRadiusM ?? 0),
              vertical +
                (aa.fixedWing?.tubeRadiusM ?? 0) +
                (bb.fixedWing?.tubeRadiusM ?? 0),
              projection(
                d.planning.safetyPolicy
                  ? d.scenario.area.coordinates[0][0]
                  : aa.from,
              ).forward,
            )?.conflict
          )
            return true;
    }
  return false;
}

/** A parked aircraft does not disappear. Compare flights against all supplied
 * ground positions before departure, between sorties and after landing. Adjacent
 * parked aircraft alone are not an airborne conflict. No unreported taxi/removal
 * from a pad is invented. Unassigned/disabled fleet records still occupy space.
 */
export function groundSeparationConflicts(
  d: MissionDocument,
  sorties: ScheduledSortie[],
) {
  const conflicts: {
    vehicleId: string;
    otherVehicleId: string;
    startSec: number;
    endSec: number;
  }[] = [];
  const horizon =
    Math.max(0, ...sorties.map((s) => s.endSec)) +
    d.planning.temporalBufferSec * 2;
  for (const v of d.scenario.vehicles) {
    const flights = sorties
      .filter((s) => s.vehicleId === v.id)
      .sort((a, b) => a.startSec - b.startSec);
    let from = v.start,
      start = 0;
    const intervals: { from: Coordinate; start: number; end: number }[] = [];
    for (const flight of flights) {
      if (flight.startSec >= start)
        intervals.push({ from, start, end: flight.startSec });
      from = flight.segments.at(-1)?.to ?? v.landing;
      start = flight.endSec;
    }
    if (horizon >= start) intervals.push({ from, start, end: horizon });
    for (const interval of intervals) {
      const segment: Segment = {
        from: interval.from,
        to: interval.from,
        startSec: interval.start,
        endSec: interval.end,
        phase: 'landing',
        altitudeFromM: 0,
        altitudeToM: 0,
        airspeedMps: 0,
        groundSpeedMps: 0,
        distanceM: 0,
        batteryFromPct: 0,
        batteryToPct: 0,
      };
      const hold: ScheduledSortie = {
        id: `ground-${v.id}`,
        jobId: '',
        vehicleId: v.id,
        batteryId: '',
        name: v.name,
        startSec: interval.start,
        endSec: interval.end,
        readySec: interval.end,
        durationSec: interval.end - interval.start,
        distanceM: 0,
        remainingPct: 0,
        strips: 0,
        shots: null,
        segments: [segment],
      };
      for (const flight of sorties) {
        if (sortiesConflict(d, flight, hold))
          conflicts.push({
            vehicleId: flight.vehicleId,
            otherVehicleId: v.id,
            startSec: Math.max(
              0,
              flight.startSec - d.planning.temporalBufferSec,
              interval.start - d.planning.temporalBufferSec,
            ),
            endSec: Math.min(
              flight.endSec + d.planning.temporalBufferSec,
              interval.end + d.planning.temporalBufferSec,
            ),
          });
      }
    }
  }
  return conflicts;
}

export function findSortieConflicts(
  d: MissionDocument,
  candidate: ScheduledSortie,
  existing: ScheduledSortie[],
  restrictions: CompiledRestriction[],
  g: { forward: (p: Coordinate) => Point },
) {
  let nextStartSec = candidate.startSec,
    permanent = false;
  for (const other of existing)
    if (sortiesConflict(d, candidate, other))
      nextStartSec = Math.max(
        nextStartSec,
        other.endSec + d.planning.temporalBufferSec * 2 + 0.01,
      );
  for (const restriction of restrictions)
    if (
      candidate.segments.some((s) =>
        segmentIntersectsVolume(s, restriction, g.forward),
      )
    ) {
      if (!Number.isFinite(restriction.endSec)) permanent = true;
      else
        nextStartSec = Math.max(
          nextStartSec,
          restriction.endSec +
            (d.planning.safetyPolicy ? 0 : d.planning.temporalBufferSec) +
            0.01,
        );
    }
  return { nextStartSec, permanent };
}

/** Constant, operator-supplied limits in the common start/flat-plane datum.
 * This is neither a forecast nor actual AGL, cloud geometry or sensor visibility.
 */
export function missionEnvironmentChecks(
  d: MissionDocument,
  segments: readonly Segment[],
  requestedAltitudesM: readonly number[] = [],
): Check[] {
  const environment = d.environment;
  if (!environment) return [];
  let maximumAltitudeM = 0;
  for (const altitude of requestedAltitudesM)
    maximumAltitudeM = Math.max(maximumAltitudeM, altitude);
  for (const segment of segments)
    maximumAltitudeM = Math.max(
      maximumAltitudeM,
      segment.altitudeFromM + (segment.fixedWing?.tubeRadiusM ?? 0),
      segment.altitudeToM + (segment.fixedWing?.tubeRadiusM ?? 0),
    );
  const ceiling =
    environment.cloudBaseM === null
      ? null
      : environment.cloudBaseM - environment.cloudClearanceM;
  const datum =
    'Высоты относительно единого базового уровня старта/модельной плоскости, не реальная AGL.';
  const source = `Постоянные условия на всё окно, источник: ${environment.source}`;
  return [
    {
      id: 'CLOUD_CEILING',
      status:
        ceiling === null
          ? 'unknown'
          : maximumAltitudeM <= ceiling + EPS
            ? 'pass'
            : 'fail',
      title: 'Нижняя граница облаков и запас',
      detail:
        ceiling === null
          ? `Нижняя граница облаков неизвестна; погодный потолок не проверен. ${datum} ${source}`
          : `Потолок ${ceiling} м = нижняя граница ${environment.cloudBaseM} м − запас ${environment.cloudClearanceM} м; максимальная заданная/маршрутная высота ${maximumAltitudeM} м. ${datum} ${source}`,
    },
    {
      id: 'VISIBILITY',
      status:
        environment.minVisibilityM === null
          ? 'unknown'
          : environment.visibilityM !== null &&
              environment.visibilityM + EPS >= environment.minVisibilityM
            ? 'pass'
            : 'fail',
      title: 'Заданный минимум видимости',
      detail:
        environment.minVisibilityM === null
          ? `Минимальная видимость не задана; ограничение не проверено. ${source}`
          : environment.visibilityM === null
            ? `Для заданного минимума ${environment.minVisibilityM} м нет значения видимости; выполнение ограничения не подтверждено. ${source}`
            : `Заданная видимость ${environment.visibilityM} м, требуемый минимум ${environment.minVisibilityM} м. Это не проверка фактического обзора или качества съёмки. ${source}`,
    },
  ];
}

/** Post-solve checks use only the document and exported trajectory. They do not
 * trust the allocator's elapsed time, resource decisions or pass/fail flags. */
export function validateMissionCandidate(
  d: MissionDocument,
  sorties: ScheduledSortie[],
  contexts: JobContext[],
): Check[] {
  const parsed = z.array(resultSortieSchema).max(300).safeParse(sorties);
  if (
    !parsed.success ||
    new Set(sorties.map((s) => s.id)).size !== sorties.length
  )
    return [
      {
        id: 'RESULT_SCHEMA',
        status: 'fail',
        title: 'Строгая схема результата',
        detail: parsed.success
          ? 'Повторяющиеся идентификаторы вылетов.'
          : parsed.error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; ')
              .slice(0, 1000),
      },
    ];
  const checks: Check[] = [],
    contextById = new Map(contexts.map((c) => [c.job.id, c])),
    volumesByJob = new Map(
      contexts.map((c) => [
        c.job.id,
        compileRestrictions(
          d,
          c.geometry,
          c.job.quality.mode === 'geophysics'
            ? (c.job.quality.sensorOffsetM ?? 0)
            : 0,
        ),
      ]),
    ),
    push = (id: string, ok: boolean, title: string, detail: string) =>
      checks.push({ id, status: ok ? 'pass' : 'fail', title, detail }),
    begin = Date.parse(d.window.start),
    windowSec = (Date.parse(d.window.end) - begin) / 1000;
  const environmentChecks = missionEnvironmentChecks(
    d,
    sorties.flatMap((sortie) => sortie.segments),
    contexts.map((context) => context.scenario.job.altitudeM),
  );
  let geometry = true,
    time = true,
    energy = true,
    continuity = true,
    envelope = true,
    restrictions = true,
    schedule = true,
    batteries = true,
    sunlight = true,
    compatibility = true;
  let phases = true;
  for (const sortie of sorties) {
    const context = contextById.get(sortie.jobId),
      vehicle = d.scenario.vehicles.find((v) => v.id === sortie.vehicleId),
      battery = d.batteries.find((b) => b.id === sortie.batteryId);
    if (
      !context ||
      !vehicle ||
      !battery ||
      battery.vehicleId !== sortie.vehicleId ||
      !sortie.segments.length
    ) {
      compatibility = false;
      geometry = false;
      time = false;
      energy = false;
      continuity = false;
      batteries = false;
      continue;
    }
    const g = context.geometry,
      altitude = context.scenario.job.altitudeM,
      segments = sortie.segments,
      volumes = volumesByJob.get(context.job.id)!,
      maxSurveySpeed = Math.max(
        0,
        ...segments
          .filter((s) => s.phase === 'survey')
          .map((s) => s.groundSpeedMps),
      ),
      quality = qualityForJob(context.job, {
        ...vehicle,
        airspeedMps: maxSurveySpeed || vehicle.airspeedMps,
      });
    if (context.job.window) {
      const start = (Date.parse(context.job.window.start) - begin) / 1000;
      const end = (Date.parse(context.job.window.end) - begin) / 1000;
      const pass = sortie.startSec >= start - EPS && sortie.endSec <= end + EPS;
      time &&= pass;
      checks.push({
        id: `${sortie.id}:WORK_WINDOW`,
        title: 'Период работы',
        status: pass ? 'pass' : 'fail',
        detail: `${context.job.name}: вылет и посадка должны находиться в периоде ${context.job.window.start} — ${context.job.window.end}.`,
      });
    }
    if (vehicle.kind === 'fixedWing')
      checks.push(...validateFixedWingSortie(d, sortie, context));
    checks.push(
      ...quality.checks
        .filter(
          (c) =>
            c.id.endsWith('CADENCE') ||
            c.id.endsWith('BLUR') ||
            c.id.endsWith('DENSITY') ||
            c.id.endsWith('SAMPLES'),
        )
        .map((c) => ({ ...c, id: `${sortie.id}:${c.id}` })),
    );
    compatibility &&=
      vehicle.enabled &&
      vehiclePlanningEligibility(vehicle).supported &&
      vehicle.jobs.includes(context.job.job.type) &&
      (!context.job.assignedVehicleIds.length ||
        context.job.assignedVehicleIds.includes(vehicle.id)) &&
      d.scenario.wind.speedMps <= vehicle.maxWindMps &&
      (!['Gemini', '801'].includes(vehicle.model) ||
        (vehicle.airspeedMps <= 15 && vehicle.maxWindMps <= 10));
    let elapsed = 0,
      measuredDistance = 0;
    const initialPct = segments[0].batteryFromPct;
    const lastSurveyIndex = segments.findLastIndex((s) => s.phase === 'survey');
    for (let index = 0; index < segments.length; index++) {
      const seg = segments[index],
        a = g.forward(seg.from),
        b = g.forward(seg.to),
        len = distance(a, b),
        duration = seg.endSec - seg.startSec;
      const previousPhase = segments[index - 1]?.phase;
      // Match the declared phase model: each survey has its approach manoeuvre;
      // intermediate vertices within a transit/return path also require a turn.
      // Reject phase relabelling that would hide such a vertex.
      phases &&=
        (seg.phase !== 'transit' || index < lastSurveyIndex) &&
        (seg.phase !== 'return' || index > lastSurveyIndex) &&
        (vehicle.kind === 'fixedWing' ||
          vehicle.turnSeconds === 0 ||
          ((seg.phase !== 'survey' || previousPhase === 'turn') &&
            !(seg.phase === 'transit' && previousPhase === 'transit') &&
            !(seg.phase === 'return' && previousPhase === 'return')));
      compatibility &&=
        seg.phase === 'survey'
          ? seg.stripId !== undefined
          : seg.stripId === undefined;
      geometry &&=
        vehicle.kind === 'fixedWing'
          ? capsuleInside(a, b, seg.fixedWing?.tubeRadiusM ?? Infinity, g.free)
          : !seg.fixedWing && segmentInside(a, b, g.free);
      restrictions &&= !volumes.some((volume) =>
        segmentIntersectsVolume(seg, volume, g.forward),
      );
      envelope &&=
        Math.min(seg.altitudeFromM, seg.altitudeToM) >= -EPS &&
        Math.max(seg.altitudeFromM, seg.altitudeToM) <=
          d.flightEnvelope.maxAltitudeM + EPS &&
        (seg.phase !== 'survey' ||
          Math.min(seg.altitudeFromM, seg.altitudeToM) >=
            d.flightEnvelope.minSurveyAltitudeM - EPS);
      if (index)
        continuity &&=
          distance(a, g.forward(segments[index - 1].to)) < 0.01 &&
          Math.abs(seg.altitudeFromM - segments[index - 1].altitudeToM) < EPS;
      let expectedDuration = 0,
        expectedAir = 0;
      try {
        if (vehicle.kind === 'fixedWing') {
          const fixed = fixedWingSegmentKinematics(d, vehicle, seg, g.forward);
          expectedDuration = fixed.durationSec;
          expectedAir = fixed.airspeedMps;
          compatibility &&= fixed.errors.length === 0;
        } else if (seg.phase === 'takeoff') {
          expectedDuration = altitude / vehicle.climbMps;
          continuity &&=
            index === 0 &&
            len < EPS &&
            seg.altitudeFromM === 0 &&
            seg.altitudeToM === altitude;
        } else if (seg.phase === 'landing') {
          expectedDuration = altitude / vehicle.descentMps;
          continuity &&=
            index === segments.length - 1 &&
            len < EPS &&
            seg.altitudeFromM === altitude &&
            seg.altitudeToM === 0;
        } else {
          continuity &&=
            seg.altitudeFromM === altitude && seg.altitudeToM === altitude;
          if (seg.phase === 'turn') {
            expectedDuration = vehicle.turnSeconds;
            continuity &&= len < EPS;
          } else if (
            seg.phase === 'survey' &&
            d.planning.windModel === 'constantGroundSpeed'
          ) {
            expectedDuration = len / vehicle.airspeedMps;
            const theta = (d.scenario.wind.fromDeg * Math.PI) / 180,
              vx = len ? ((b[0] - a[0]) / len) * vehicle.airspeedMps : 0,
              vy = len ? ((b[1] - a[1]) / len) * vehicle.airspeedMps : 0;
            expectedAir = Math.hypot(
              vx + Math.sin(theta) * d.scenario.wind.speedMps,
              vy + Math.cos(theta) * d.scenario.wind.speedMps,
            );
            compatibility &&=
              expectedAir <=
              Math.min(
                vehicle.maxAirspeedMps ??
                  (['Gemini', '801'].includes(vehicle.model)
                    ? 15
                    : vehicle.airspeedMps),
                ['Gemini', '801'].includes(vehicle.model) ? 15 : Infinity,
              ) +
                EPS;
          } else {
            expectedDuration =
              len / groundSpeed(a, b, vehicle.airspeedMps, d.scenario.wind);
            expectedAir = vehicle.airspeedMps;
          }
        }
      } catch {
        expectedDuration = Infinity;
        compatibility = false;
      }
      time &&=
        Number.isFinite(expectedDuration) &&
        duration >= 0 &&
        Math.abs(seg.startSec - sortie.startSec - elapsed) < 1e-4 &&
        Math.abs(duration - expectedDuration) < 1e-4 &&
        Math.abs(seg.distanceM - len) < 0.01 &&
        Math.abs(seg.groundSpeedMps - (duration > 0 ? len / duration : 0)) <
          1e-5 &&
        Math.abs(seg.airspeedMps - expectedAir) < 1e-5;
      energy &&=
        Math.abs(
          seg.batteryFromPct -
            (initialPct -
              (elapsed / (vehicle.effectiveEnduranceMin * 60)) * 100),
        ) < 1e-4 &&
        Math.abs(
          seg.batteryToPct -
            (initialPct -
              ((elapsed + expectedDuration) /
                (vehicle.effectiveEnduranceMin * 60)) *
                100),
        ) < 1e-4;
      if (seg.phase === 'survey' && context.job.daylight !== 'none')
        sunlight &&= segmentSunlight(
          seg,
          begin,
          context.job.daylight === 'topographicClearSky' ? 15 : 0,
        ).pass;
      elapsed += expectedDuration;
      measuredDistance += len;
    }
    time &&=
      Math.abs(elapsed - sortie.durationSec) < 1e-4 &&
      Math.abs(sortie.endSec - sortie.startSec - elapsed) < 1e-4 &&
      Math.abs(sortie.distanceM - measuredDistance) < 0.01;
    const surveySegments = segments.filter((s) => s.phase === 'survey'),
      expectedShots = ['RGB', 'MS', 'IR'].includes(context.job.job.type)
        ? surveySegments.reduce(
            (sum, s) =>
              sum +
              Math.floor(
                (s.distanceM + 1e-6) / context.scenario.job.triggerDistanceM,
              ) +
              1,
            0,
          )
        : null;
    time &&=
      sortie.strips === surveySegments.length && sortie.shots === expectedShots;
    energy &&=
      initialPct <= 100 + EPS &&
      initialPct > d.scenario.reservePct &&
      sortie.remainingPct >= d.scenario.reservePct - EPS &&
      Math.abs(
        sortie.remainingPct -
          (initialPct - (elapsed / (vehicle.effectiveEnduranceMin * 60)) * 100),
      ) < 1e-4;
    continuity &&=
      segments[0].phase === 'takeoff' &&
      segments.at(-1)!.phase === 'landing' &&
      distance(g.forward(segments.at(-1)!.to), g.forward(vehicle.landing)) <
        0.01;
    schedule &&=
      sortie.startSec >= d.planning.preparationSec - EPS &&
      sortie.endSec <= windowSec + EPS &&
      Math.abs(sortie.readySec - sortie.endSec - d.planning.serviceSec) < EPS;
  }
  for (const vehicle of d.scenario.vehicles) {
    const flights = sorties
        .filter((s) => s.vehicleId === vehicle.id)
        .sort((a, b) => a.startSec - b.startSec),
      projected = projection(vehicle.start);
    let at = d.planning.preparationSec,
      position = vehicle.start,
      chargerReady = 0;
    const resource = new Map(
      d.batteries
        .filter((b) => b.vehicleId === vehicle.id)
        .map((b) => [
          b.id,
          {
            pct: b.initialPct,
            ready: Math.max(0, (Date.parse(b.readyAt) - begin) / 1000),
            rechargeSec: b.rechargeSec,
          },
        ]),
    );
    schedule &&= flights.length <= d.planning.maxSortiesPerVehicle;
    for (const flight of flights) {
      if (!flight.segments.length) {
        batteries = false;
        continue;
      }
      schedule &&= flight.startSec >= at - EPS;
      continuity &&=
        distance(
          projected.forward(flight.segments[0].from),
          projected.forward(position),
        ) < 0.01;
      const battery = resource.get(flight.batteryId);
      if (!battery) {
        batteries = false;
        continue;
      }
      batteries &&=
        flight.startSec >= battery.ready - EPS &&
        Math.abs(flight.segments[0].batteryFromPct - battery.pct) < 1e-4;
      battery.pct = flight.remainingPct;
      battery.ready = flight.endSec + d.planning.serviceSec;
      if (battery.rechargeSec !== null) {
        battery.ready =
          Math.max(flight.endSec, chargerReady) + battery.rechargeSec;
        battery.pct = 100;
        chargerReady = battery.ready;
      }
      at = flight.readySec;
      position = flight.segments.at(-1)!.to;
    }
  }
  let separation = true,
    strips = contexts.length === d.jobs.length;
  for (let i = 0; i < sorties.length; i++)
    for (let j = i + 1; j < sorties.length; j++)
      separation &&= !sortiesConflict(d, sorties[i], sorties[j]);
  for (const context of contexts) {
    const segments = sorties
        .filter((s) => s.jobId === context.job.id)
        .flatMap((s) => s.segments.filter((x) => x.phase === 'survey')),
      ids = new Set<number>();
    strips &&= segments.length === context.strips.length;
    for (const segment of segments) {
      const expected = context.strips.find((s) => s.id === segment.stripId);
      if (!expected || ids.has(expected.id)) {
        strips = false;
        continue;
      }
      ids.add(expected.id);
      const a = context.geometry.forward(segment.from),
        b = context.geometry.forward(segment.to);
      strips &&=
        (distance(a, expected.a) < 0.01 && distance(b, expected.b) < 0.01) ||
        (distance(a, expected.b) < 0.01 && distance(b, expected.a) < 0.01);
    }
  }
  push(
    'GEOMETRY',
    geometry,
    'Границы и статические запреты',
    d.planning.safetyPolicy
      ? `Каждый отрезок проверен целиком, включая переходы и возврат. Запреты расширены, разрешённая зона сужена на защитный запас ${d.scenario.clearanceM} м в общей локальной проекции. Это параметр модели, не универсальная норма.`
      : 'Каждый отрезок проверен целиком, включая пересечения с границами, переходы и возврат.',
  );
  push(
    'STRIPS',
    strips,
    'Все рабочие полосы назначены',
    'Сверены идентификаторы и геометрия каждой исходной полосы, пропуски и повторы запрещены.',
  );
  const clippedAreaM2 = contexts.map((c) => ({
    id: c.job.id,
    lost: Math.max(0, area(c.geometry.gross) - area(c.geometry.target)),
  }));
  push(
    'REQUESTED_AREA',
    clippedAreaM2.every((c) => c.lost <= 0.1),
    'Исходная область не сокращена скрыто',
    `Запреты и границы не могут незаметно убрать часть задания. Численный допуск — только 0,1 м², отдельно от порога геометрического покрытия 99%. Потери: ${clippedAreaM2.map((c) => `${c.id}: ${c.lost.toFixed(3)} м²`).join('; ')}.`,
  );
  push(
    'PHASES',
    phases,
    'Обязательные манёвры и порядок фаз',
    'Каждой рабочей полосе предшествует манёвр с turnSeconds профиля; промежуточные вершины перехода/возврата не могут терять поворот. Возврат допускается только после последней рабочей полосы.',
  );
  push(
    'TIME',
    time,
    'Время и скорости',
    'Независимо пересчитаны длительности, ветер, геометрическая длина и фактическая требуемая воздушная скорость.',
  );
  push(
    'ENERGY',
    energy,
    'Линейный баланс ресурса',
    `Ни одна фаза не теряет расход; после посадки ≥${d.scenario.reservePct}% в принятой модели.`,
  );
  push(
    'ENDPOINTS',
    continuity,
    'Непрерывность траекторий',
    'Взлёт, посадка, позиции и высоты непрерывны; повторный вылет начинается в месте предыдущей посадки.',
  );
  push(
    'WINDOW',
    schedule,
    'Календарь и обслуживание',
    'Подготовка, общее окно, занятость БВС, обслуживание и предел вылетов проверены.',
  );
  push(
    'BATTERIES',
    batteries,
    'Экземпляры батарей',
    d.planning.batteryPolicy
      ? 'Проверены текущая батарея, расход между повторными вылетами и запас на возвращение; автоматического восстановления заряда нет.'
      : 'Проверены ID, исходный заряд, доступность и последовательная модельная зарядка; заряд не восстанавливается без события.',
  );
  push(
    'COMPATIBILITY',
    compatibility,
    'Совместимость и пределы профиля',
    'Выбранные БВС, назначение, работа, ветер и ограничения скорости согласованы.',
  );
  push(
    'FLIGHT_ENVELOPE',
    envelope,
    'Заданный высотный диапазон',
    'Ограничение съёмочной высоты отдельно от взлёта/посадки; абсолютный потолок всех фаз.',
  );
  push(
    'FOUR_DIMENSIONAL',
    restrictions,
    'Четырёхмерные ограничения',
    d.planning.safetyPolicy
      ? `Сегменты пересечены с полигоном, интервалом высоты и активным временем, расширенным на ±${d.planning.temporalBufferSec} с. Неизвестный верх закрывает весь столб.`
      : 'Сегменты пересечены с полигоном, интервалом высоты и активным временем; неизвестный верх закрывает весь столб.',
  );
  push(
    'SEPARATION',
    separation,
    'Непрерывное разнесение',
    `Аналитический минимум расстояния между линейными сегментами с учётом вертикального объёма БВС–геофизический подвес, не проверка по кадрам. Параметры: ${d.planning.separationSource} Временная неопределённость консервативно расширяет защитные расстояния и интервалы. Колебания подвеса не моделируются.`,
  );
  push(
    'DAYLIGHT',
    sunlight,
    'Условия освещения',
    'Проверены только работы с включённым правилом; Солнце вычислено по UTC и координатам, шаг≤60 с и запас0,5°; облачное исключение не применяется.',
  );
  const groundConflicts = d.planning.safetyPolicy
    ? groundSeparationConflicts(d, sorties)
    : [];
  if (d.planning.safetyPolicy)
    push(
      'GROUND_SEPARATION',
      groundConflicts.length === 0,
      'Свободные места взлёта и посадки',
      groundConflicts.length
        ? `Опасное сближение со стоящим БВС: ${groundConflicts
            .slice(0, 8)
            .map((x) => `${x.vehicleId} / ${x.otherVehicleId}`)
            .join(
              '; ',
            )}. Укажите разнесённые физические площадки; освобождение места не предполагается автоматически.`
        : 'Проверены все переданные БВС на земле: до первого вылета, между вылетами и после посадки; также неназначенные аппараты. Удаление с площадки без данных не предполагается.',
    );
  const externalChecks = checkExternalObstacles(
    d,
    sorties.flatMap((s) => s.segments),
  );
  checks.push(...externalChecks, ...environmentChecks);
  const forecastChecks = missionWeatherChecks(
    d,
    sorties.map((s) => s.vehicleId),
  );
  checks.push(...forecastChecks);
  push(
    'RESERVE_LANDING',
    geometry &&
      continuity &&
      energy &&
      time &&
      phases &&
      restrictions &&
      envelope &&
      schedule &&
      (!d.planning.safetyPolicy ||
        (separation && groundConflicts.length === 0)) &&
      !environmentChecks.some((check) => check.status === 'fail') &&
      !externalChecks.some((check) => check.status === 'fail') &&
      !forecastChecks.some((check) => check.status === 'fail'),
    'Достижимая посадка из каждой точки',
    'Консервативный сертификат: остаток того же проверенного непрерывного маршрута является допустимым путём к назначенной посадке и заканчивается с требуемым резервом. Это не кратчайший аварийный уход.',
  );
  checks.push({
    id: 'ALTERNATE_ESCAPE',
    status: 'unknown',
    title: 'Альтернативный аварийный уход',
    detail:
      'Отдельный интервальный протокол ухода доступен в «Результаты → Анализ → Возврат из любой части маршрута». Этот основной набор проверок не подменяет его результат. Падение, внезапные новые условия и внешние БВС не покрываются сертификатом исходного плана.',
  });
  checks.push({
    id: 'TERRAIN',
    status: d.terrainModel.kind === 'flat' ? 'pass' : 'unknown',
    title: 'Поверхность в расчётной модели',
    detail:
      d.terrainModel.kind === 'flat'
        ? `Единая горизонтальная плоскость ${d.terrainModel.elevationM} м; высоты траекторий относительно неё. Источник: ${d.terrainModel.source} Это не проверка реального рельефа.`
        : `Рельеф неизвестен: ${d.terrainModel.source}`,
  });
  checks.push({
    id: 'CALIBRATION',
    status: 'unknown',
    title: 'Реальная динамика и энергия',
    detail:
      'Модельные фазы не подтверждены полётными логами; расход нагрузки, температура и деградация АКБ не калиброваны.',
  });
  checks.push({
    id: 'IMAGE_FOOTPRINTS',
    status: 'unknown',
    title: 'Реальные фотоотпечатки',
    detail:
      'Отдельно проверяются ожидаемые отпечатки над плоской поверхностью. Реальные изображения, наклоны, экспозиция и аппаратное срабатывание камеры не получены и не подтверждены.',
  });
  checks.push(
    ...plannedPhotoCoverage(d, sorties).flatMap((view) => view.checks),
  );
  checks.push({
    id: 'AIRSPACE_PERMISSION',
    status: 'unknown',
    title: 'Допуск к реальному полёту',
    detail:
      'Пользовательские зоны не заменяют актуальные разрешения, региональные запреты и воздушную обстановку.',
  });
  if (d.planning.altitudePreference !== 'balanced')
    checks.push({
      id: 'ALTITUDE_PREFERENCE',
      status: 'unknown',
      title: 'Поиск высоты по предпочтению',
      detail:
        'Применяется заданная высота работы; автоматический поиск ниже/выше ещё не реализован.',
    });
  return checks;
}

/** Rebuild verification context from the exported document, never from saved
 * solver pass flags. The selected bearing must belong to the bounded search set.
 */
export async function validateExportedCandidate(
  document: MissionDocument,
  candidate: MissionCandidate,
): Promise<Check[]> {
  try {
    const d = parseMissionDocument(document),
      hash = await sha256(d),
      checks: Check[] = [],
      contexts: JobContext[] = [];
    checks.push({
      id: 'INPUT_HASH',
      status: hash === candidate.plan.inputHash ? 'pass' : 'fail',
      title: 'Связь результата со входом',
      detail: 'SHA-256 канонического документа пересчитан независимо.',
    });
    const rows = candidate.jobCoverage;
    let choices =
      Array.isArray(rows) &&
      rows.length === d.jobs.length &&
      new Set(rows.map((r) => r.jobId)).size === rows.length;
    for (const job of d.jobs) {
      const row = rows?.find((r) => r.jobId === job.id),
        selected = row?.bearingDeg,
        allowed = [
          job.job.bearingDeg,
          ...(job.job.autoBearing ? [(job.job.bearingDeg + 90) % 180] : []),
        ];
      const valid =
        typeof selected === 'number' &&
        Number.isFinite(selected) &&
        allowed.some((x) => Math.abs(x - selected) < EPS);
      choices &&= valid;
      contexts.push(
        missionJobContext(d, {
          ...job,
          job: {
            ...job.job,
            bearingDeg: valid ? selected : job.job.bearingDeg,
            autoBearing: false,
          },
        }),
      );
    }
    checks.push({
      id: 'BEARING_PROVENANCE',
      status: choices ? 'pass' : 'fail',
      title: 'Направления рабочих полос',
      detail:
        'Каждой работе соответствует один сохранённый угол из разрешённого набора поиска.',
    });
    const baseChecks = validateMissionCandidate(d, candidate.sorties, contexts);
    checks.push(...baseChecks);
    if (baseChecks.some((c) => c.id === 'RESULT_SCHEMA' && c.status === 'fail'))
      return checks;
    const expectedClaims: Check[] = [
      ...baseChecks,
      ...contexts.flatMap((context) =>
        context.checks.map((check) => ({
          ...check,
          id: `${context.job.id}:${check.id}`,
        })),
      ),
    ];
    let coverage = true,
      coverageMetadata = true,
      gross = 0,
      target = 0,
      measured = 0;
    for (const context of contexts) {
      const surveys = candidate.sorties
          .filter((s) => s.jobId === context.job.id)
          .flatMap((s) => s.segments.filter((x) => x.phase === 'survey')),
        actual = surveys.length
          ? coveredArea(
              context.geometry,
              surveys.map((s, id) => ({
                id,
                a: context.geometry.forward(s.from),
                b: context.geometry.forward(s.to),
              })),
              context.scenario.job.swathM,
            )
          : 0,
        targetArea = area(context.geometry.target),
        grossArea = area(context.geometry.gross),
        row = rows?.find((r) => r.jobId === context.job.id),
        pct = Math.min(100, (actual / targetArea) * 100),
        grossPct = Math.min(100, (actual / grossArea) * 100);
      coverage &&= pct >= 99 && grossPct >= 99;
      coverageMetadata &&=
        !!row &&
        Math.abs(row.coveragePct - pct) < 1e-5 &&
        Math.abs(row.grossCoveragePct - grossPct) < 1e-5 &&
        Math.abs(row.grossAreaHa - grossArea / 10000) < 1e-5 &&
        Math.abs(row.targetAreaHa - targetArea / 10000) < 1e-5;
      gross += grossArea;
      target += targetArea;
      measured += actual;
      expectedClaims.push({
        id: `COVERAGE_${context.job.id}`,
        status: pct >= 99 && grossPct >= 99 ? 'pass' : 'fail',
        title: 'Геометрическое покрытие работы',
        detail: `${pct.toFixed(3)}% доступной области; ${grossPct.toFixed(3)}% исходной. Исключённая запретами часть не засчитана как выполненная.`,
      });
      checks.push(
        ...context.checks.map((c) => ({ ...c, id: `EXPORTED_${c.id}` })),
      );
    }
    checks.push({
      id: 'COVERAGE',
      status: coverage ? 'pass' : 'fail',
      title: 'Повторная проверка покрытия',
      detail:
        'Геометрические полосы заново пересечены с исходной и доступной областями каждой работы.',
    });
    const m = candidate.metrics,
      makespan = Math.max(0, ...candidate.sorties.map((s) => s.endSec)),
      flightTime = candidate.sorties.reduce((sum, s) => sum + s.durationSec, 0),
      routeDistance = candidate.sorties.reduce(
        (sum, s) => sum + s.distanceM,
        0,
      ),
      minimumRemaining = candidate.sorties.length
        ? Math.min(...candidate.sorties.map((s) => s.remainingPct))
        : 0,
      batteryChanges = candidate.sorties.reduce((sum, flight) => {
        const previous = candidate.sorties
          .filter(
            (s) =>
              s.vehicleId === flight.vehicleId && s.endSec < flight.startSec,
          )
          .sort((a, b) => a.endSec - b.endSec)
          .at(-1);
        return (
          sum + (previous && previous.batteryId !== flight.batteryId ? 1 : 0)
        );
      }, 0),
      legacy = candidate.plan.metrics;
    const metricsValid =
      coverageMetadata &&
      Math.abs(m.makespanSec - makespan) < 1e-5 &&
      Math.abs(m.flightTimeSec - flightTime) < 1e-5 &&
      Math.abs(m.distanceM - routeDistance) < 1e-4 &&
      m.sortieCount === candidate.sorties.length &&
      m.vehicleCount ===
        new Set(candidate.sorties.map((s) => s.vehicleId)).size &&
      Math.abs(m.minimumRemainingPct - minimumRemaining) < 1e-5 &&
      m.batteryChanges === batteryChanges &&
      Math.abs(m.coveragePct - Math.min(100, (measured / target) * 100)) <
        1e-5 &&
      Math.abs(m.grossCoveragePct - Math.min(100, (measured / gross) * 100)) <
        1e-5 &&
      Math.abs(legacy.makespanSec - makespan) < 1e-5 &&
      Math.abs(legacy.flightTimeSec - flightTime) < 1e-5 &&
      Math.abs(legacy.distanceM - routeDistance) < 1e-4 &&
      Math.abs(legacy.areaHa - gross / 10000) < 1e-5 &&
      Math.abs(legacy.targetHa - target / 10000) < 1e-5 &&
      Math.abs(legacy.excludedHa - (gross - target) / 10000) < 1e-5 &&
      Math.abs(legacy.coveragePct - Math.min(100, (measured / target) * 100)) <
        1e-5 &&
      legacy.stripCount ===
        contexts.reduce((sum, c) => sum + c.strips.length, 0) &&
      ['makespan', 'flightTime'].includes(candidate.objective) &&
      candidate.plan.scenario.objective === candidate.objective;
    checks.push({
      id: 'METRICS',
      status: metricsValid ? 'pass' : 'fail',
      title: 'Числа отчёта',
      detail:
        'Площадь, покрытие, время, длина и число ресурсов пересчитаны по исходным данным и траекториям.',
    });
    checks.push({
      id: 'EVENT_JOURNAL',
      status:
        canonicalStringify(candidate.events) ===
        canonicalStringify(buildMissionEvents(d, candidate.sorties))
          ? 'pass'
          : 'fail',
      title: 'Журнал соответствует проверяемому плану',
      detail:
        'Полный упорядоченный журнал заново построен из вылетов, фаз, батарей и расписания, включая обслуживание и зарядку. Пропущенные, выдуманные или изменённые события запрещены.',
    });
    checks.push({
      id: 'SAVED_CHECKS',
      status:
        canonicalStringify(candidate.checks) ===
          canonicalStringify(expectedClaims) &&
        canonicalStringify(candidate.plan.checks) ===
          canonicalStringify(expectedClaims)
          ? 'pass'
          : 'fail',
      title: 'Сохранённые проверки подтверждены заново',
      detail:
        'Сопоставлены все ID, статусы и пояснения обеих копий проверок с текущим проверяющим проходом. Неизвестное нельзя заменить положительным утверждением; старые пакеты требуют повторного расчёта текущей версией.',
    });
    const traceSchema = z
      .array(
        z
          .object({
            event: z.enum([
              'SORTIE',
              'BATTERY_CHARGE',
              'NO_ASSIGNMENT',
              'BUDGET',
              'SEARCH',
              'SEARCH_STRATEGY',
              'JOB_PRIORITY_ORDER',
              'SEARCH_REPAIR',
              'PARALLEL_BASELINE_PROTOCOL',
              'COMMON_CANDIDATE_POOL',
              'BASELINE_PROTOCOL',
              'VEHICLE_EXCLUDED',
              'GROUND_REJECT',
            ]),
            detail: z.string().max(10000),
          })
          .strict(),
      )
      .max(3000);
    checks.push({
      id: 'TRACE_PROJECTION',
      status:
        traceSchema.safeParse(candidate.trace).success &&
        canonicalStringify(candidate.trace) ===
          canonicalStringify(candidate.plan.trace)
          ? 'pass'
          : 'fail',
      title: 'Согласованность диагностических трасс',
      detail:
        'Схема трассы и её копия для представления совпадают. Это не доказательство истинности истории поиска.',
    });
    checks.push({
      id: 'TRACE_SEARCH_PROVENANCE',
      status: 'unknown',
      title: 'Происхождение диагностической трассы поиска',
      detail:
        'Перебор кандидатов и момент исчерпания вычислительного бюджета нельзя восстановить из итоговых траекторий. Трасса не используется как доказательство оптимальности или достоверный журнал исполнения; маршрутные события проверены отдельно.',
    });
    checks.push({
      id: 'VIEW_PROJECTION',
      status:
        canonicalStringify(candidate.plan.missions) ===
          canonicalStringify(candidate.sorties) &&
        canonicalStringify(candidate.plan.scenario) ===
          canonicalStringify({ ...d.scenario, objective: candidate.objective })
          ? 'pass'
          : 'fail',
      title: 'Карта показывает тот же план',
      detail:
        'Совместимая проекция для карты совпадает с проверенными вылетами и исходным сценарием, включая геометрию, ветер и профили. Отдельной декоративной траектории или подменённой подложки задания нет.',
    });
    if (candidate.plan.baseline)
      checks.push({
        id: 'BASELINE_EXPORT',
        status: 'unknown',
        title: 'Повторная проверка baseline',
        detail:
          'При расчёте baseline прошёл тот же валидатор. Экспорт содержит его итоговые числа, но не все исходные траектории: для независимого подтверждения улучшения нужно повторить расчёт той же версии.',
      });
    return checks;
  } catch (error) {
    return [
      {
        id: 'EXPORTED_VALIDATION',
        status: 'fail',
        title: 'Независимая проверка экспорта',
        detail: error instanceof Error ? error.message : String(error),
      },
    ];
  }
}
