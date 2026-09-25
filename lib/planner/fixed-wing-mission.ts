import type {
  Check,
  Coordinate,
  FixedWingSegmentMetadata,
  Scenario,
  Segment,
  Vehicle,
} from './schema.ts';
import type {
  MissionDocument,
  MissionJob,
  ScheduledSortie,
} from './mission-schema.ts';
import { fixedWingSegmentMetadataSchema } from './schema.ts';
import { distance, projection, segmentClearance } from './geometry.ts';
import type { Geometry, Point, Strip, Multi } from './geometry.ts';
import { groundSpeed } from './engine.ts';
import clipping from 'polygon-clipping';
import { qualityForJob } from './quality.ts';
import { resolveVehicleCamera } from './camera-profile.ts';
import {
  GEOSCAN_201_PASSPORT,
  fixedWingTurnRadius,
} from './fixed-wing-profile.ts';
import {
  angleDifference,
  capsuleInside,
  dubinsCandidates,
  fixedWingLoiter,
} from './fixed-wing-dubins.ts';
import type { FixedWingPose, FixedWingPrimitive } from './fixed-wing-dubins.ts';

export type FixedWingContext = {
  job: MissionJob;
  scenario: Scenario;
  geometry: Geometry;
};
const EPS = 1e-6;
const windVector = (s: Scenario): Point => {
  const theta = (s.wind.fromDeg * Math.PI) / 180;
  return [
    -Math.sin(theta) * s.wind.speedMps,
    -Math.cos(theta) * s.wind.speedMps,
  ];
};
const heading = (a: Point, b: Point) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const directedSpeed = (radians: number, v: Vehicle, s: Scenario) =>
  groundSpeed(
    [0, 0],
    [Math.cos(radians), Math.sin(radians)],
    v.airspeedMps,
    s.wind,
  );

/** Simpson quadrature defines the explicitly approximate model clock on an arc.
 * The full arc length bounds position error at ANY phase of the displayed chord;
 * separation must therefore add tubeRadiusM, not merely test the sampled points.
 */
function arcDuration(meta: FixedWingSegmentMetadata, v: Vehicle, s: Scenario) {
  const length = meta.radiusM! * Math.abs(meta.sweepRad!);
  const h = meta.headingFromRad,
    sweep = meta.sweepRad!;
  return (
    (length / 6) *
    (1 / directedSpeed(h, v, s) +
      4 / directedSpeed(h + sweep / 2, v, s) +
      1 / directedSpeed(h + sweep, v, s))
  );
}

