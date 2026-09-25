import { z } from 'zod';
import { trackAltitudeAllowed, trackAltitudeCheck } from './altitude-policy.ts';
import { groundSpeed } from './engine.ts';
import { buildFixedWingRecoverySegments } from './fixed-wing-mission.ts';
import { capsuleInside } from './fixed-wing-dubins.ts';
import { vehiclePlanningEligibility } from './fixed-wing-profile.ts';
import { obstacleFootprints } from './obstacle-layer.ts';
import { restrictionsInEnvelope } from './mission-catalog.ts';
import { jobSurveySegments } from './mission-sortie-jobs.ts';
import { dispatchRecovery } from './mission-recovery-dispatch.ts';
import type { RecoveryDispatch } from './mission-recovery-dispatch.ts';
import {
  distance,
  prepareGeometry,
  projection,
  router,
  segmentInside,
} from './geometry.ts';
import {
  compileRestrictions,
  positionAt,
  segmentIntersectsVolume,
  missionEnvironmentChecks,
} from './mission-validation.ts';
import type {
  MissionCandidate,
  MissionDocument,
  ScheduledSortie,
} from './mission-schema.ts';
import type { Coordinate, Plan, Polygon, Segment } from './schema.ts';

export const incidentLabels = {
  obstacle: 'Препятствие впереди',
  deviation: 'Отклонение от маршрута',
  wind: 'Усиление ветра',
  battery: 'Падение заряда',
  sensor: 'Отказ сенсора',
  crash: 'Потеря способности лететь',
  reserve: 'Проверка безопасного возврата',
} as const;
export type IncidentKind = keyof typeof incidentLabels;
export const safetySchema = z
  .object({
    id: z.uuid(),
    source: z.literal('simulation'),
    kind: z.enum([
      'obstacle',
      'deviation',
      'wind',
      'battery',
      'sensor',
      'crash',
      'reserve',
    ]),
    vehicleId: z.string().min(1).max(30),
    modelTimeSec: z.number().nonnegative(),
    detectedAt: z.iso.datetime(),
    windMps: z.number().min(0).max(30),
    batteryPct: z.number().min(0).max(100),
    stage: z.enum(['pending', 'returning', 'landed', 'blocked', 'crashed']),
    delaySec: z.union([z.literal(0), z.literal(60)]),
    policy: z.enum(['home', 'nearest']),
    progressSec: z.number().nonnegative(),
    decision: z.enum(['none', 'operator', 'timeout', 'immediate']),
    events: z
      .array(
        z
          .object({ at: z.iso.datetime(), text: z.string().min(1).max(400) })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export type SafetySession = z.infer<typeof safetySchema>;
export type RecoveryOption = {
  policy: 'home' | 'nearest';
  label: string;
  valid: boolean;
  reasons: string[];
  sorties: ScheduledSortie[];
  endSec: number;
  minimumPct: number;
  diagnostics?: RecoveryDispatch;
};
type Snapshot = {
  document: MissionDocument;
  candidate: MissionCandidate;
  progressSec: number;
};

// Cache only exact geometric inputs, never decisions, weather, battery or safety flags.
// Re-reading an identical KML must not rebuild the visibility graph on every animation tick.
const geometryCache: {
  key: string;
  source: string;
  value: ReturnType<typeof buildRecoveryGeometry>;
}[] = [];
function buildRecoveryGeometry(doc: MissionDocument, startSec: number) {
  const scenario = {
    ...doc.scenario,
    clearanceM: Math.max(
      doc.scenario.clearanceM,
      doc.obstacleLayer?.bufferM ?? 0,
    ),
    exclusions: [
      ...doc.scenario.exclusions,
      ...restrictionsInEnvelope(
        doc,
        0,
        doc.flightEnvelope.maxAltitudeM,
        startSec,
        Infinity,
      ).map((r) => r.geometry),
      ...obstacleFootprints(doc),
    ],
  };
  const g = prepareGeometry(
    scenario,
    doc.planning.safetyPolicy ? doc.scenario.clearanceM : 0,
    doc.planning.safetyPolicy ? doc.scenario.area.coordinates[0][0] : undefined,
  );
  const route = router(
    prepareGeometry(
      { ...scenario, clearanceM: scenario.clearanceM + 0.25 },
      doc.planning.safetyPolicy ? doc.scenario.clearanceM : 0,
      doc.scenario.area.coordinates[0][0],
    ),
  );
  return { g, route };
}
function recoveryGeometry(doc: MissionDocument, startSec: number) {
  const s = doc.scenario;
  const source = doc.obstacleLayer?.sourceText ?? '';
  const key = JSON.stringify([
    s.area,
    s.airspace,
    s.exclusions,
    s.reserveSites,
    s.vehicles.map((v) => [v.start, v.landing]),
    s.clearanceM,
    restrictionsInEnvelope(
      doc,
      0,
      doc.flightEnvelope.maxAltitudeM,
      startSec,
      Infinity,
    ).map((r) => r.geometry),
    doc.planning.safetyPolicy,
    doc.obstacleLayer?.bufferM,
    doc.obstacleLayer?.lineHalfWidthM,
  ]);
  const found = geometryCache.find((x) => x.key === key && x.source === source);
  if (found) return found.value;
  const value = buildRecoveryGeometry(doc, startSec);
  if (geometryCache.length >= 4) geometryCache.shift();
  geometryCache.push({ key, source, value });
  return value;
}

export function safetyDocument(
  d: MissionDocument,
  c: MissionCandidate,
  session: SafetySession,
): MissionDocument {
  const next = structuredClone(d);
  next.scenario.wind.speedMps = session.windMps;
  // A simulated sensor observation becomes a concrete known contour, never a claim of a real sensor/DEM.
  if (session.kind === 'obstacle') {
    const sortie = c.sorties.find(
      (s) =>
        s.vehicleId === session.vehicleId &&
        s.startSec <= session.modelTimeSec &&
        s.endSec > session.modelTimeSec,
    );
    const seg = sortie?.segments.find(
      (s) =>
        s.startSec <= session.modelTimeSec && s.endSec > session.modelTimeSec,
    );
    if (seg) {
      const pos = positionAt(seg, session.modelTimeSec),
        p = projection(pos.coordinate);
      const vector = p.forward(seg.to),
        len = Math.hypot(...vector);
      const x = len > 1 ? (vector[0] / len) * 100 : 100,
        y = len > 1 ? (vector[1] / len) * 100 : 0;
      const geometry: Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [x - 12, y - 12],
            [x + 12, y - 12],
            [x + 12, y + 12],
            [x - 12, y + 12],
            [x - 12, y - 12],
          ].map((v) => p.inverse(v as Coordinate)),
        ],
      };
      next.restrictions.push({
        id: `incident-${session.id}`,
        name: 'Модельное препятствие',
        kind: 'obstacle',
        geometry,
        minAltitudeM: 0,
        maxAltitudeM: 6000,
        startAt: null,
        endAt: null,
        source: 'Событие тренажёра; не данные настоящего датчика.',
      });
    }
  }
  return next;
}

