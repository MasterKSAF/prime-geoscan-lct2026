import { z } from 'zod';
import type { MissionDocument } from './mission-schema.ts';
import type { Check, Coordinate } from './schema.ts';

const instant = z.iso.datetime({ offset: true });
const value = (min: number, max: number) => z.number().min(min).max(max);
export const weatherHourSchema = z
  .object({
    at: instant,
    windMps: value(0, 150),
    fromDeg: value(0, 359),
    gustMps: value(0, 150),
    precipitationMm: value(0, 1000),
    cloudPct: value(0, 100),
    visibilityM: value(0, 1000000),
    temperatureMinC: value(-100, 80),
    temperatureMaxC: value(-100, 80),
  })
  .strict();
export const weatherSnapshotSchema = z
  .object({
    version: z.literal('1.0'),
    provider: z.literal('Open-Meteo'),
    kind: z.literal('forecast'),
    fetchedAt: instant,
    start: instant,
    end: instant,
    footprint: z.string().min(1).max(30000),
    referenceHeightM: z.union([
      z.literal(10),
      z.literal(80),
      z.literal(120),
      z.literal(180),
    ]),
    points: z
      .array(z.tuple([value(-180, 180), value(-70, 70)]))
      .min(1)
      .max(5),
    hours: z.array(weatherHourSchema).min(2).max(74),
  })
  .strict();
export const missionWeatherSchema = z
  .object({
    snapshot: weatherSnapshotSchema,
    limits: z
      .object({
        maxPrecipitationMm: value(0, 100),
        maxCloudPct: value(0, 100),
        minVisibilityM: value(0, 100000),
        source: z.string().min(1).max(500),
      })
      .strict(),
  })
  .strict();
export type WeatherSnapshot = z.infer<typeof weatherSnapshotSchema>;
export type WeatherHour = z.infer<typeof weatherHourSchema>;
export type MissionWeather = z.infer<typeof missionWeatherSchema>;