/** Recompute kinematics and metadata rather than trusting a saved result. */
export function fixedWingSegmentKinematics(
  d: MissionDocument,
  v: Vehicle,
  seg: Segment,
  forward: (point: Coordinate) => Point = projection(
    d.scenario.area.coordinates[0][0],
  ).forward,
) {
  const errors: string[] = [],
    p = v.fixedWingProfile,
    meta = seg.fixedWing;
  let durationSec = Infinity,
    airspeedMps = 0,
    tubeRadiusM = Infinity;
  if (!p || !meta || !fixedWingSegmentMetadataSchema.safeParse(meta).success)
    return {
      durationSec,
      airspeedMps,
      tubeRadiusM,
      errors: ['Нет корректного явного профиля/метаданных самолёта.'],
    };
  const a = forward(seg.from),
    b = forward(seg.to),
    len = distance(a, b);
  try {
    if (meta.kind === 'arc') {
      if (
        !meta.center ||
        !meta.radiusM ||
        !meta.sweepRad ||
        Math.abs(meta.sweepRad) > Math.PI / 18 + EPS
      )
        errors.push(
          'Некорректная дуга: нужны центр, радиус и шаг не более 10°.',
        );
      else {
        const center = forward(meta.center),
          sign = Math.sign(meta.sweepRad),
          radius = meta.radiusM;
        const endpoint = (h: number): Point => [
          center[0] + sign * Math.sin(h) * radius,
          center[1] - sign * Math.cos(h) * radius,
        ];
        if (
          distance(endpoint(meta.headingFromRad), a) > 0.005 ||
          distance(endpoint(meta.headingToRad), b) > 0.005 ||
          angleDifference(
            meta.headingToRad,
            meta.headingFromRad + meta.sweepRad,
          ) > 1e-6
        )
          errors.push(
            'Геометрия дуги не совпадает с экспортированными концами и курсами.',
          );
        if (radius < fixedWingTurnRadius(v, d.scenario.wind.speedMps) - EPS)
          errors.push(
            'Радиус недостаточен для принятого ограничения крена и ветра.',
          );
        durationSec = arcDuration(meta, v, d.scenario);
        airspeedMps = v.airspeedMps;
        tubeRadiusM = p.trackingToleranceM + radius * Math.abs(meta.sweepRad);
        if (
          seg.phase !== 'turn' &&
          seg.phase !== 'return' &&
          seg.phase !== 'transit' &&
          seg.phase !== 'landing'
        )
          errors.push(
            'Дуга не может подменять прямую съёмки, взлёт или парашют.',
          );
        if (seg.phase === 'landing') {
          if (
            seg.altitudeToM > seg.altitudeFromM + EPS ||
            seg.altitudeToM < p.parachuteReleaseAltitudeM - EPS ||
            (seg.altitudeFromM - seg.altitudeToM) / durationSec >
              v.descentMps + EPS
          )
            errors.push(
              'Посадочный круг нарушает разрешённую скорость снижения или высоту выпуска.',
            );
        } else if (Math.abs(seg.altitudeFromM - seg.altitudeToM) > EPS)
          errors.push(
            'Изменение высоты дуги разрешено только на посадочном круге.',
          );
      }
    } else if (meta.kind === 'parachute') {
      durationSec =
        (seg.altitudeFromM - seg.altitudeToM) / p.parachuteDescentMps;
      const wind = windVector(d.scenario);
      if (
        seg.phase !== 'landing' ||
        Math.abs(seg.altitudeFromM - p.parachuteReleaseAltitudeM) > EPS ||
        seg.altitudeToM !== 0 ||
        durationSec <= 0 ||
        distance(b, [
          a[0] + wind[0] * durationSec,
          a[1] + wind[1] * durationSec,
        ]) > 0.01
      )
        errors.push(
          'Парашют должен снижаться до поверхности с учтённым сносом ветром.',
        );
      tubeRadiusM = p.trackingToleranceM;
    } else {
      if (
        meta.center !== undefined ||
        meta.radiusM !== undefined ||
        meta.sweepRad !== undefined
      )
        errors.push('Метаданные прямой не должны содержать дугу.');
      if (
        len <= EPS ||
        angleDifference(meta.headingFromRad, heading(a, b)) > 1e-6 ||
        angleDifference(meta.headingFromRad, meta.headingToRad) > 1e-6
      )
        errors.push(
          'Самолётная прямая не допускает зависание или скачок курса.',
        );
      if (seg.phase === 'takeoff') {
        durationSec = (seg.altitudeToM - seg.altitudeFromM) / v.climbMps;
        airspeedMps = v.airspeedMps;
        if (
          durationSec <= 0 ||
          seg.altitudeFromM !== 0 ||
          Math.abs(
            len -
              directedSpeed(meta.headingFromRad, v, d.scenario) * durationSec,
          ) > 0.01 ||
          angleDifference(
            meta.headingFromRad,
            Math.PI / 2 - (p.launchHeadingDeg * Math.PI) / 180,
          ) > 1e-6
        )
          errors.push(
            'Запуск должен двигаться вдоль указанного направления с набором высоты.',
          );
      } else if (
        seg.phase === 'survey' &&
        d.planning.windModel === 'constantGroundSpeed'
      ) {
        durationSec = len / v.airspeedMps;
        const wind = windVector(d.scenario);
        airspeedMps = Math.hypot(
          Math.cos(meta.headingFromRad) * v.airspeedMps - wind[0],
          Math.sin(meta.headingFromRad) * v.airspeedMps - wind[1],
        );
      } else {
        durationSec = len / directedSpeed(meta.headingFromRad, v, d.scenario);
        airspeedMps = v.airspeedMps;
      }
      tubeRadiusM = p.trackingToleranceM;
      if (
        seg.phase !== 'takeoff' &&
        Math.abs(seg.altitudeFromM - seg.altitudeToM) > EPS
      )
        errors.push('Неподдерживаемое изменение высоты самолётной прямой.');
    }
    if (
      meta.kind !== 'parachute' &&
      (airspeedMps < GEOSCAN_201_PASSPORT.minAirspeedMps - EPS ||
        airspeedMps >
          Math.min(
            v.maxAirspeedMps ?? GEOSCAN_201_PASSPORT.maxAirspeedMps,
            GEOSCAN_201_PASSPORT.maxAirspeedMps,
          ) +
            EPS)
    )
      errors.push(
        'Воздушная скорость вне паспортного/заданного диапазона 201.',
      );
    if (
      !Number.isFinite(durationSec) ||
      durationSec <= 0 ||
      Math.abs(meta.tubeRadiusM - tubeRadiusM) > 1e-5
    )
      errors.push(
        'Время или консервативная трубка самолётного сегмента не совпадают с моделью.',
      );
  } catch {
    errors.push(
      'Не удалось вычислить самолётную кинематику при заданном ветре.',
    );
  }
  return { durationSec, airspeedMps, tubeRadiusM, errors };
}