/** Independent recovery validator. No coverage claim and no mutation of the approved candidate.
 * Broad-phase routing avoids volumes that can intersect the return's altitude/time envelope.
 * The independent 4D validator still checks every resulting segment, including descent.
 */
export function recoveryOptions(
  d: MissionDocument,
  c: MissionCandidate,
  session: SafetySession,
): RecoveryOption[] {
  const empty = (
    policy: 'home' | 'nearest',
    reasons: string[],
  ): RecoveryOption => ({
    policy,
    label:
      policy === 'home'
        ? 'Вернуться на свои базы'
        : 'Ближайшие доступные площадки',
    valid: false,
    reasons,
    sorties: [],
    endSec: session.modelTimeSec,
    minimumPct: 0,
  });
  if (session.kind === 'crash')
    return [
      empty('home', ['Аппарат утратил способность лететь. Возврат запрещён.']),
      empty('nearest', ['Нужны действия оператора и осмотр места.']),
    ];
  const doc = safetyDocument(d, c, session);
  return (['home', 'nearest'] as const).map((policy) => {
    const option = empty(policy, []);
    try {
      if (doc.terrainModel.kind !== 'flat')
        throw new Error(
          'Рельеф неизвестен: автоматический возврат не подтверждён.',
        );
      const { g, route } = recoveryGeometry(doc, session.modelTimeSec);
      const volumes = compileRestrictions(doc, g);
      const active = c.sorties.filter(
        (s) =>
          s.startSec <= session.modelTimeSec && s.endSec > session.modelTimeSec,
      );
      if (!active.some((s) => s.vehicleId === session.vehicleId))
        throw new Error('Выбранный аппарат сейчас не в вылете.');
      const pools: {
        vehicleId: string;
        batteryPct: number;
        routes: ScheduledSortie[];
      }[] = [];
      for (const original of active) {
        const v = doc.scenario.vehicles.find(
          (v) => v.id === original.vehicleId,
        )!;
        if (!vehiclePlanningEligibility(v).supported)
          throw new Error(
            `${v.name}: профиль аппарата не поддерживает расчёт возврата.`,
          );
        if (session.windMps > v.maxWindMps)
          throw new Error(
            `${v.name}: ветер ${session.windMps} м/с превышает предел ${v.maxWindMps} м/с. Безопасный возврат рассчитать нельзя.`,
          );
        const seg = original.segments.find(
          (s) =>
            s.startSec <= session.modelTimeSec &&
            s.endSec > session.modelTimeSec,
        )!;
        const pos = positionAt(seg, session.modelTimeSec);
        if (seg.fixedWing?.kind === 'parachute')
          throw new Error(
            `${v.name}: парашют уже раскрыт; повторный двигательный возврат невозможен. Контролируйте завершение снижения и место посадки.`,
          );
        if (v.id === session.vehicleId && session.kind === 'deviation') {
          const p = projection(pos.coordinate);
          pos.coordinate = p.inverse([40, 0]);
        }
        if (v.id === session.vehicleId && session.kind === 'battery')
          pos.batteryPct = Math.min(pos.batteryPct, session.batteryPct);
        if (
          pos.altitudeM <= 0 ||
          pos.altitudeM > doc.flightEnvelope.maxAltitudeM ||
          !trackAltitudeAllowed(pos.altitudeM)
        )
          throw new Error(
            'Текущая высота вне поддержанного диапазона возврата.',
          );
        if (
          doc.environment?.cloudBaseM != null &&
          pos.altitudeM + doc.environment.cloudClearanceM >
            doc.environment.cloudBaseM
        )
          throw new Error('Нет подтверждённого зазора до облаков.');
        if (
          doc.environment?.visibilityM != null &&
          doc.environment.minVisibilityM != null &&
          doc.environment.visibilityM < doc.environment.minVisibilityM
        )
          throw new Error('Видимость ниже ограничения миссии.');
        const samePoint = (a: Coordinate, b: Coordinate) =>
          a[0] === b[0] && a[1] === b[1];
        const homeBase = doc.bases?.find(
          (b) =>
            samePoint(b.coordinate, v.landing) ||
            b.landingPads?.some((p) => samePoint(p.coordinate, v.landing)),
        );
        const declaredPads = (
          policy === 'home' ? (homeBase ? [homeBase] : []) : (doc.bases ?? [])
        ).flatMap((b) =>
          (b.landingPads ?? [])
            .filter((p) => p.enabled && p.kinds.includes(v.kind))
            .map((p) => p.coordinate),
        );
        const permitted = (point: Coordinate) =>
          !(doc.bases ?? []).some(
            (b) =>
              (b.landingPads &&
                samePoint(b.coordinate, point) &&
                !b.landingPads.some((p) => samePoint(p.coordinate, point))) ||
              b.landingPads?.some(
                (p) =>
                  samePoint(p.coordinate, point) &&
                  (!p.enabled || !p.kinds.includes(v.kind)),
              ),
          );
        const targets = (
          policy === 'home'
            ? homeBase?.landingPads
              ? declaredPads
              : [v.landing]
            : [
                ...declaredPads,
                v.landing,
                ...doc.scenario.reserveSites,
                // Explicitly known compatible landing sites, never invented offsets.
                ...doc.scenario.vehicles
                  .filter((other) => other.kind === v.kind)
                  .map((other) => other.landing),
              ]
        )
          .filter(permitted)
          .filter((p, i, all) => all.findIndex((q) => samePoint(p, q)) === i);
        const possibilities: ScheduledSortie[] = [];
        const rejectionReasons = new Set<string>();
        if (v.kind === 'fixedWing' && session.delaySec > 0)
          throw new Error(
            `${v.name}: ожидание зависанием невозможно. Требуется немедленный проверенный выход; круг ожидания автоматически не назначается.`,
          );
        const nominalHeight = Math.min(
          doc.flightEnvelope.maxAltitudeM,
          Math.max(
            pos.altitudeM,
            ...original.segments.map((s) => s.altitudeToM),
          ),
        );
        const levels =
          v.kind === 'fixedWing'
            ? [pos.altitudeM]
            : [
                ...new Set([
                  pos.altitudeM,
                  nominalHeight,
                  Math.min(
                    doc.flightEnvelope.maxAltitudeM,
                    nominalHeight +
                      doc.planning.separationVerticalM +
                      2 * v.climbMps * doc.planning.temporalBufferSec +
                      1,
                  ),
                ]),
              ];
        const waits = v.kind === 'fixedWing' ? [0] : [0, 15, 30, 60, 120];
        for (const target of targets) {
          const path =
            v.kind === 'fixedWing'
              ? []
              : route(g.forward(pos.coordinate), g.forward(target));
          if (!path) {
            rejectionReasons.add('нет свободного обхода препятствий');
            continue;
          }
          for (const height of levels)
            for (const queueSec of waits)
              try {
                const segments: Segment[] = [];
                let clock = session.modelTimeSec,
                  battery = pos.batteryPct;
                const add = (
                  from: Coordinate,
                  to: Coordinate,
                  phase: Segment['phase'],
                  sec: number,
                  a: number,
                  b: number,
                  speed = 0,
                ) => {
                  if (sec <= 0) return;
                  const after =
                    battery - (sec / (v.effectiveEnduranceMin * 60)) * 100;
                  segments.push({
                    from,
                    to,
                    phase,
                    startSec: clock,
                    endSec: clock + sec,
                    altitudeFromM: a,
                    altitudeToM: b,
                    batteryFromPct: battery,
                    batteryToPct: after,
                    distanceM: distance(g.forward(from), g.forward(to)),
                    airspeedMps: speed ? v.airspeedMps : 0,
                    groundSpeedMps: speed,
                  });
                  clock += sec;
                  battery = after;
                };
                if (v.kind === 'fixedWing') {
                  const meta = seg.fixedWing;
                  if (!meta) continue;
                  const fraction = Math.max(
                    0,
                    Math.min(
                      1,
                      (session.modelTimeSec - seg.startSec) /
                        Math.max(1e-9, seg.endSec - seg.startSec),
                    ),
                  );
                  const recovered = buildFixedWingRecoverySegments(
                    doc,
                    v,
                    g,
                    {
                      coordinate: pos.coordinate,
                      altitudeM: pos.altitudeM,
                      headingRad:
                        meta.headingFromRad + (meta.sweepRad ?? 0) * fraction,
                      batteryPct: pos.batteryPct,
                      timeSec: session.modelTimeSec,
                    },
                    target,
                  );
                  if (!recovered?.length) continue;
                  segments.push(...recovered);
                  clock = recovered.at(-1)!.endSec;
                  battery = recovered.at(-1)!.batteryToPct;
                } else {
                  add(
                    pos.coordinate,
                    pos.coordinate,
                    'turn',
                    session.delaySec,
                    pos.altitudeM,
                    pos.altitudeM,
                  );
                  // Climb vertically in the current checked position before horizontal
                  // escape. A low aircraft on takeoff must not fly through parked UAVs.
                  if (height > pos.altitudeM)
                    add(
                      pos.coordinate,
                      pos.coordinate,
                      'takeoff',
                      (height - pos.altitudeM) / v.climbMps,
                      pos.altitudeM,
                      height,
                    );
                  add(
                    pos.coordinate,
                    pos.coordinate,
                    'turn',
                    queueSec,
                    height,
                    height,
                  );
                  for (let i = 1; i < path.length; i++) {
                    const from = g.inverse(path[i - 1]),
                      to = g.inverse(path[i]);
                    // Include an initial heading change as well as every corner.
                    add(from, from, 'turn', v.turnSeconds, height, height);
                    const speed = groundSpeed(
                      path[i - 1],
                      path[i],
                      v.airspeedMps,
                      doc.scenario.wind,
                    );
                    add(
                      from,
                      to,
                      'return',
                      distance(path[i - 1], path[i]) / speed,
                      height,
                      height,
                      speed,
                    );
                  }
                  add(
                    target,
                    target,
                    'landing',
                    height / v.descentMps,
                    height,
                    0,
                  );
                }
                if (
                  battery < doc.scenario.reservePct ||
                  trackAltitudeCheck([], segments).status !== 'pass' ||
                  missionEnvironmentChecks(doc, segments).some(
                    (check) => check.status === 'fail',
                  ) ||
                  clock >
                    (Date.parse(doc.window.end) -
                      Date.parse(doc.window.start)) /
                      1000
                ) {
                  rejectionReasons.add(
                    `не хватает заряда на возврат с резервом ${doc.scenario.reservePct}% либо нарушено окно/погода`,
                  );
                  continue;
                }
                if (
                  segments.some(
                    (s) =>
                      !(s.fixedWing
                        ? capsuleInside(
                            g.forward(s.from),
                            g.forward(s.to),
                            s.fixedWing.tubeRadiusM,
                            g.free,
                          )
                        : segmentInside(
                            g.forward(s.from),
                            g.forward(s.to),
                            g.free,
                          )) ||
                      volumes.some((r) =>
                        segmentIntersectsVolume(s, r, g.forward),
                      ),
                  )
                )
                  continue;
                possibilities.push({
                  ...original,
                  id: `recovery-${original.id}`,
                  startSec: session.modelTimeSec,
                  endSec: clock,
                  readySec: clock + doc.planning.serviceSec,
                  segments,
                  durationSec: clock - session.modelTimeSec,
                  distanceM: segments.reduce((a, s) => a + s.distanceM, 0),
                  remainingPct: battery,
                  strips: 0,
                  shots: null,
                });
              } catch (error) {
                rejectionReasons.add(
                  error instanceof Error
                    ? error.message
                    : 'площадка недоступна',
                );
              }
        }
        possibilities.sort((a, b) => a.endSec - b.endSec);
        if (!possibilities.length)
          throw new Error(
            `${v.name}: ${[...rejectionReasons].slice(0, 2).join('; ') || 'нет свободного маршрута до площадки'}.`,
          );
        pools.push({
          vehicleId: v.id,
          batteryPct: pos.batteryPct,
          routes: possibilities,
        });
      }
      const parked = doc.scenario.vehicles
        .filter((v) => !active.some((s) => s.vehicleId === v.id))
        .map((v) => {
          const last = c.sorties
            .filter(
              (s) => s.vehicleId === v.id && s.endSec <= session.modelTimeSec,
            )
            .sort((a, b) => b.endSec - a.endSec)[0];
          const coordinate = last?.segments.at(-1)?.to ?? v.start;
          return { vehicleId: v.id, coordinate };
        });
      const dispatch = dispatchRecovery(
        doc,
        pools,
        parked,
        session.modelTimeSec,
      );
      option.diagnostics = dispatch.diagnostics;
      option.sorties = dispatch.sorties;
      if (!option.sorties.length) {
        const hit = dispatch.diagnostics.conflicts.at(0);
        const name = (id: string) =>
          doc.scenario.vehicles.find((v) => v.id === id)?.name ?? id;
        throw new Error(
          hit
            ? `${name(hit.vehicleId)} и ${name(hit.otherVehicleId)}: ${hit.kind === 'occupied-pad' ? 'занята посадочная площадка или путь проходит близко к БВС на земле' : 'пересекаются защитные интервалы возврата'}. Безопасная очередность в пределах поиска не найдена.`
            : 'Безопасная очередность возврата в пределах поиска не найдена.',
        );
      }
      option.valid = true;
      option.endSec = Math.max(...option.sorties.map((s) => s.endSec));
      option.minimumPct = Math.min(
        ...option.sorties.map((s) => s.remainingPct),
      );
      option.reasons = [
        'Маршруты, очередь возврата, набор высоты, заряд и занятость площадок проверены в модели.',
        ...(active.some(
          (s) =>
            doc.scenario.vehicles.find((v) => v.id === s.vehicleId)?.kind ===
            'fixedWing',
        )
          ? [
              'Самолётный выход построен из модельного положения и курса с защитной трубкой; это не измеренная телеметрия и не команда настоящему автопилоту.',
            ]
          : []),
      ];
    } catch (e) {
      option.valid = false;
      option.sorties = [];
      option.reasons = [
        e instanceof Error ? e.message : 'Проверка возврата не выполнена.',
      ];
    }
    return option;
  });
}