/** Includes transit boundary and bases: forecast cannot survive moving the site. */
export function weatherFootprint(d: MissionDocument): string {
  return JSON.stringify([
    d.scenario.airspace.coordinates,
    d.jobs.map((j) => j.area.coordinates),
    d.scenario.vehicles.map((v) => [v.start, v.landing]),
  ]);
}
export function weatherPoints(d: MissionDocument): Coordinate[] {
  const coords = [
    ...d.scenario.airspace.coordinates.flat(),
    ...d.jobs.flatMap((j) => j.area.coordinates.flat()),
    ...d.scenario.vehicles.flatMap((v) => [v.start, v.landing]),
  ];
  const xs = coords.map((c) => c[0]),
    ys = coords.map((c) => c[1]);
  const a = Math.min(...xs),
    b = Math.max(...xs),
    c = Math.min(...ys),
    e = Math.max(...ys);
  if (b - a > 2 || e - c > 2)
    throw new Error(
      'Для прогноза выберите компактную территорию: не более 2° по каждой оси.',
    );
  return [
    [(a + b) / 2, (c + e) / 2],
    [a, c],
    [b, c],
    [b, e],
    [a, e],
  ];
}
export function weatherHeight(d: MissionDocument): 10 | 80 | 120 | 180 {
  const h = Math.max(...d.jobs.map((j) => j.job.altitudeM));
  return h <= 40 ? 10 : h <= 100 ? 80 : h <= 150 ? 120 : 180;
}
export function weatherMatches(
  d: MissionDocument,
  s: WeatherSnapshot,
): boolean {
  try {
    if (JSON.stringify(weatherPoints(d)) !== JSON.stringify(s.points))
      return false;
  } catch {
    return false;
  }
  return (
    weatherFootprint(d) === s.footprint &&
    Date.parse(d.window.start) === Date.parse(s.start) &&
    Date.parse(d.window.end) === Date.parse(s.end) &&
    weatherHeight(d) === s.referenceHeightM
  );
}
export function weatherEnvelope(s: WeatherSnapshot) {
  const wind = s.hours.reduce((a, b) => (b.windMps > a.windMps ? b : a));
  return {
    windMps: wind.windMps,
    fromDeg: wind.fromDeg,
    gustMps: Math.max(...s.hours.map((h) => h.gustMps)),
    precipitationMm: Math.max(...s.hours.map((h) => h.precipitationMm)),
    cloudPct: Math.max(...s.hours.map((h) => h.cloudPct)),
    visibilityM: Math.min(...s.hours.map((h) => h.visibilityM)),
  };
}
export function weatherTimeComplete(s: WeatherSnapshot): boolean {
  const start = Math.floor(Date.parse(s.start) / 3600000) * 3600000;
  const end = Math.ceil(Date.parse(s.end) / 3600000) * 3600000;
  return (
    end > start &&
    end - start <= 73 * 3600000 &&
    s.hours.length === (end - start) / 3600000 + 1 &&
    s.hours.every((h, i) => Date.parse(h.at) === start + i * 3600000)
  );
}
export function applyMissionWeather(
  d: MissionDocument,
  weather: MissionWeather,
): MissionDocument {
  weather = missionWeatherSchema.parse(weather);
  if (
    !weatherMatches(d, weather.snapshot) ||
    !weatherTimeComplete(weather.snapshot)
  )
    throw new Error(
      'Прогноз не соответствует территории, высоте или времени. Обновите его.',
    );
  const e = weatherEnvelope(weather.snapshot);
  if (e.windMps > 30)
    throw new Error(
      'Ветер выше диапазона расчётного ядра (30 м/с). Применение заблокировано; значения не занижаются.',
    );
  return {
    ...d,
    weather,
    scenario: {
      ...d.scenario,
      wind: { speedMps: e.windMps, fromDeg: e.fromDeg },
    },
  };
}
/** Pure checks: never use the wall clock when verifying historical evidence. */
export function missionWeatherChecks(
  d: MissionDocument,
  usedIds: string[],
): Check[] {
  if (!d.weather) return [];
  const { snapshot: s, limits: l } = d.weather,
    e = weatherEnvelope(s);
  const check = (
    id: string,
    ok: boolean,
    title: string,
    detail: string,
  ): Check => ({ id, status: ok ? 'pass' : 'fail', title, detail });
  const used = d.scenario.vehicles.filter((v) =>
    usedIds.length ? usedIds.includes(v.id) : v.enabled,
  );
  return [
    check(
      'FORECAST_SCOPE',
      weatherMatches(d, s) && weatherTimeComplete(s),
      'Прогноз относится к заданию',
      'Проверены территория, окно UTC, опорная высота и непрерывность почасовых данных.',
    ),
    check(
      'FORECAST_APPLIED_WIND',
      d.scenario.wind.speedMps === e.windMps &&
        d.scenario.wind.fromDeg === e.fromDeg,
      'Ветер расчёта соответствует снимку',
      'В ядре постоянный ветер: наибольшая скорость в выборке и направление в этот час. Это не полная динамическая модель атмосферы.',
    ),
    check(
      'FORECAST_HEIGHT',
      Math.max(...d.jobs.map((j) => j.job.altitudeM)) <= 180,
      'Диапазон высот погодного адаптера',
      'Доступны опорные уровни 10/80/120/180 м. Выше 180 м выполнение по этому прогнозу не подтверждается.',
    ),
    check(
      'FORECAST_WIND_LIMIT',
      used.length > 0 &&
        used.every((v) => Math.max(e.windMps, e.gustMps) <= v.maxWindMps),
      'Ветер и порывы по пределам выбранных БВС',
      `Максимум выборки: ветер ${e.windMps} м/с, порывы на 10 м ${e.gustMps} м/с. Проверено всё окно, а не только вылеты.`,
    ),
    check(
      'FORECAST_RAIN',
      e.precipitationMm <= l.maxPrecipitationMm,
      'Осадки по принятому пределу',
      `Максимум ${e.precipitationMm} мм/ч; предел ${l.maxPrecipitationMm}. ${l.source}`,
    ),
    check(
      'FORECAST_VISIBILITY',
      e.visibilityM >= l.minVisibilityM,
      'Видимость по принятому пределу',
      `Минимум ${e.visibilityM} м; предел ${l.minVisibilityM} м. ${l.source}`,
    ),
    check(
      'FORECAST_CLOUD',
      !d.jobs.some((j) => j.daylight === 'topographicClearSky') ||
        e.cloudPct <= l.maxCloudPct,
      'Облачность для профиля ясного неба',
      `Максимум ${e.cloudPct}%; предел ${l.maxCloudPct}%. Это настройка модели, не универсальная норма ГОСТ. ${l.source}`,
    ),
    {
      id: 'FORECAST_LIMITATIONS',
      status: 'unknown',
      title: 'Пределы погодного прогноза',
      detail: `Open-Meteo, получен ${s.fetchedAt}; ${s.points.length} контрольных точек, опорный ветер ${s.referenceHeightM} м над модельной поверхностью. Прогноз не измерение. Локальные порывы, нижняя граница облаков, температурные пределы БВС и ветер на фактической высоте не подтверждены. Изменение направления в динамике не пересчитывает энергию/траекторию.`,
    },
  ];
}