function metadata(
  primitive: FixedWingPrimitive,
  v: Vehicle,
  g: Geometry,
): FixedWingSegmentMetadata {
  const arc = primitive.center !== undefined;
  return {
    kind: arc ? 'arc' : 'straight',
    headingFromRad: primitive.headingFromRad,
    headingToRad: primitive.headingToRad,
    tubeRadiusM:
      v.fixedWingProfile!.trackingToleranceM + (arc ? primitive.lengthM : 0),
    ...(arc
      ? {
          center: g.inverse(primitive.center!),
          radiusM: primitive.radiusM,
          sweepRad: primitive.sweepRad,
        }
      : {}),
  };
}

function landingHeading(d: MissionDocument, v: Vehicle) {
  return (
    Math.PI / 2 -
    ((d.scenario.wind.speedMps > EPS
      ? d.scenario.wind.fromDeg
      : v.fixedWingProfile!.launchHeadingDeg) *
      Math.PI) /
      180
  );
}

function descendingLoiter(
  d: MissionDocument,
  v: Vehicle,
  g: Geometry,
  pose: FixedWingPose,
  altitude: number,
) {
  const profile = v.fixedWingProfile!,
    target = profile.parachuteReleaseAltitudeM;
  if (altitude < target - EPS) return null;
  if (Math.abs(altitude - target) < EPS) return [];
  const radius = fixedWingTurnRadius(v, d.scenario.wind.speedMps);
  const circle = [false, true]
    .map((clockwise) => fixedWingLoiter(pose, radius, clockwise))
    .find((path) =>
      path.every((part) =>
        capsuleInside(
          part.from,
          part.to,
          profile.trackingToleranceM + part.lengthM,
          g.free,
        ),
      ),
    );
  if (!circle) return null;
  const times = circle.map((part) =>
    arcDuration(metadata(part, v, g), v, d.scenario),
  );
  const circleSec = times.reduce((sum, time) => sum + time, 0),
    repeats = Math.max(
      1,
      Math.ceil((altitude - target) / v.descentMps / circleSec),
    );
  if (repeats > 20) return null;
  const duration = circleSec * repeats,
    result: { part: FixedWingPrimitive; h1: number; h2: number }[] = [];
  let elapsed = 0;
  for (let repeat = 0; repeat < repeats; repeat++)
    circle.forEach((part, i) => {
      const h1 = altitude - ((altitude - target) * elapsed) / duration;
      elapsed += times[i];
      result.push({
        part,
        h1,
        h2: altitude - ((altitude - target) * elapsed) / duration,
      });
    });
  return result;
}