export function createSafetySession(
  row: Snapshot,
  input: {
    id: string;
    kind: IncidentKind;
    vehicleId: string;
    windMps: number;
    batteryPct: number;
  },
  now: Date,
): SafetySession {
  const observed = recoverySnapshot(
    row.document,
    row.candidate,
    row.progressSec,
  ).find((v) => v.vehicleId === input.vehicleId);
  const batteryPct = observed
    ? input.kind === 'battery'
      ? Math.min(observed.batteryPct, input.batteryPct)
      : observed.batteryPct
    : input.batteryPct;
  const s: SafetySession = safetySchema.parse({
    id: input.id,
    kind: input.kind,
    vehicleId: input.vehicleId,
    windMps: input.windMps,
    batteryPct,
    source: 'simulation',
    modelTimeSec: row.progressSec,
    detectedAt: now.toISOString(),
    stage: 'pending',
    delaySec: ['wind', 'battery', 'reserve'].includes(input.kind) ? 0 : 60,
    policy: 'home',
    progressSec: row.progressSec,
    decision: 'none',
    events: [
      {
        at: now.toISOString(),
        text: `${incidentLabels[input.kind]}. Основной план остановлен; источник — тренажёр.`,
      },
    ],
  });
  if (s.kind === 'crash') {
    s.stage = 'crashed';
    s.delaySec = 0;
    s.decision = 'immediate';
    return s;
  }
  let options = recoveryOptions(row.document, row.candidate, s);
  if (s.delaySec === 0 && options.some((o) => o.valid)) {
    s.stage = 'returning';
    s.decision = 'immediate';
    s.events.push({
      at: now.toISOString(),
      text: 'Условия изменились: проверенный возврат начинается немедленно.',
    });
  }
  if (!options.some((o) => o.valid)) {
    s.delaySec = 0;
    options = recoveryOptions(row.document, row.candidate, s);
    s.decision = 'immediate';
    s.stage = options.some((o) => o.valid) ? 'returning' : 'blocked';
    s.events.push({
      at: now.toISOString(),
      text:
        s.stage === 'returning'
          ? 'Ожидание недопустимо. Защитный возврат принят немедленно.'
          : 'Безопасный маршрут возврата не найден. Нужен оператор; тренажёр остановлен.',
    });
  }
  s.policy = options.find((o) => o.valid)?.policy ?? 'home';
  return s;
}

