import { ENGINE_VERSION, parseScenario } from './schema.ts';
import { trackAltitudeCheck, trackAltitudeAllowed } from './altitude-policy.ts';
import type {
  Check,
  Mission,
  Phase,
  Plan,
  Scenario,
  Segment,
  Vehicle,
} from './schema.ts';
import {
  area,
  coveredArea,
  distance,
  generateStrips,
  inside,
  prepareGeometry,
  router,
  segmentInside,
} from './geometry.ts';
import type { Geometry, Point, Strip } from './geometry.ts';

export class PlanningError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PlanningError';
  }
}
export function groundSpeed(
  a: Point,
  b: Point,
  airspeed: number,
  wind: Scenario['wind'],
): number {
  const len = distance(a, b);
  if (len < 1e-6) return airspeed;
  const d: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  // Meteorological direction: wind comes FROM the named bearing.
  const r = (wind.fromDeg * Math.PI) / 180,
    w: Point = [-Math.sin(r) * wind.speedMps, -Math.cos(r) * wind.speedMps];
  const along = w[0] * d[0] + w[1] * d[1],
    across = w[0] * d[1] - w[1] * d[0];
  if (Math.abs(across) >= airspeed)
    throw new PlanningError(
      'WIND',
      'Боковой ветер не позволяет выдержать линию пути при заданной воздушной скорости.',
    );
  const gs = Math.sqrt(airspeed ** 2 - across ** 2) + along;
  if (gs < 0.5)
    throw new PlanningError(
      'WIND',
      'Недостаточная путевая скорость против ветра.',
    );
  return gs;
}
type Job = { strip: Strip; from: Point; to: Point };
type FlightState = {
  vehicle: Vehicle;
  jobs: Job[];
  end: Point;
  elapsed: number;
};
function pathTime(path: Point[], v: Vehicle, s: Scenario) {
  return path
    .slice(1)
    .reduce(
      (sum, p, i) =>
        sum +
        distance(path[i], p) / groundSpeed(path[i], p, v.airspeedMps, s.wind) +
        (i ? v.turnSeconds : 0),
      0,
    );
}
function totals(m: Mission[]) {
  return {
    makespanSec: Math.max(0, ...m.map((v) => v.durationSec)),
    flightTimeSec: m.reduce((a, v) => a + v.durationSec, 0),
    distanceM: m.reduce((a, v) => a + v.distanceM, 0),
  };
}
function buildMission(
  st: FlightState,
  s: Scenario,
  g: Geometry,
  route: ReturnType<typeof router>,
): Mission {
  const v = st.vehicle,
    segments: Segment[] = [];
  let time = 0,
    pos = g.forward(v.start);
  const add = (
    a: Point,
    b: Point,
    phase: Phase,
    dt: number,
    h1: number,
    h2: number,
    stripId?: number,
  ) => {
    const len = distance(a, b),
      before = v.batteryPct - (time / (v.effectiveEnduranceMin * 60)) * 100;
    segments.push({
      from: g.inverse(a),
      to: g.inverse(b),
      phase,
      altitudeFromM: h1,
      altitudeToM: h2,
      airspeedMps: len ? v.airspeedMps : 0,
      groundSpeedMps: len / Math.max(dt, 1e-9),
      distanceM: len,
      startSec: time,
      endSec: time + dt,
      batteryFromPct: before,
      batteryToPct: before - (dt / (v.effectiveEnduranceMin * 60)) * 100,
      ...(stripId === undefined ? {} : { stripId }),
    });
    time += dt;
  };
  const move = (target: Point, phase: Phase) => {
    const path = route(pos, target);
    if (!path)
      throw new PlanningError(
        'ROUTE',
        'Нет допустимого перехода между участками.',
      );
    for (let i = 1; i < path.length; i++) {
      if (i > 1)
        add(
          path[i - 1],
          path[i - 1],
          'turn',
          v.turnSeconds,
          s.job.altitudeM,
          s.job.altitudeM,
        );
      const len = distance(path[i - 1], path[i]);
      if (len > 1e-5)
        add(
          path[i - 1],
          path[i],
          phase,
          len / groundSpeed(path[i - 1], path[i], v.airspeedMps, s.wind),
          s.job.altitudeM,
          s.job.altitudeM,
        );
    }
    pos = target;
  };
  add(pos, pos, 'takeoff', s.job.altitudeM / v.climbMps, 0, s.job.altitudeM);
  for (const job of st.jobs) {
    move(job.from, 'transit');
    add(pos, pos, 'turn', v.turnSeconds, s.job.altitudeM, s.job.altitudeM);
    add(
      job.from,
      job.to,
      'survey',
      distance(job.from, job.to) /
        groundSpeed(job.from, job.to, v.airspeedMps, s.wind),
      s.job.altitudeM,
      s.job.altitudeM,
      job.strip.id,
    );
    pos = job.to;
  }
  move(g.forward(v.landing), 'return');
  add(pos, pos, 'landing', s.job.altitudeM / v.descentMps, s.job.altitudeM, 0);
  return {
    vehicleId: v.id,
    name: v.name,
    segments,
    durationSec: time,
    distanceM: segments.reduce((a, b) => a + b.distanceM, 0),
    remainingPct: v.batteryPct - (time / (v.effectiveEnduranceMin * 60)) * 100,
    strips: st.jobs.length,
    shots: ['RGB', 'MS', 'IR'].includes(s.job.type)
      ? st.jobs.reduce(
          (n, j) =>
            n + Math.ceil(distance(j.from, j.to) / s.job.triggerDistanceM) + 1,
          0,
        )
      : null,
  };
}
function allocate(
  s: Scenario,
  g: Geometry,
  strips: Strip[],
  route: ReturnType<typeof router>,
  baseline = false,
): Mission[] | null {
  const states: FlightState[] = s.vehicles
    .filter((v) => v.enabled)
    .map((v) => ({
      vehicle: v,
      jobs: [],
      end: g.forward(v.start),
      elapsed: s.job.altitudeM / v.climbMps,
    }));
  for (let n = 0; n < strips.length; n++) {
    const strip = strips[n];
    let best: {
      index: number;
      from: Point;
      to: Point;
      elapsed: number;
      score: number;
    } | null = null;
    for (let i = 0; i < states.length; i++) {
      if (baseline && i !== n % states.length) continue;
      const st = states[i],
        v = st.vehicle;
      for (const reverse of [false, true]) {
        const from = reverse ? strip.b : strip.a,
          to = reverse ? strip.a : strip.b;
        const link = route(st.end, from),
          home = route(to, g.forward(v.landing));
        if (!link || !home) continue;
        let added, remaining;
        try {
          added =
            pathTime(link, v, s) +
            v.turnSeconds +
            distance(from, to) / groundSpeed(from, to, v.airspeedMps, s.wind);
          remaining = pathTime(home, v, s) + s.job.altitudeM / v.descentMps;
        } catch {
          continue;
        }
        const elapsed = st.elapsed + added,
          finish = elapsed + remaining;
        if (
          finish >
          (v.effectiveEnduranceMin * 60 * (v.batteryPct - s.reservePct)) / 100
        )
          continue;
        let score = finish;
        if (s.objective === 'flightTime') {
          const old = st.jobs.length
            ? pathTime(route(st.end, g.forward(v.landing))!, v, s) +
              s.job.altitudeM / v.descentMps
            : 0;
          score = added + remaining - old + (st.jobs.length ? 0 : st.elapsed);
        }
        if (!best || score < best.score - 1e-8)
          best = { index: i, from, to, elapsed, score };
      }
    }
    if (!best) return null;
    const st = states[best.index];
    st.jobs.push({ strip, from: best.from, to: best.to });
    st.elapsed = best.elapsed;
    st.end = best.to;
  }
  return states
    .filter((st) => st.jobs.length)
    .map((st) => buildMission(st, s, g, route));
}