/** Read-only geometry/speed/energy/continuity checks shared by solve and replay. */
export function validateFixedWingSortie(
  d: MissionDocument,
  sortie: ScheduledSortie,
  context: FixedWingContext,
): Check[] {
  const v = d.scenario.vehicles.find((x) => x.id === sortie.vehicleId);
  if (!v?.fixedWingProfile)
    return [
      {
        id: 'FIXED_WING_PROFILE',
        status: 'fail',
        title: 'Самолётный профиль',
        detail: 'Для 201 нужен явно заданный модельный профиль.',
      },
    ];
  const g = context.geometry,
    failures: string[] = [],
    tubeFailures: string[] = [],
    clearanceFailures: string[] = [];
  const first = sortie.segments[0],
    last = sortie.segments.at(-1);
  const launchFailures: string[] = [];
  let elapsed = 0;
  sortie.segments.forEach((seg, i) => {
    const k = fixedWingSegmentKinematics(d, v, seg, g.forward);
    failures.push(...k.errors.map((e) => `${i}: ${e}`));
    if (
      (seg.phase === 'takeoff' && i !== 0) ||
      (seg.fixedWing?.kind === 'parachute' &&
        i !== sortie.segments.length - 1) ||
      (i > 0 &&
        sortie.segments[i - 1].phase === 'landing' &&
        seg.phase !== 'landing')
    )
      failures.push(
        `${i}: запуск только в начале, парашют только в конце; после посадочного этапа обычный полёт не возобновляется.`,
      );
    const len = distance(g.forward(seg.from), g.forward(seg.to)),
      dt = seg.endSec - seg.startSec;
    if (
      Math.abs(dt - k.durationSec) > 1e-4 ||
      Math.abs(seg.airspeedMps - k.airspeedMps) > 1e-5 ||
      Math.abs(seg.groundSpeedMps - len / dt) > 1e-5 ||
      Math.abs(seg.distanceM - len) > 0.01 ||
      Math.abs(seg.startSec - sortie.startSec - elapsed) > 1e-4
    )
      failures.push(`${i}: геометрия, часы или скорость результата изменены.`);
    if (
      Math.abs(
        seg.batteryFromPct -
          (first.batteryFromPct -
            (elapsed / (v.effectiveEnduranceMin * 60)) * 100),
      ) > 1e-4 ||
      Math.abs(
        seg.batteryToPct -
          (first.batteryFromPct -
            ((elapsed + dt) / (v.effectiveEnduranceMin * 60)) * 100),
      ) > 1e-4
    )
      failures.push(`${i}: расход текущей батареи не совпадает с временем.`);
    if (i > 0) {
      const prev = sortie.segments[i - 1];
      if (
        distance(g.forward(prev.to), g.forward(seg.from)) > 0.01 ||
        Math.abs(prev.altitudeToM - seg.altitudeFromM) > EPS ||
        (seg.fixedWing?.kind !== 'parachute' &&
          angleDifference(
            prev.fixedWing?.headingToRad ?? Infinity,
            seg.fixedWing?.headingFromRad ?? Infinity,
          ) > 1e-6)
      )
        failures.push(`${i}: разрыв траектории, высоты или направления.`);
    }
    if (
      !capsuleInside(
        g.forward(seg.from),
        g.forward(seg.to),
        k.tubeRadiusM,
        g.free,
      )
    )
      tubeFailures.push(String(i));
    if (!['takeoff', 'landing'].includes(seg.phase)) {
      if (
        Math.min(seg.altitudeFromM, seg.altitudeToM) <
        GEOSCAN_201_PASSPORT.minObstacleClearanceM
      )
        clearanceFailures.push(`${i}: менее 100 м над модельной поверхностью`);
      for (const obstacle of d.restrictions.filter(
        (r) => r.kind === 'obstacle',
      )) {
        const poly: Multi = [
          obstacle.geometry.coordinates.map((ring) => ring.map(g.forward)),
        ];
        if (
          segmentClearance(g.forward(seg.from), g.forward(seg.to), poly) <=
            k.tubeRadiusM + EPS &&
          (obstacle.maxAltitudeM === null ||
            Math.min(seg.altitudeFromM, seg.altitudeToM) <
              obstacle.maxAltitudeM +
                GEOSCAN_201_PASSPORT.minObstacleClearanceM)
        )
          clearanceFailures.push(`${i}: нет 100 м над ${obstacle.id}`);
      }
    }
    elapsed += dt;
  });
  if (
    !first ||
    !last ||
    first.phase !== 'takeoff' ||
    last.fixedWing?.kind !== 'parachute' ||
    distance(g.forward(last.to), g.forward(v.landing)) > 0.01 ||
    Math.abs(elapsed - sortie.durationSec) > 1e-4 ||
    Math.abs(sortie.endSec - sortie.startSec - elapsed) > 1e-4 ||
    Math.abs(sortie.remainingPct - last.batteryToPct) > 1e-4 ||
    sortie.remainingPct < d.scenario.reservePct - EPS
  )
    failures.push(
      'Некорректное начало/завершение вылета или недопустимый остаток батареи.',
    );
  if (
    sortie.distanceM > GEOSCAN_201_PASSPORT.maxRouteM ||
    sortie.durationSec > GEOSCAN_201_PASSPORT.maxEnduranceMin * 60
  )
    failures.push(
      'Вылет превышает паспортную протяжённость/продолжительность.',
    );
  const trueDistance = sortie.segments.reduce(
    (sum, seg) =>
      sum +
      (seg.fixedWing?.kind === 'arc'
        ? seg.fixedWing.radiusM! * Math.abs(seg.fixedWing.sweepRad!)
        : seg.distanceM),
    0,
  );
  if (
    Math.abs(
      sortie.distanceM -
        sortie.segments.reduce((sum, seg) => sum + seg.distanceM, 0),
    ) > 0.01
  )
    failures.push('Суммарная длина вылета не соответствует сегментам.');
  if (trueDistance > GEOSCAN_201_PASSPORT.maxRouteM)
    failures.push(
      'Полная длина дуг, а не длина хорд, превышает паспортный маршрут.',
    );
  if (first?.phase === 'takeoff' && first.fixedWing) {
    const start = g.forward(first.from),
      angle = first.fixedWing.headingFromRad,
      length = first.distanceM;
    // Circumscribed 10-degree chords contain the complete +/-30deg launch sector.
    const sector: Point[] = [
      start,
      ...Array.from({ length: 7 }, (_, i): Point => {
        const theta = angle - Math.PI / 6 + (i * Math.PI) / 18,
          r = length / Math.cos(Math.PI / 36);
        return [start[0] + Math.cos(theta) * r, start[1] + Math.sin(theta) * r];
      }),
      start,
    ];
    const hazards = d.restrictions
      .map((r) => ({
        id: r.id,
        geometry: r.geometry,
        height: r.kind === 'noFlight' ? null : r.maxAltitudeM,
      }))
      .concat(
        d.scenario.exclusions.map((geometry, i) => ({
          id: `exclusion-${i}`,
          geometry,
          height: null,
        })),
      );
    for (const hazard of hazards) {
      const polygon = hazard.geometry.coordinates.map((ring) =>
        ring.map(g.forward),
      );
      if (!clipping.intersection([sector], polygon).length) continue;
      const nearest = segmentClearance(start, start, [polygon]);
      if (hazard.height === null || hazard.height > 0.1 * nearest + EPS)
        launchFailures.push(hazard.id);
    }
  }
  if (
    last?.fixedWing?.kind === 'parachute' &&
    d.scenario.wind.speedMps > EPS &&
    angleDifference(last.fixedWing.headingFromRad, landingHeading(d, v)) > 1e-6
  )
    failures.push('Заход перед выпуском парашюта должен быть против ветра.');
  return [
    {
      id: 'FIXED_WING_KINEMATICS',
      status: failures.length ? 'fail' : 'pass',
      title: 'Самолётная траектория и ресурс',
      detail:
        failures.slice(0, 8).join(' ') ||
        `${sortie.vehicleId}: движущийся запуск, касательные дуги, прямые съёмки и снос парашюта проверены; зависания нет.`,
    },
    {
      id: 'FIXED_WING_TUBE',
      status: tubeFailures.length ? 'fail' : 'pass',
      title: 'Полная маневренная трубка',
      detail: tubeFailures.length
        ? `Трубка выходит за свободный коридор: сегменты ${tubeFailures.slice(0, 10).join(', ')}.`
        : 'Проверены целиком капсулы всех прямых и дуг, а не только вершины. Трубка дуги включает полный короткий участок дуги и запас слежения.',
    },
    {
      id: 'FIXED_WING_CLEARANCE',
      status: clearanceFailures.length ? 'fail' : 'pass',
      title: 'Высота 201 над объектами',
      detail:
        clearanceFailures.slice(0, 6).join('; ') ||
        'Крейсерская часть не ниже 100 м над модельной поверхностью; над пересечёнными известными препятствиями проверен запас 100 м (руководство, с. 11).',
    },
    {
      id: 'FIXED_WING_LAUNCH_SECTOR',
      status: launchFailures.length ? 'fail' : 'pass',
      title: 'Сектор запуска 201',
      detail: launchFailures.length
        ? `В секторе ±30° известные объекты выше 0,1L или запреты: ${launchFailures.join(', ')}.`
        : 'В секторе ±30° до конца модельного набора высоты нет заданных препятствий выше 0,1L. Неизвестные предметы, люди и рельеф этим не подтверждаются.',
    },
    {
      id: 'FIXED_WING_CALIBRATION',
      status: 'unknown',
      title: 'Калибровка самолётной модели',
      detail: `${v.fixedWingProfile.source} Ветер постоянный, крен/снижение/трубка не измерены; пригодность реальной катапультной и посадочной площадки не подтверждена автоматически.`,
    },
  ];
}