/** Complete fleet at the incident time, including future/unassigned/landed UAVs. */
export function recoverySnapshot(
  d: MissionDocument,
  c: MissionCandidate,
  time: number,
) {
  return d.scenario.vehicles.map((v) => {
    const flights = c.sorties.filter((s) => s.vehicleId === v.id);
    const active = flights.find((s) => s.startSec <= time && s.endSec > time);
    const segment = active?.segments.find(
      (s) => s.startSec <= time && s.endSec > time,
    );
    const last = flights
      .filter((s) => s.endSec <= time)
      .sort((a, b) => b.endSec - a.endSec)[0];
    const pos = segment
      ? positionAt(segment, time)
      : {
          coordinate: last?.segments.at(-1)?.to ?? v.start,
          altitudeM: 0,
          batteryPct: last?.remainingPct ?? v.batteryPct,
        };
    return {
      vehicleId: v.id,
      name: v.name,
      model: v.model,
      kind: v.kind,
      phase: segment?.phase ?? 'ground',
      ...pos,
      airborne: pos.altitudeM > 0,
      sortieId: active?.id ?? null,
      landing: v.landing,
      source: 'simulation' as const,
    };
  });
}

/** Periodic monitor: the declared model only, never a measurement from a UAV.
 * Warn while a 60-second protective decision/hold margin can still be preserved.
 */
