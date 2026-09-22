import { z } from 'zod';
import {
  weatherSnapshotSchema,
  weatherTimeComplete,
  type WeatherSnapshot,
  type WeatherHour,
} from './mission-weather.ts';

export const weatherRequestSchema = z
  .object({
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    footprint: z.string().min(1).max(30000),
    referenceHeightM: z.union([
      z.literal(10),
      z.literal(80),
      z.literal(120),
      z.literal(180),
    ]),
    points: z
      .array(
        z.tuple([z.number().min(-180).max(180), z.number().min(-70).max(70)]),
      )
      .min(1)
      .max(5),
  })
  .strict();
export type WeatherRequest = z.infer<typeof weatherRequestSchema>;
export function forecastUrl(q: WeatherRequest, now = Date.now()): URL {
  const a = Date.parse(q.start),
    b = Date.parse(q.end);
  if (b - a < 60000 || b - a > 72 * 3600000)
    throw new Error(
      'Для прогноза окно миссии должно быть от 1 минуты до 72 часов.',
    );
  for (const axis of [0, 1]) {
    const values = q.points.map((p) => p[axis]);
    if (Math.max(...values) - Math.min(...values) > 2)
      throw new Error('Слишком большая территория прогноза.');
  }
  const midnight = Math.floor(now / 86400000) * 86400000;
  if (
    a < midnight ||
    Math.ceil(b / 3600000) * 3600000 >= midnight + 16 * 86400000
  )
    throw new Error(
      'Дата вне доступного прогноза: выберите окно от сегодня до следующих 15 дней. Исторические условия не подменяются текущими.',
    );
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  const vars = [
    'temperature_2m',
    'precipitation',
    'cloud_cover',
    'visibility',
    'wind_gusts_10m',
    'wind_speed_10m',
    `wind_speed_${q.referenceHeightM}m`,
    `wind_direction_${q.referenceHeightM}m`,
  ];
  Object.entries({
    latitude: q.points.map((p) => p[1]).join(','),
    longitude: q.points.map((p) => p[0]).join(','),
    hourly: [...new Set(vars)].join(','),
    timezone: 'GMT',
    timeformat: 'unixtime',
    wind_speed_unit: 'ms',
    temperature_unit: 'celsius',
    precipitation_unit: 'mm',
    start_date: new Date(Math.floor(a / 3600000) * 3600000)
      .toISOString()
      .slice(0, 10),
    end_date: new Date(Math.ceil(b / 3600000) * 3600000)
      .toISOString()
      .slice(0, 10),
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  return u;
}
export function normalizeForecast(
  raw: unknown,
  q: WeatherRequest,
  fetchedAt: string,
): WeatherSnapshot {
  const rows = Array.isArray(raw) ? raw : [raw];
  if (rows.length !== q.points.length)
    throw new Error('Метеосервис вернул не все контрольные точки.');
  const from = Math.floor(Date.parse(q.start) / 3600000) * 3600,
    to = Math.ceil(Date.parse(q.end) / 3600000) * 3600;
  const hours: WeatherHour[] = [];
  for (let at = from; at <= to; at += 3600) {
    const samples = rows.map((r: unknown) => {
      if (!r || typeof r !== 'object')
        throw new Error('Неверный ответ метеосервиса.');
      const row = r as {
        hourly?: Record<string, unknown>;
        hourly_units?: Record<string, unknown>;
      };
      const h = row.hourly,
        units = row.hourly_units;
      if (
        !h ||
        !units ||
        units.time !== 'unixtime' ||
        units.precipitation !== 'mm' ||
        units.temperature_2m !== '°C' ||
        units.cloud_cover !== '%' ||
        units.visibility !== 'm' ||
        units.wind_gusts_10m !== 'm/s' ||
        units.wind_speed_10m !== 'm/s' ||
        units[`wind_speed_${q.referenceHeightM}m`] !== 'm/s' ||
        units[`wind_direction_${q.referenceHeightM}m`] !== '°'
      )
        throw new Error('Метеосервис изменил единицы или состав данных.');
      const times = h.time;
      if (!Array.isArray(times) || new Set(times).size !== times.length)
        throw new Error('Некорректная временная сетка прогноза.');
      const i = times.indexOf(at);
      const get = (key: string): number => {
        const values = h[key];
        const v = Array.isArray(values) ? values[i] : null;
        if (i < 0 || typeof v !== 'number' || !Number.isFinite(v))
          throw new Error(
            'В прогнозе пропуски: расчёт по неполным данным запрещён.',
          );
        const min = key === 'temperature_2m' ? -100 : 0;
        const max =
          key === 'temperature_2m'
            ? 80
            : key === 'visibility'
              ? 1000000
              : key === 'cloud_cover'
                ? 100
                : key.startsWith('wind_direction')
                  ? 360
                  : key.startsWith('wind_')
                    ? 150
                    : 1000;
        if (v < min || v > max)
          throw new Error(
            'Метеосервис вернул значение вне ожидаемого диапазона.',
          );
        return v;
      };
      return {
        wind: get(`wind_speed_${q.referenceHeightM}m`),
        ground: get('wind_speed_10m'),
        direction:
          ((Math.round(get(`wind_direction_${q.referenceHeightM}m`)) % 360) +
            360) %
          360,
        gust: get('wind_gusts_10m'),
        rain: get('precipitation'),
        cloud: get('cloud_cover'),
        visibility: get('visibility'),
        temp: get('temperature_2m'),
      };
    });
    const strongest = samples.reduce((a, b) => (b.wind > a.wind ? b : a));
    hours.push({
      at: new Date(at * 1000).toISOString(),
      windMps: strongest.wind,
      fromDeg: strongest.direction,
      gustMps: Math.max(...samples.map((s) => Math.max(s.gust, s.ground))),
      precipitationMm: Math.max(...samples.map((s) => s.rain)),
      cloudPct: Math.max(...samples.map((s) => s.cloud)),
      visibilityM: Math.min(...samples.map((s) => s.visibility)),
      temperatureMinC: Math.min(...samples.map((s) => s.temp)),
      temperatureMaxC: Math.max(...samples.map((s) => s.temp)),
    });
  }
  const snapshot = weatherSnapshotSchema.parse({
    version: '1.0',
    provider: 'Open-Meteo',
    kind: 'forecast',
    fetchedAt,
    ...q,
    hours,
  });
  if (!weatherTimeComplete(snapshot))
    throw new Error('Прогноз не покрывает всё окно миссии.');
  return snapshot;
}

const cache = new Map<string, { until: number; snapshot: WeatherSnapshot }>();
let active = 0,
  requests: number[] = [];
export async function fetchMissionForecast(
  q: WeatherRequest,
): Promise<WeatherSnapshot> {
  const now = Date.now(),
    url = forecastUrl(q, now),
    key = JSON.stringify(q);
  const hit = cache.get(key);
  if (hit && hit.until > now) return structuredClone(hit.snapshot);
  requests = requests.filter((t) => now - t < 60000);
  if (active >= 2 || requests.length >= 10)
    throw new Error('Слишком много обновлений погоды. Повторите через минуту.');
  requests.push(now);
  active++;
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok)
      throw new Error(
        `Метеосервис недоступен (${response.status}). Сохранённые условия не заменены.`,
      );
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Пустой ответ метеосервиса.');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 2000000) {
          await reader.cancel();
          throw new Error('Слишком большой ответ метеосервиса.');
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const c of chunks) {
      body.set(c, offset);
      offset += c.length;
    }
    const snapshot = normalizeForecast(
      JSON.parse(new TextDecoder().decode(body)),
      q,
      new Date(now).toISOString(),
    );
    if (cache.size >= 20) cache.delete(cache.keys().next().value!);
    cache.set(key, { until: now + 5 * 60000, snapshot });
    return snapshot;
  } finally {
    active--;
  }
}