export function buildFixedWingSortie(
  d: MissionDocument,
  context: FixedWingContext,
  state: { vehicle: Vehicle; position: Point },
  battery: { id: string; pct: number },
  strips: Strip[],
  id: string,
): ScheduledSortie | null {
  const v = state.vehicle,
    p = v.fixedWingProfile,
    g = context.geometry,
    s = context.scenario;
  if (
    v.model !== '201' ||
    v.kind !== 'fixedWing' ||
    !p ||
    !strips.length ||
    s.job.altitudeM < 100 ||
    s.wind.speedMps > Math.min(v.maxWindMps, 12)
  )
    return null;
  const radius = fixedWingTurnRadius(v, s.wind.speedMps);
  if (!Number.isFinite(radius)) return null;
  const segments: Segment[] = [];
  let elapsed = 0;
  const altitude = s.job.altitudeM;
  const add = (
    a: Point,
    b: Point,
    phase: Segment['phase'],
    meta: FixedWingSegmentMetadata,
    h1 = altitude,
    h2 = altitude,
    stripId?: number,
  ) => {
    const seg: Segment = {
      from: g.inverse(a),
      to: g.inverse(b),
      phase,
      altitudeFromM: h1,
      altitudeToM: h2,
      airspeedMps: 0,
      groundSpeedMps: 0,
      distanceM: distance(a, b),
      startSec: elapsed,
      endSec: elapsed,
      batteryFromPct:
        battery.pct - (elapsed / (v.effectiveEnduranceMin * 60)) * 100,
      batteryToPct: 0,
      fixedWing: meta,
      ...(stripId === undefined ? {} : { stripId }),
    };
    const k = fixedWingSegmentKinematics(d, v, seg, g.forward);
    if (k.errors.length || !capsuleInside(a, b, k.tubeRadiusM, g.free))
      throw new Error('Нет допустимой самолётной траектории.');
    seg.endSec += k.durationSec;
    seg.airspeedMps = k.airspeedMps;
    seg.groundSpeedMps = seg.distanceM / k.durationSec;
    elapsed += k.durationSec;
    seg.batteryToPct =
      battery.pct - (elapsed / (v.effectiveEnduranceMin * 60)) * 100;
    if (
      seg.batteryToPct < d.scenario.reservePct - EPS ||
      segments.length >= 2700
    )
      throw new Error('Недостаточно ресурса или превышен предел модели.');
    segments.push(seg);
  };
  try {
    const launchHeading = Math.PI / 2 - (p.launchHeadingDeg * Math.PI) / 180;
    const launchLength =
      (directedSpeed(launchHeading, v, s) * altitude) / v.climbMps;
    const launchEnd: Point = [
      state.position[0] + Math.cos(launchHeading) * launchLength,
      state.position[1] + Math.sin(launchHeading) * launchLength,
    ];
    add(
      state.position,
      launchEnd,
      'takeoff',
      {
        kind: 'straight',
        headingFromRad: launchHeading,
        headingToRad: launchHeading,
        tubeRadiusM: p.trackingToleranceM,
      },
      0,
      altitude,
    );
    let pose: FixedWingPose = { point: launchEnd, headingRad: launchHeading };
    const connect = (target: FixedWingPose, phase: 'transit' | 'return') => {
      const chosen = dubinsCandidates(pose, target, radius).find((path) =>
        path.every((part) =>
          capsuleInside(
            part.from,
            part.to,
            p.trackingToleranceM + (part.center ? part.lengthM : 0),
            g.free,
          ),
        ),
      );
      if (!chosen)
        throw new Error('В коридоре не помещается самолётный разворот.');
      for (const part of chosen)
        add(
          part.from,
          part.to,
          part.center ? 'turn' : phase,
          metadata(part, v, g),
        );
      pose = target;
    };
    for (const strip of strips) {
      const choices = [strip, { id: strip.id, a: strip.b, b: strip.a }]
        .map((line) => ({
          line,
          paths: dubinsCandidates(
            pose,
            { point: line.a, headingRad: heading(line.a, line.b) },
            radius,
          ),
        }))
        .flatMap(({ line, paths }) =>
          paths
            .filter((path) =>
              path.every((part) =>
                capsuleInside(
                  part.from,
                  part.to,
                  p.trackingToleranceM + (part.center ? part.lengthM : 0),
                  g.free,
                ),
              ),
            )
            .map((path) => ({
              line,
              path,
              length: path.reduce((sum, part) => sum + part.lengthM, 0),
            })),
        )
        .sort((a, b) => a.length - b.length);
      if (!choices.length) return null;
      const { line, path } = choices[0];
      for (const part of path)
        add(
          part.from,
          part.to,
          part.center ? 'turn' : 'transit',
          metadata(part, v, g),
        );
      const h = heading(line.a, line.b);
      add(
        line.a,
        line.b,
        'survey',
        {
          kind: 'straight',
          headingFromRad: h,
          headingToRad: h,
          tubeRadiusM: p.trackingToleranceM,
        },
        altitude,
        altitude,
        line.id,
      );
      pose = { point: line.b, headingRad: h };
    }
    const wind = windVector(s),
      landing = g.forward(v.landing),
      descent = p.parachuteReleaseAltitudeM / p.parachuteDescentMps;
    const release: Point = [
      landing[0] - wind[0] * descent,
      landing[1] - wind[1] * descent,
    ];
    connect({ point: release, headingRad: landingHeading(d, v) }, 'return');
    const descentCircle = descendingLoiter(d, v, g, pose, altitude);
    if (!descentCircle) return null;
    for (const step of descentCircle)
      add(
        step.part.from,
        step.part.to,
        'landing',
        metadata(step.part, v, g),
        step.h1,
        step.h2,
      );
    add(
      release,
      landing,
      'landing',
      {
        kind: 'parachute',
        headingFromRad: pose.headingRad,
        headingToRad: pose.headingRad,
        tubeRadiusM: p.trackingToleranceM,
      },
      p.parachuteReleaseAltitudeM,
      0,
    );
  } catch {
    return null;
  }
  const sortie: ScheduledSortie = {
    id,
    jobId: context.job.id,
    batteryId: battery.id,
    ...(context.job.quality.mode === 'camera'
      ? { cameraId: resolveVehicleCamera(v, context.job.job.type).camera?.id }
      : {}),
    vehicleId: v.id,
    name: v.name,
    startSec: 0,
    endSec: elapsed,
    readySec: elapsed + d.planning.serviceSec,
    segments,
    durationSec: elapsed,
    distanceM: segments.reduce((sum, seg) => sum + seg.distanceM, 0),
    remainingPct: segments.at(-1)!.batteryToPct,
    strips: strips.length,
    shots: ['RGB', 'MS', 'IR'].includes(s.job.type)
      ? segments
          .filter((seg) => seg.phase === 'survey')
          .reduce(
            (sum, seg) =>
              sum +
              Math.floor((seg.distanceM + EPS) / s.job.triggerDistanceM) +
              1,
            0,
          )
      : null,
  };
  if (
    qualityForJob(
      context.job,
      {
        ...v,
        airspeedMps: Math.max(
          ...segments
            .filter((seg) => seg.phase === 'survey')
            .map((seg) => seg.groundSpeedMps),
        ),
      },
      d.flightEnvelope,
    ).checks.some((c) => c.status === 'fail')
  )
    return null;
  if (
    validateFixedWingSortie(d, sortie, context).some((c) => c.status === 'fail')
  )
    return null;
  return sortie;
}