export function returnReserveAlert(
  d: MissionDocument,
  c: MissionCandidate,
  time: number,
): string | null {
  const s = c.sorties.find(
    (s) =>
      s.startSec <= time &&
      s.endSec > time &&
      s.segments.some(
        (x) =>
          x.startSec <= time &&
          x.endSec > time &&
          ['survey', 'transit'].includes(x.phase),
      ),
  );
  if (!s) return null;
  const session: SafetySession = {
    id: '00000000-0000-4000-8000-000000000001',
    source: 'simulation',
    kind: 'reserve',
    vehicleId: s.vehicleId,
    modelTimeSec: time,
    detectedAt: '2026-01-01T00:00:00.000Z',
    windMps: d.scenario.wind.speedMps,
    batteryPct: recoverySnapshot(d, c, time).find(
      (v) => v.vehicleId === s.vehicleId,
    )!.batteryPct,
    stage: 'pending',
    delaySec: c.sorties.some(
      (x) =>
        x.startSec <= time &&
        x.endSec > time &&
        d.scenario.vehicles.find((v) => v.id === x.vehicleId)?.kind ===
          'fixedWing',
    )
      ? 0
      : 60,
    policy: 'home',
    progressSec: time,
    decision: 'none',
    events: [
      { at: '2026-01-01T00:00:00.000Z', text: 'Периодическая проверка' },
    ],
  };
  return recoveryOptions(d, c, session).some((o) => o.valid)
    ? null
    : s.vehicleId;
}

