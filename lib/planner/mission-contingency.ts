import { groundSpeed } from './engine.ts';
import { missionAnalysisCandidateSchema } from './mission-robustness.ts';
import {
  distance,
  inside,
  prepareGeometry,
  router,
  segmentInside,
} from './geometry.ts';
import {
  compileRestrictions,
  groundSeparationConflicts,
  missionEnvironmentChecks,
  positionAt,
  segmentIntersectsVolume,
  sortiesConflict,
  validateExportedCandidate,
} from './mission-validation.ts';
import { parseMissionDocument, sha256 } from './mission-schema.ts';
import type {
  MissionCandidate,
  MissionDocument,
  ScheduledSortie,
} from './mission-schema.ts';
import type { Coordinate, Segment, Vehicle } from './schema.ts';

export type ContingencyAnchor = {
  sortieId: string;
  vehicleId: string;
  segmentIndex: number;
  intervalStartSec: number;
  anchorSec: number;
  responseDelaySec: number;
  coordinate: Coordinate;
  altitudeM: number;
  batteryPct: number;
  status: 'certified_model' | 'not_certified';
  mode: 'independent-escape' | 'planned-corridor-sensing-off' | null;
  landing: Coordinate | null;
  landingSec: number | null;
  remainingPct: number | null;
  route: Segment[];
  reasons: string[];
};
export type MissionContingencyCertificate = {
  protocol: 'controlled-abort-interval-v1';
  limits: { maxIntervalSec: number; maxAnchors: number; maxComputeMs: number };
  inputHash: string;
  candidateHash: string;
  status: 'certified_model' | 'not_certified';
  anchorCount: number;
  checkedAnchors: number;
  certifiedAnchors: number;
  independentAnchors: number;
  plannedCorridorAnchors: number;
  maxResponseDelaySec: number;
  minimumRemainingPct: number | null;
  computationMs: number;
  budgetExceeded: boolean;
  anchors: ContingencyAnchor[];
  reasons: string[];
  assumptions: string[];
};

const ASSUMPTIONS = [
  'Сертификат только для управляемого прекращения одной работы: БВС исправен, ветер/коридор/батарея соответствуют исходной модели. Падение, внезапная потеря заряда, новый объект на остатке пути или усиление ветра этим сертификатом не покрываются.',
  'Из любого момента проверенного интервала БВС прекращает съёмку, завершает оставшуюся часть того же движения и приходит в опорную точку в исходное время с тем же модельным зарядом. Затем выполняет проверенный уход. Это интервальное доказательство под указанными допущениями, не выборочная проверка только кадров симуляции.',
  'Другие БВС продолжают исходное расписание. Все последующие вылеты прекращающего работу БВС отменяются; после его посадки площадка остаётся занятой до окончания остальных полётов. Одновременный отказ группы требует отдельного перерасчёта.',
  'Если короткий отдельный уход не найден, допускается исходный проверенный коридор до посадки с выключенной съёмкой. Режим указан отдельно: он не обещает немедленную посадку и не является независимым аварийным маршрутом. Самолётные дуги/фазы не разрезаются: задержка до их концов может превышать заданный шаг и показывается фактически.',
  'Число/расположение запасных площадок задаёт оператор. Не найденный путь не доказывает невозможность: рассматривается ограниченный набор маршрутов без ожиданий и изменения высоты, рельеф только явно плоский.',
  'Все известные ограничения консервативно закрываются на всю высоту и время ухода; это может отказать в допустимом облёте сверху или после открытия зоны. Геометрия возврата не является командой автопилоту, разрешением полёта или гарантией физической надёжности.',
];

const uniqueTargets = (d: MissionDocument, v: Vehicle) =>
  [v.landing, ...d.scenario.reserveSites].filter(
    (p, i, points) =>
      points.findIndex((other) => other[0] === p[0] && other[1] === p[1]) === i,
  );