/** Independent post-solve checks recompute geometry and time/energy from exported segments. */
export function validatePlan(
  s: Scenario,
  missions: Mission[],
  expectedStrips: number,
  g = prepareGeometry(s),
): { checks: Check[]; coveragePct: number } {
  const checks: Check[] = [
      trackAltitudeCheck(
        [s.job.altitudeM],
        missions.flatMap((m) => m.segments),
      ),
    ],
    segments = missions.flatMap((m) => m.segments),
    surveys = segments.filter((x) => x.phase === 'survey');
  const check = (id: string, ok: boolean, title: string, detail: string) =>
    checks.push({ id, status: ok ? 'pass' : 'fail', title, detail });
  check(
    'GEOMETRY',
    segments.every((x) =>
      segmentInside(g.forward(x.from), g.forward(x.to), g.free),
    ),
    'Границы и запреты',
    'Каждый отрезок разбит по пересечениям с границами; проверены рабочие участки, переходы и возврат. Запас вокруг запретов включён.',
  );
  check(
    'STRIPS',
    surveys.length === expectedStrips &&
      new Set(surveys.map((x) => x.stripId)).size === expectedStrips,
    'Все рабочие проходы назначены',
    `${surveys.length} из ${expectedStrips}; без повторных идентификаторов.`,
  );
  const measured = coveredArea(
    g,
    surveys.map((x, i) => ({
      id: i,
      a: g.forward(x.from),
      b: g.forward(x.to),
    })),
    s.job.swathM,
  );
  const coveragePct = Math.min(100, (measured / area(g.target)) * 100);
  check(
    'COVERAGE',
    coveragePct >= 99,
    'Геометрическое покрытие',
    `${coveragePct.toFixed(2)}% доступной области; порог 99% — инженерный критерий версии 0.1, не утверждённый критерий жюри. Это полосы покрытия, не подтверждение качества снимков.`,
  );
  let energy = true,
    timing = true,
    endpoints = true;
  for (const m of missions) {
    const v = s.vehicles.find((v) => v.id === m.vehicleId);
    if (!v) {
      energy = false;
      timing = false;
      endpoints = false;
      continue;
    }
    let elapsed = 0;
    for (let i = 0; i < m.segments.length; i++) {
      const seg = m.segments[i],
        a = g.forward(seg.from),
        b = g.forward(seg.to),
        len = distance(a, b);
      let dt =
        seg.phase === 'takeoff'
          ? s.job.altitudeM / v.climbMps
          : seg.phase === 'landing'
            ? s.job.altitudeM / v.descentMps
            : seg.phase === 'turn'
              ? v.turnSeconds
              : len / groundSpeed(a, b, v.airspeedMps, s.wind);
      if (!Number.isFinite(dt)) dt = Infinity;
      timing &&=
        Math.abs(seg.startSec - elapsed) < 1e-4 &&
        Math.abs(seg.endSec - seg.startSec - dt) < 1e-4 &&
        Math.abs(seg.distanceM - len) < 0.01;
      if (i) endpoints &&= distance(a, g.forward(m.segments[i - 1].to)) < 0.01;
      elapsed += dt;
    }
    const pct = v.batteryPct - (elapsed / (v.effectiveEnduranceMin * 60)) * 100;
    energy &&=
      pct >= s.reservePct - 1e-6 && Math.abs(pct - m.remainingPct) < 1e-4;
    timing &&= Math.abs(elapsed - m.durationSec) < 1e-4;
    endpoints &&=
      m.segments[0]?.phase === 'takeoff' &&
      m.segments.at(-1)?.phase === 'landing' &&
      distance(g.forward(m.segments[0].from), g.forward(v.start)) < 0.01 &&
      distance(g.forward(m.segments.at(-1)!.to), g.forward(v.landing)) < 0.01;
  }
  check(
    'ENERGY',
    energy,
    'Резерв в расчётной модели',
    `Не менее ${s.reservePct}% после возврата и посадки. Линейный бюджет времени; реальное энергопотребление пока не подтверждено.`,
  );
  check(
    'TIME',
    timing,
    'Баланс времени',
    'Независимый пересчёт путевых скоростей с ветром, длительности фаз и общего времени.',
  );
  check(
    'ENDPOINTS',
    endpoints,
    'Непрерывность и завершение',
    'Начало в назначенной точке старта, последовательные фазы, возврат в назначенную точку посадки.',
  );
  checks.push(
    {
      id: 'CALIBRATION',
      status: 'unknown',
      title: 'Энергия и динамика требуют калибровки',
      detail:
        'Не учтены измеренные токи, деградация/температура АКБ, отдельная мощность камеры и разгон/торможение. Оценка не является допуском к полёту.',
    },
    {
      id: 'TERRAIN',
      status: 'unknown',
      title: 'Рельеф и препятствия не проверены',
      detail:
        'DEM отсутствует. Высота — над условным плоским уровнем старта. Нельзя считать её доказанной высотой над землёй.',
    },
    {
      id: 'SEPARATION',
      status: 'unknown',
      title: 'Разведение БВС не подтверждено',
      detail:
        'Параллельные старты — расчётное допущение. Пространственно-временные конфликты между бортами и посторонний трафик пока не проверяются.',
    },
    {
      id: 'PAYLOAD',
      status: 'unknown',
      title: 'Качество съёмки и интеграция',
      detail:
        'Ширина полосы и шаг снимков заданы пользователем. Выдержка, частота сохранения кадров, точность и импорт в наземную станцию не проверены.',
    },
    {
      id: 'RESERVE_SITES',
      status: 'unknown',
      title: 'Резервные площадки',
      detail:
        'Координаты сохранены и показаны. Достижимость аварийного ухода с каждой точки маршрута ещё не проверяется.',
    },
  );
  return { checks, coveragePct };
}
export function solve(input: unknown): Omit<Plan, 'inputHash' | 'createdAt'> {
  const begin = performance.now(),
    s = parseScenario(input),
    active = s.vehicles.filter((v) => v.enabled);
  if (!trackAltitudeAllowed(s.job.altitudeM))
    throw new PlanningError(
      'TRACK_ALTITUDE',
      'Предел трека: высота должна быть ниже 150 м над поверхностью.',
    );
  if (
    active.some(
      (v) => v.cameraProfiles !== undefined || v.cameraIds !== undefined,
    )
  )
    throw new PlanningError(
      'CAMERA_BINDING_V2',
      'Установленные камеры рассчитываются в миссии v2 с требованиями GSD и перекрытий. Старый геометрический API не применяет и не подменяет их оптику.',
    );
  if (!active.length)
    throw new PlanningError('FLEET', 'Выберите хотя бы один БВС.');
  if (active.some((v) => v.kind === 'fixedWing' || v.model === '201'))
    throw new PlanningError(
      'FIXED_WING',
      'Геоскан 201 пока нельзя включать в расчёт: требуется отдельная модель катапульты, разворотов и парашютной посадки.',
    );
  if (
    active.some(
      (v) =>
        ['Gemini', '801'].includes(v.model) &&
        (v.airspeedMps > 15 || v.maxWindMps > 10),
    )
  )
    throw new PlanningError(
      'PROFILE_LIMIT',
      'Для Gemini/801 нельзя превышать опубликованные пределы 15 м/с горизонтальной скорости и 10 м/с ветра. Рабочие ограничения могут быть строже.',
    );
  if (['LiDAR', 'Geophysics'].includes(s.job.type))
    throw new PlanningError(
      'PAYLOAD_PROFILE',
      'Для LiDAR и геофизики необходим подтверждённый профиль сенсора и рельеф. Эти типы пока заблокированы, а не подменены RGB.',
    );
  if (active.some((v) => !v.jobs.includes(s.job.type)))
    throw new PlanningError(
      'COMPATIBILITY',
      'Один из выбранных БВС не поддерживает этот тип работ в своей конфигурации.',
    );
  if (active.some((v) => s.wind.speedMps > v.maxWindMps))
    throw new PlanningError(
      'WIND_LIMIT',
      'Ветер превышает предел одного из выбранных БВС.',
    );
  if (active.some((v) => v.batteryPct <= s.reservePct))
    throw new PlanningError(
      'BATTERY',
      'Начальный заряд должен превышать резерв.',
    );
  const g = prepareGeometry(s),
    route = router(g);
  if (
    active.some(
      (v) =>
        !inside(g.forward(v.start), g.free) ||
        !inside(g.forward(v.landing), g.free),
    )
  )
    throw new PlanningError(
      'SITE',
      'Точка старта или посадки находится вне доступного воздушного пространства.',
    );
  const trace: Plan['trace'] = [
    {
      event: 'INPUT',
      detail: `${active.length} БВС; ${s.job.type}; ветер ${s.wind.speedMps} м/с от ${s.wind.fromDeg}°; резерв ${s.reservePct}%.`,
    },
  ];
  const bearings = s.job.autoBearing
    ? [...new Set([s.job.bearingDeg, 0, 45, 90, 135])]
    : [s.job.bearingDeg];
  let best: {
    missions: Mission[];
    strips: Strip[];
    bearing: number;
    score: number;
  } | null = null;
  const baselineStrips = generateStrips(
    g,
    s.job.swathM * (1 - s.job.sideOverlap),
    s.job.bearingDeg,
  );
  const baseline = allocate(s, g, baselineStrips, route, true);
  if (baseline)
    best = {
      missions: baseline,
      strips: baselineStrips,
      bearing: s.job.bearingDeg,
      score:
        s.objective === 'makespan'
          ? totals(baseline).makespanSec
          : totals(baseline).flightTimeSec,
    };
  trace.push({
    event: 'BASELINE',
    detail: baseline
      ? 'Поочерёдное назначение проходов при исходном направлении; те же ограничения.'
      : 'Baseline не уложился в ресурс: процент улучшения не вычисляется.',
  });
  for (const bearing of bearings) {
    if (performance.now() - begin > 6000) {
      trace.push({
        event: 'BUDGET',
        detail:
          'Достигнут мягкий бюджет 6 с между кандидатами; результат — лучшее найденное, не доказанный оптимум.',
      });
      break;
    }
    const strips = generateStrips(
      g,
      s.job.swathM * (1 - s.job.sideOverlap),
      bearing,
    );
    for (const reverse of [false, true]) {
      const candidate = allocate(
        s,
        g,
        reverse ? [...strips].reverse() : strips,
        route,
      );
      if (!candidate) {
        trace.push({
          event: 'CANDIDATE',
          detail: `${bearing}° ${reverse ? '←' : '→'}: нет полного назначения в рамках бюджета батарей.`,
        });
        continue;
      }
      const t = totals(candidate),
        score = s.objective === 'makespan' ? t.makespanSec : t.flightTimeSec;
      trace.push({
        event: 'CANDIDATE',
        detail: `${bearing}° ${reverse ? '←' : '→'}: завершение ${t.makespanSec.toFixed(1)} с; налёт ${t.flightTimeSec.toFixed(1)} с.`,
      });
      if (!best || score < best.score - 1e-8)
        best = { missions: candidate, strips, bearing, score };
    }
  }
  if (!best)
    throw new PlanningError(
      'NO_PLAN',
      'Полный план не найден. Проверьте заряд, ветер, доступность переходов; увеличьте парк или уменьшите область. Это отказ эвристики, не доказательство математической неразрешимости.',
    );
  const validation = validatePlan(s, best.missions, best.strips.length, g);
  const bm = baseline
    ? validatePlan(s, baseline, baselineStrips.length, g)
    : null;
  trace.push({
    event: 'VALIDATION',
    detail: `${validation.checks.filter((c) => c.status === 'pass').length} пройдено; ${validation.checks.filter((c) => c.status === 'fail').length} ошибок; ${validation.checks.filter((c) => c.status === 'unknown').length} неопределённостей.`,
  });
  return {
    engineVersion: ENGINE_VERSION,
    scenario: s,
    status: validation.checks.some((c) => c.status === 'fail')
      ? 'invalid'
      : 'undetermined',
    missions: best.missions,
    checks: validation.checks,
    metrics: {
      areaHa: area(g.gross) / 10000,
      targetHa: area(g.target) / 10000,
      excludedHa: (area(g.gross) - area(g.target)) / 10000,
      coveragePct: validation.coveragePct,
      ...totals(best.missions),
      stripCount: best.strips.length,
      bearingDeg: best.bearing,
    },
    baseline:
      baseline && bm && !bm.checks.some((c) => c.status === 'fail')
        ? totals(baseline)
        : null,
    trace,
    computationMs: performance.now() - begin,
  };
}