export function decideSafety(
  row: Snapshot,
  s: SafetySession,
  policy: SafetySession['policy'],
  reason: 'operator' | 'timeout',
  now: Date,
): SafetySession {
  if (s.stage !== 'pending') throw new Error('Решение уже принято.');
  if (reason === 'timeout' && now.getTime() < Date.parse(s.detectedAt) + 60_000)
    throw new Error('Время ожидания ещё не истекло.');
  const option = recoveryOptions(row.document, row.candidate, s).find(
    (o) => o.policy === policy,
  );
  if (!option?.valid)
    throw new Error('Выбранный возврат не прошёл повторную проверку.');
  return {
    ...s,
    stage: 'returning',
    policy,
    decision: reason,
    events: [
      ...s.events,
      {
        at: now.toISOString(),
        text: `${reason === 'timeout' ? 'Таймер 60 с' : 'Оператор'}: ${option.label}. Полная минута ожидания включена в модельный расход.`,
      },
    ],
  };
}

/** Display projection only. Approval/evidence still reference the original plan. */
export function safetyMapPlan(
  base: Plan,
  option: RecoveryOption | null,
  s: SafetySession,
): Plan {
  return {
    ...base,
    missions: base.missions.map((m) => {
      const recovery = option?.valid
        ? option.sorties.find((r) => r.vehicleId === m.vehicleId)
        : null;
      if (recovery)
        return {
          ...m,
          segments: recovery.segments,
          durationSec: recovery.endSec,
          remainingPct: recovery.remainingPct,
        };
      const segment =
        m.segments.find(
          (x) => x.startSec <= s.modelTimeSec && x.endSec > s.modelTimeSec,
        ) ??
        m.segments.filter((x) => x.endSec <= s.modelTimeSec).at(-1) ??
        m.segments[0];
      if (!segment) return m;
      const pos = positionAt(segment, s.modelTimeSec);
      return {
        ...m,
        segments: [
          {
            ...segment,
            from: pos.coordinate,
            to: pos.coordinate,
            altitudeFromM: pos.altitudeM,
            altitudeToM: pos.altitudeM,
            startSec: s.modelTimeSec,
            endSec: s.modelTimeSec + 86400,
            batteryFromPct: pos.batteryPct,
            batteryToPct: pos.batteryPct,
            groundSpeedMps: 0,
            distanceM: 0,
          },
        ],
      };
    }),
  };
}