/** A planned return starts with the actual airborne heading, not a hovering point.
 * Caller must independently check the returned tube against OTHER aircraft and
 * timed restrictions; null is a fail-closed absence of a return, not permission.
 */
export function buildFixedWingRecoverySegments(
  d: MissionDocument,
  vehicle: Vehicle,
  geometry: Geometry,
  start: {
    coordinate: Coordinate;
    altitudeM: number;
    headingRad: number;
    batteryPct: number;
    timeSec: number;
  },
  landingCoordinate: Coordinate,
): Segment[] | null {
  const p = vehicle.fixedWingProfile;
  if (
    !p ||
    start.altitudeM < 1 ||
    d.scenario.wind.speedMps > vehicle.maxWindMps
  )
    return null;
  const radius = fixedWingTurnRadius(vehicle, d.scenario.wind.speedMps),
    wind = windVector(d.scenario),
    landing = geometry.forward(landingCoordinate),
    descent = p.parachuteReleaseAltitudeM / p.parachuteDescentMps;
  const release: Point = [
    landing[0] - wind[0] * descent,
    landing[1] - wind[1] * descent,
  ];
  const paths = dubinsCandidates(
    { point: geometry.forward(start.coordinate), headingRad: start.headingRad },
    { point: release, headingRad: landingHeading(d, vehicle) },
    radius,
  );
  for (const path of paths) {
    const segments: Segment[] = [];
    let time = start.timeSec,
      battery = start.batteryPct,
      good = true;
    const pieces = path.map((part) => ({
      a: part.from,
      b: part.to,
      phase: 'return' as Segment['phase'],
      meta: metadata(part, vehicle, geometry),
      h1: start.altitudeM,
      h2: start.altitudeM,
    }));
    const finalHeading = path.at(-1)?.headingToRad ?? start.headingRad;
    const descentCircle = descendingLoiter(
      d,
      vehicle,
      geometry,
      { point: release, headingRad: finalHeading },
      start.altitudeM,
    );
    if (!descentCircle) continue;
    for (const step of descentCircle)
      pieces.push({
        a: step.part.from,
        b: step.part.to,
        phase: 'landing',
        meta: metadata(step.part, vehicle, geometry),
        h1: step.h1,
        h2: step.h2,
      });
    pieces.push({
      a: release,
      b: landing,
      phase: 'landing',
      meta: {
        kind: 'parachute',
        headingFromRad: finalHeading,
        headingToRad: finalHeading,
        tubeRadiusM: p.trackingToleranceM,
      },
      h1: p.parachuteReleaseAltitudeM,
      h2: 0,
    });
    for (const piece of pieces) {
      const seg: Segment = {
        from: geometry.inverse(piece.a),
        to: geometry.inverse(piece.b),
        phase: piece.phase,
        altitudeFromM: piece.h1,
        altitudeToM: piece.h2,
        airspeedMps: 0,
        groundSpeedMps: 0,
        distanceM: distance(piece.a, piece.b),
        startSec: time,
        endSec: time,
        batteryFromPct: battery,
        batteryToPct: battery,
        fixedWing: piece.meta,
      };
      const k = fixedWingSegmentKinematics(d, vehicle, seg, geometry.forward);
      if (
        k.errors.length ||
        !capsuleInside(piece.a, piece.b, k.tubeRadiusM, geometry.free)
      ) {
        good = false;
        break;
      }
      seg.endSec += k.durationSec;
      seg.airspeedMps = k.airspeedMps;
      seg.groundSpeedMps = seg.distanceM / k.durationSec;
      seg.batteryToPct -=
        (k.durationSec / (vehicle.effectiveEnduranceMin * 60)) * 100;
      if (seg.batteryToPct < d.scenario.reservePct - EPS) {
        good = false;
        break;
      }
      time = seg.endSec;
      battery = seg.batteryToPct;
      segments.push(seg);
    }
    if (good) return segments;
  }
  return null;
}
