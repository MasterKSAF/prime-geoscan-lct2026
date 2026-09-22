import { z } from 'zod';
import { groundSpeed } from './engine.ts';
import { buildFixedWingRecoverySegments } from './fixed-wing-mission.ts';
import { capsuleInside } from './fixed-wing-dubins.ts';
import { vehiclePlanningEligibility } from './fixed-wing-profile.ts';
import { obstacleFootprints } from './obstacle-layer.ts';
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
  sortiesConflict,
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
  reserve: 'Контроль возвратного запаса',
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
};
type Snapshot = {
  document: MissionDocument;
  candidate: MissionCandidate;
  progressSec: number;
};

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
 * All known height/time restrictions are conservatively treated as full-height permanent footprints.
 * This may reject a possible route but never silently fly above unknown terrain.
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
      const scenario = {
        ...doc.scenario,
        clearanceM: Math.max(doc.scenario.clearanceM, doc.obstacleLayer?.bufferM ?? 0),
        exclusions: [
          ...doc.scenario.exclusions,
          ...doc.restrictions.map((r) => r.geometry),
          ...obstacleFootprints(doc),
        ],
      };
      const g = prepareGeometry(
          scenario,
          doc.planning.safetyPolicy ? doc.scenario.clearanceM : 0,
          doc.planning.safetyPolicy
            ? doc.scenario.area.coordinates[0][0]
            : undefined,
        ),
        route = router(
          prepareGeometry(
            { ...scenario, clearanceM: scenario.clearanceM + 0.25 },
            doc.planning.safetyPolicy ? doc.scenario.clearanceM : 0,
            doc.scenario.area.coordinates[0][0],
          ),
        ),
        volumes = compileRestrictions(doc, g);
      const active = c.sorties.filter(
        (s) =>
          s.startSec <= session.modelTimeSec && s.endSec > session.modelTimeSec,
      );
      if (!active.some((s) => s.vehicleId === session.vehicleId))
        throw new Error('Выбранный аппарат сейчас не в вылете.');
      for (const original of active) {
        const v = doc.scenario.vehicles.find(
          (v) => v.id === original.vehicleId,
        )!;
        if (
          !vehiclePlanningEligibility(v).supported ||
          session.windMps > v.maxWindMps
        )
          throw new Error(
            `${v.name}: ветер или тип аппарата не допускает подтверждённый возврат.`,
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
          pos.altitudeM > doc.flightEnvelope.maxAltitudeM
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
        const targets =
          policy === 'home'
            ? [v.landing]
            : [v.landing, ...doc.scenario.reserveSites];
        const possibilities: ScheduledSortie[] = [];
        if (v.kind === 'fixedWing' && session.delaySec > 0)
          throw new Error(
            `${v.name}: ожидание зависанием невозможно. Требуется немедленный проверенный выход; круг ожидания автоматически не назначается.`,
          );
        for (const target of targets) {
          const path =
            v.kind === 'fixedWing'
              ? []
              : route(g.forward(pos.coordinate), g.forward(target));
          if (!path) continue;
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
              for (let i = 1; i < path.length; i++) {
                const from = g.inverse(path[i - 1]),
                  to = g.inverse(path[i]);
                // Include an initial heading change as well as every corner.
                add(
                  from,
                  from,
                  'turn',
                  v.turnSeconds,
                  pos.altitudeM,
                  pos.altitudeM,
                );
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
                  pos.altitudeM,
                  pos.altitudeM,
                  speed,
                );
              }
              add(
                target,
                target,
                'landing',
                pos.altitudeM / v.descentMps,
                pos.altitudeM,
                0,
              );
            }
            if (
              battery < doc.scenario.reservePct ||
              missionEnvironmentChecks(doc, segments).some(
                (check) => check.status === 'fail',
              ) ||
              clock >
                (Date.parse(doc.window.end) - Date.parse(doc.window.start)) /
                  1000
            )
              continue;
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
                  volumes.some((r) => segmentIntersectsVolume(s, r, g.forward)),
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
          } catch {
            /* This landing site is not feasible in the declared model. */
          }
        }
        possibilities.sort((a, b) => a.endSec - b.endSec);
        const chosen = possibilities.find(
          (p) =>
            !option.sorties.some((other) => sortiesConflict(doc, p, other)),
        );
        if (!chosen)
          throw new Error(
            `${v.name}: нет маршрута с резервом, свободным коридором и разделением группы.`,
          );
        option.sorties.push(chosen);
      }
      // A landed member still occupies its landing site until the whole group is down.
      const groupEnd = Math.max(...option.sorties.map((s) => s.endSec));
      const occupied = option.sorties.map((s) => {
        const last = s.segments.at(-1)!;
        return {
          ...s,
          endSec: groupEnd,
          segments: [
            ...s.segments,
            {
              ...last,
              from: last.to,
              to: last.to,
              startSec: s.endSec,
              endSec: groupEnd,
              altitudeFromM: 0,
              altitudeToM: 0,
              groundSpeedMps: 0,
              airspeedMps: 0,
              distanceM: 0,
              batteryFromPct: last.batteryToPct,
              batteryToPct: last.batteryToPct,
            },
          ],
        };
      });
      for (let i = 0; i < occupied.length; i++)
        for (let j = i + 1; j < occupied.length; j++)
          if (sortiesConflict(doc, occupied[i], occupied[j]))
            throw new Error(
              'Площадки возвращающейся группы конфликтуют после посадки.',
            );
      // Grounded vehicles do not launch; protect their occupied sites during recovery too.
      for (const recovered of option.sorties)
        for (const v of doc.scenario.vehicles.filter(
          (v) => !active.some((s) => s.vehicleId === v.id),
        )) {
          const last = c.sorties
            .filter(
              (s) => s.vehicleId === v.id && s.endSec <= session.modelTimeSec,
            )
            .sort((a, b) => b.endSec - a.endSec)[0];
          const coordinate = last?.segments.at(-1)?.to ?? v.start;
          const base = {
            ...recovered.segments[0],
            from: coordinate,
            to: coordinate,
            startSec: session.modelTimeSec,
            endSec: Math.max(...option.sorties.map((s) => s.endSec)),
            altitudeFromM: 0,
            altitudeToM: 0,
            groundSpeedMps: 0,
            airspeedMps: 0,
            distanceM: 0,
          };
          const stationary = {
            ...recovered,
            vehicleId: v.id,
            jobId: '',
            segments: [base],
            endSec: base.endSec,
          };
          if (sortiesConflict(doc, recovered, stationary))
            throw new Error(
              'Возврат пересекает защитный объём аппарата на земле.',
            );
        }
      option.valid = true;
      option.endSec = Math.max(...option.sorties.map((s) => s.endSec));
      option.minimumPct = Math.min(
        ...option.sorties.map((s) => s.remainingPct),
      );
      option.reasons = [
        'Маршрут, энергия, ветер, ограничения и разделение группы проверены в модели.',
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
  const s: SafetySession = safetySchema.parse({
    id: input.id,
    kind: input.kind,
    vehicleId: input.vehicleId,
    windMps: input.windMps,
    batteryPct: input.batteryPct,
    source: 'simulation',
    modelTimeSec: row.progressSec,
    detectedAt: now.toISOString(),
    stage: 'pending',
    delaySec: 60,
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
          : 'Автоматический маршрут не подтверждён. Нужен оператор; тренажёр остановлен.',
    });
  }
  s.policy = options.find((o) => o.valid)?.policy ?? 'home';
  return s;
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
    batteryPct: 100,
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
    const sorties = c.sorties.filter((s) => s.jobId === j.id);
    return !sorties.length || sorties.some((s) => s.endSec > time);
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