/** No original timestamp, sensor assignment, charge or route is modified. */
export async function certifyMissionContingencies(
  input: MissionDocument,
  originalCandidate: MissionCandidate,
  options: {
    maxIntervalSec?: number;
    maxAnchors?: number;
    maxComputeMs?: number;
  } = {},
): Promise<MissionContingencyCertificate> {
  const began = performance.now(),
    d = parseMissionDocument(input),
    candidate = structuredClone(originalCandidate),
    maxIntervalSec = options.maxIntervalSec ?? 30,
    maxAnchors = options.maxAnchors ?? 512,
    maxComputeMs = options.maxComputeMs ?? 3000;
  if (
    !Number.isFinite(maxIntervalSec) ||
    maxIntervalSec < 1 ||
    maxIntervalSec > 60 ||
    !Number.isInteger(maxAnchors) ||
    maxAnchors < 1 ||
    maxAnchors > 2048 ||
    !Number.isFinite(maxComputeMs) ||
    maxComputeMs < 1 ||
    maxComputeMs > 30000
  )
    throw new Error('Недопустимый предел предполётной проверки ухода.');
  const result: MissionContingencyCertificate = {
    protocol: 'controlled-abort-interval-v1',
    limits: { maxIntervalSec, maxAnchors, maxComputeMs },
    inputHash: await sha256(d),
    candidateHash: await sha256(candidate),
    status: 'not_certified',
    anchorCount: 0,
    checkedAnchors: 0,
    certifiedAnchors: 0,
    independentAnchors: 0,
    plannedCorridorAnchors: 0,
    maxResponseDelaySec: 0,
    minimumRemainingPct: null,
    computationMs: 0,
    budgetExceeded: false,
    anchors: [],
    reasons: [],
    assumptions: [...ASSUMPTIONS],
  };
  const finish = () => {
    result.checkedAnchors = result.anchors.length;
    result.certifiedAnchors = result.anchors.filter(
      (a) => a.status === 'certified_model',
    ).length;
    result.independentAnchors = result.anchors.filter(
      (a) => a.mode === 'independent-escape',
    ).length;
    result.plannedCorridorAnchors = result.anchors.filter(
      (a) => a.mode === 'planned-corridor-sensing-off',
    ).length;
    result.maxResponseDelaySec = Math.max(
      0,
      ...result.anchors.map((a) => a.responseDelaySec),
    );
    const remaining = result.anchors.flatMap((a) =>
      a.remainingPct === null ? [] : [a.remainingPct],
    );
    result.minimumRemainingPct = remaining.length
      ? Math.min(...remaining)
      : null;
    result.status =
      !result.budgetExceeded &&
      result.anchorCount > 0 &&
      result.certifiedAnchors === result.anchorCount &&
      !result.reasons.length
        ? 'certified_model'
        : 'not_certified';
    result.computationMs = performance.now() - began;
    return result;
  };
  if (
    !missionAnalysisCandidateSchema.safeParse(candidate).success ||
    candidate.status !== 'feasible_model' ||
    candidate.plan.inputHash !== result.inputHash
  ) {
    result.reasons.push(
      'Исходный план неполный или относится к другому заданию.',
    );
    return finish();
  }
  const validation = await validateExportedCandidate(d, candidate);
  if (validation.some((c) => c.status === 'fail')) {
    result.reasons.push(
      `Исходный план не прошёл повторную проверку: ${validation
        .filter((c) => c.status === 'fail')
        .map((c) => c.id)
        .join(', ')}.`,
    );
    return finish();
  }
  if (d.terrainModel.kind !== 'flat' || !d.planning.safetyPolicy) {
    result.reasons.push(
      'Нужны явно плоский рельеф и непрерывная политика безопасности.',
    );
    return finish();
  }
  result.anchorCount = candidate.sorties.reduce(
    (sum, s) =>
      sum +
      s.segments.reduce(
        (n, seg) =>
          n +
          (d.scenario.vehicles.find((v) => v.id === s.vehicleId)?.kind ===
          'fixedWing'
            ? 1
            : Math.max(
                1,
                Math.ceil((seg.endSec - seg.startSec) / maxIntervalSec),
              )),
        0,
      ),
    0,
  );
  if (result.anchorCount > maxAnchors) {
    result.budgetExceeded = true;
    result.reasons.push(
      `Нужно ${result.anchorCount} интервалов, предел ${maxAnchors}; частичная выборка не объявляется полной проверкой.`,
    );
    return finish();
  }
  try {
    const scene = {
      ...d.scenario,
      exclusions: [
        ...d.scenario.exclusions,
        ...d.restrictions.map((r) => r.geometry),
      ],
    };
    let geometry = prepareGeometry(
      d.scenario,
      d.scenario.clearanceM,
      d.scenario.area.coordinates[0][0],
    );
    let route: ReturnType<typeof router> | null = null;
    let geometryReason = '';
    let volumes: ReturnType<typeof compileRestrictions> = [];
    try {
      geometry = prepareGeometry(
        scene,
        d.scenario.clearanceM,
        d.scenario.area.coordinates[0][0],
      );
      const routingGeometry = scene.exclusions.length
        ? prepareGeometry(
            { ...scene, clearanceM: scene.clearanceM + 0.25 },
            d.scenario.clearanceM,
            d.scenario.area.coordinates[0][0],
          )
        : geometry;
      route = router(routingGeometry);
      volumes = compileRestrictions(d, geometry);
    } catch (e) {
      geometryReason = `Отдельная консервативная геометрия ухода не построена: ${e instanceof Error ? e.message : String(e)}`;
    }
    const deadlineSec =
      (Date.parse(d.window.end) - Date.parse(d.window.start)) / 1000;
    for (const original of candidate.sorties) {
      const v = d.scenario.vehicles.find((v) => v.id === original.vehicleId)!;
      const others = candidate.sorties.filter((s) => s.vehicleId !== v.id);
      const prior = candidate.sorties.filter(
        (s) => s.vehicleId === v.id && s.endSec <= original.startSec,
      );
      for (let index = 0; index < original.segments.length; index++) {
        const seg = original.segments[index],
          duration = seg.endSec - seg.startSec;
        const pieces =
          v.kind === 'fixedWing'
            ? 1
            : Math.max(1, Math.ceil(duration / maxIntervalSec));
        for (let piece = 1; piece <= pieces; piece++) {
          if (performance.now() - began > maxComputeMs) {
            result.budgetExceeded = true;
            result.reasons.push(
              'Исчерпан бюджет проверки; непросмотренные интервалы не считаются подтверждёнными.',
            );
            return finish();
          }
          const anchorSec = seg.startSec + (duration * piece) / pieces;
          const pos = positionAt(seg, anchorSec);
          const anchor: ContingencyAnchor = {
            sortieId: original.id,
            vehicleId: v.id,
            segmentIndex: index,
            intervalStartSec: seg.startSec + (duration * (piece - 1)) / pieces,
            anchorSec,
            responseDelaySec: duration / pieces,
            coordinate: pos.coordinate,
            altitudeM: pos.altitudeM,
            batteryPct: pos.batteryPct,
            status: 'not_certified',
            mode: null,
            landing: null,
            landingSec: null,
            remainingPct: null,
            route: [],
            reasons: [],
          };
          const attempted = new Set<string>();
          const possibilities: {
            escape: ScheduledSortie;
            combined: ScheduledSortie;
            landing: Coordinate;
          }[] = [];
          const prefix = original.segments.slice(0, index).concat({
            ...seg,
            to: pos.coordinate,
            endSec: anchorSec,
            altitudeToM: pos.altitudeM,
            batteryToPct: pos.batteryPct,
            distanceM: distance(
              geometry.forward(seg.from),
              geometry.forward(pos.coordinate),
            ),
          });
          for (const target of route && v.kind === 'multirotor'
            ? uniqueTargets(d, v)
            : []) {
            if (
              pos.altitudeM <= 1e-6 &&
              distance(
                geometry.forward(pos.coordinate),
                geometry.forward(target),
              ) > 0.01
            )
              continue;
            const path =
              pos.altitudeM <= 1e-6
                ? [geometry.forward(pos.coordinate)]
                : route!(
                    geometry.forward(pos.coordinate),
                    geometry.forward(target),
                  );
            if (!path || !inside(geometry.forward(target), geometry.free)) {
              attempted.add('Нет свободного пути/посадочной площадки.');
              continue;
            }
            const segments: Segment[] = [];
            let clock = anchorSec,
              battery = pos.batteryPct;
            const add = (
              from: Coordinate,
              to: Coordinate,
              phase: Segment['phase'],
              sec: number,
              h1: number,
              h2: number,
              air: number,
            ) => {
              if (sec <= 0) return;
              const len = distance(
                  geometry.forward(from),
                  geometry.forward(to),
                ),
                after = battery - (sec / (v.effectiveEnduranceMin * 60)) * 100;
              segments.push({
                from,
                to,
                phase,
                startSec: clock,
                endSec: clock + sec,
                altitudeFromM: h1,
                altitudeToM: h2,
                batteryFromPct: battery,
                batteryToPct: after,
                airspeedMps: air,
                groundSpeedMps: len / sec,
                distanceM: len,
              });
              clock += sec;
              battery = after;
            };
            try {
              for (let p = 1; p < path.length; p++) {
                const from = geometry.inverse(path[p - 1]),
                  to = geometry.inverse(path[p]);
                add(
                  from,
                  from,
                  'turn',
                  v.turnSeconds,
                  pos.altitudeM,
                  pos.altitudeM,
                  0,
                );
                const speed = groundSpeed(
                  path[p - 1],
                  path[p],
                  v.airspeedMps,
                  d.scenario.wind,
                );
                add(
                  from,
                  to,
                  'return',
                  distance(path[p - 1], path[p]) / speed,
                  pos.altitudeM,
                  pos.altitudeM,
                  v.airspeedMps,
                );
              }
              add(
                target,
                target,
                'landing',
                pos.altitudeM / v.descentMps,
                pos.altitudeM,
                0,
                0,
              );
              if (battery < d.scenario.reservePct - 1e-6) {
                attempted.add(
                  'На проверенный путь недостаточно заряда с резервом.',
                );
                continue;
              }
              if (clock > deadlineSec + 1e-6) {
                attempted.add('Посадка за пределами окна миссии.');
                continue;
              }
              if (
                d.scenario.wind.speedMps > v.maxWindMps ||
                missionEnvironmentChecks(d, segments).some(
                  (c) => c.status === 'fail',
                )
              ) {
                attempted.add(
                  'Пределы ветра, облаков или видимости не выполнены.',
                );
                continue;
              }
              if (
                segments.some(
                  (s) =>
                    !segmentInside(
                      geometry.forward(s.from),
                      geometry.forward(s.to),
                      geometry.free,
                    ) ||
                    volumes.some((volume) =>
                      segmentIntersectsVolume(s, volume, geometry.forward),
                    ),
                )
              ) {
                attempted.add(
                  'Путь или посадка пересекает закрытый защитный объём.',
                );
                continue;
              }
              const escape: ScheduledSortie = {
                ...original,
                id: `escape-${original.id}`,
                startSec: anchorSec,
                endSec: clock,
                readySec: clock + d.planning.serviceSec,
                durationSec: clock - anchorSec,
                segments,
                distanceM: segments.reduce((n, s) => n + s.distanceM, 0),
                remainingPct: battery,
                strips: 0,
                shots: null,
              };
              const combined: ScheduledSortie = {
                ...escape,
                startSec: original.startSec,
                segments: [...prefix, ...segments],
                durationSec: clock - original.startSec,
              };
              if (
                others.some((other) => sortiesConflict(d, combined, other)) ||
                groundSeparationConflicts(d, [...prior, combined, ...others])
                  .length
              ) {
                attempted.add(
                  'Уход или занятая после посадки база конфликтует с другим БВС.',
                );
                continue;
              }
              possibilities.push({ escape, combined, landing: target });
            } catch {
              attempted.add('Путь не рассчитан при заданной скорости и ветре.');
            }
          }
          possibilities.sort((a, b) => a.escape.endSec - b.escape.endSec);
          const chosen = possibilities[0];
          if (chosen) {
            anchor.status = 'certified_model';
            anchor.mode = 'independent-escape';
            anchor.landing = chosen.landing;
            anchor.landingSec = chosen.escape.endSec;
            anchor.remainingPct = chosen.escape.remainingPct;
            anchor.route = chosen.escape.segments;
          } else {
            // Keep exact original motion. Relabeling survey as transit would
            // silently change constant-ground-speed dynamics. Acquisition is
            // disabled by the explicit mode, never claimed completed here.
            const tail =
              anchorSec < seg.endSec - 1e-8
                ? [
                    {
                      ...seg,
                      from: pos.coordinate,
                      startSec: anchorSec,
                      altitudeFromM: pos.altitudeM,
                      batteryFromPct: pos.batteryPct,
                      distanceM: distance(
                        geometry.forward(pos.coordinate),
                        geometry.forward(seg.to),
                      ),
                    },
                    ...original.segments.slice(index + 1),
                  ]
                : original.segments.slice(index + 1);
            const combined = { ...original, segments: [...prefix, ...tail] };
            if (
              !others.some((other) => sortiesConflict(d, combined, other)) &&
              !groundSeparationConflicts(d, [...prior, combined, ...others])
                .length
            ) {
              anchor.status = 'certified_model';
              anchor.mode = 'planned-corridor-sensing-off';
              anchor.landing = original.segments.at(-1)!.to;
              anchor.landingSec = original.endSec;
              anchor.remainingPct = original.remainingPct;
              anchor.route = tail;
              anchor.reasons = [
                geometryReason ||
                  (v.kind === 'fixedWing'
                    ? 'Для самолёта подтверждён только исходный манёвренный коридор; отдельный короткий уход не заявляется.'
                    : 'Отдельный короткий уход не найден; сохраняется исходное проверенное движение до посадки с выключенной съёмкой.'),
              ];
            } else
              anchor.reasons = [
                ...attempted,
                'Даже исходный коридор с отменой последующих вылетов не прошёл проверку занятости площадки.',
              ];
          }
          result.anchors.push(anchor);
        }
      }
    }
    if (result.anchors.some((a) => a.status !== 'certified_model'))
      result.reasons.push(
        'Не для каждого интервала найден проверенный уход. Это не доказательство невозможности и не разрешение игнорировать проблему.',
      );
  } catch (e) {
    result.reasons.push(
      `Консервативная геометрия ухода не построена: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return finish();
}