export function unfinishedRevision(
  d: MissionDocument,
  c: MissionCandidate,
  time: number,
  newId: string,
  incident?: SafetySession,
): MissionDocument {
  const next = incident ? safetyDocument(d, c, incident) : structuredClone(d);
  next.id = newId;
  next.name = `${d.name.slice(0, 70)} · пересмотр`;
  // Whole-job conservative accounting: repeat incomplete jobs, never invent exact remaining coverage.
  next.jobs = next.jobs.filter((j) => {
    const segments = jobSurveySegments(c.sorties, j.id);
    return !segments.length || segments.some((s) => s.endSec > time);
  });
  if (!next.jobs.length) next.jobs = structuredClone(d.jobs);
  if (incident?.kind === 'crash') {
    next.scenario.vehicles = next.scenario.vehicles.map((v) => ({
      ...v,
      enabled: v.id === incident.vehicleId ? false : v.enabled,
    }));
    next.jobs = next.jobs.map((j) => ({
      ...j,
      assignedVehicleIds: j.assignedVehicleIds.filter(
        (id) => id !== incident.vehicleId,
      ),
    }));
  }
  next.notes =
    `Пересмотр миссии ${d.id}. Незавершённые работы повторяются целиком; точное вычитание снятых полос не выполнено. До запуска уточнить базы, заряд, доступность и временное окно. ${d.notes}`.slice(
      0,
      2000,
    );
  return next;
}
