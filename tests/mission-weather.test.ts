import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { parseMissionDocument, sha256 } from '../lib/planner/mission-schema.ts';
import {
  applyMissionWeather,
  weatherFootprint,
  weatherPoints,
  weatherHeight,
  weatherTimeComplete,
  missionWeatherChecks,
  type WeatherSnapshot,
} from '../lib/planner/mission-weather.ts';
import {
  forecastUrl,
  normalizeForecast,
  weatherRequestSchema,
} from '../lib/planner/weather-provider.ts';
import {
  serializeMissionJson,
  parseMissionText,
} from '../lib/planner/mission-io.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { validateExportedCandidate } from '../lib/planner/mission-validation.ts';

function fixture() {
  const d = demoMission(1),
    start = Date.parse(d.window.start),
    end = Date.parse(d.window.end);
  const s: WeatherSnapshot = {
    version: '1.0',
    provider: 'Open-Meteo',
    kind: 'forecast',
    fetchedAt: '2026-09-19T12:00:00Z',
    start: d.window.start,
    end: d.window.end,
    footprint: weatherFootprint(d),
    points: weatherPoints(d),
    referenceHeightM: weatherHeight(d),
    hours: Array.from({ length: (end - start) / 3600000 + 1 }, (_, i) => ({
      at: new Date(start + i * 3600000).toISOString(),
      windMps: 2,
      fromDeg: 270,
      gustMps: 3,
      precipitationMm: 0,
      cloudPct: 0,
      visibilityM: 10000,
      temperatureMinC: 10,
      temperatureMaxC: 11,
    })),
  };
  const limits = {
    maxPrecipitationMm: 0,
    maxCloudPct: 20,
    minVisibilityM: 1000,
    source: 'Synthetic test thresholds, not legal minima',
  };
  return { d, s, limits };
}
void test('weather optional field preserves legacy hashes and round-trips complete snapshots', async () => {
  const { d, s, limits } = fixture();
  assert.equal('weather' in parseMissionDocument(d), false);
  assert.equal(await sha256(d), await sha256(parseMissionDocument(d)));
  const next = applyMissionWeather(d, { snapshot: s, limits });
  assert.deepEqual(parseMissionText(serializeMissionJson(next)), next);
  assert.notEqual(await sha256(d), await sha256(next));
  assert.ok(Buffer.byteLength(serializeMissionJson(next)) < 200 * 1024);
});
void test('forecast URL is pinned, SI/UTC, future bounded and cannot be overridden', () => {
  const { s } = fixture();
  const {
    version: _,
    provider: __,
    kind: ___,
    fetchedAt: ____,
    hours: _____,
    ...q
  } = s;
  const url = forecastUrl(q, Date.parse('2026-09-19T12:00:00Z'));
  assert.equal(url.host, 'api.open-meteo.com');
  assert.equal(url.searchParams.get('wind_speed_unit'), 'ms');
  assert.equal(url.searchParams.get('timezone'), 'GMT');
  assert.equal(url.searchParams.get('latitude')?.split(',').length, 5);
  assert.throws(() =>
    forecastUrl(
      { ...q, end: '2026-10-01T12:00:00Z' },
      Date.parse('2026-09-19'),
    ),
  );
  assert.throws(() => forecastUrl(q, Date.parse('2026-10-01')));
  assert.throws(() =>
    weatherRequestSchema.parse({ ...q, url: 'http://localhost/private' }),
  );
});
void test('normalizer verifies units, gaps and nulls; keeps final accumulated hour and uses worst points', () => {
  const { s } = fixture();
  const {
    version: _,
    provider: __,
    kind: ___,
    fetchedAt: ____,
    hours: _____,
    ...q
  } = s;
  const raw = q.points.map((_, n) => ({
    hourly_units: {
      time: 'unixtime',
      temperature_2m: '°C',
      precipitation: 'mm',
      cloud_cover: '%',
      visibility: 'm',
      wind_gusts_10m: 'm/s',
      wind_speed_10m: 'm/s',
      wind_speed_80m: 'm/s',
      wind_direction_80m: '°',
    },
    hourly: {
      time: s.hours.map((h) => Date.parse(h.at) / 1000),
      temperature_2m: s.hours.map(() => 10 + n),
      precipitation: s.hours.map((_, i) => (i === s.hours.length - 1 ? n : 0)),
      cloud_cover: s.hours.map(() => n * 10),
      visibility: s.hours.map(() => 10000 - n * 1000),
      wind_gusts_10m: s.hours.map(() => 3 + n),
      wind_speed_10m: s.hours.map(() => 2),
      wind_speed_80m: s.hours.map(() => 2 + n),
      wind_direction_80m: s.hours.map(() => 360),
    },
  }));
  const result = normalizeForecast(raw, q, s.fetchedAt);
  assert.equal(result.hours.at(-1)?.precipitationMm, 4);
  assert.equal(result.hours[0].fromDeg, 0);
  assert.equal(result.hours[0].windMps, 6);
  assert.equal(result.hours[0].visibilityM, 6000);
  const wrong = structuredClone(raw);
  wrong[0].hourly_units.wind_speed_80m = 'km/h';
  assert.throws(() => normalizeForecast(wrong, q, s.fetchedAt));
  const gap = structuredClone(raw);
  const corrupt = structuredClone(raw);
  corrupt[0].hourly.wind_speed_80m[0] = -1;
  assert.throws(() => normalizeForecast(corrupt, q, s.fetchedAt));
  gap[0].hourly.time.pop();
  assert.throws(() => normalizeForecast(gap, q, s.fetchedAt));
  const nil = structuredClone(raw) as unknown as {
    hourly: { visibility: (number | null)[] };
  }[];
  nil[0].hourly.visibility[0] = null;
  assert.throws(() => normalizeForecast(nil, q, s.fetchedAt));
  assert.throws(() => normalizeForecast(raw.slice(1), q, s.fetchedAt));
});
void test('missing hours, changed footprint/time/height and mismatched manual wind cannot pass', () => {
  const { d, s, limits } = fixture();
  const next = applyMissionWeather(d, { snapshot: s, limits });
  assert.ok(weatherTimeComplete(s));
  assert.equal(
    missionWeatherChecks(
      { ...next, weather: { snapshot: { ...s, points: [[0, 0]] }, limits } },
      [],
    ).find((c) => c.id === 'FORECAST_SCOPE')?.status,
    'fail',
  );
  assert.equal(weatherTimeComplete({ ...s, hours: s.hours.slice(1) }), false);
  for (const change of ['area', 'time', 'altitude'] as const) {
    const forged = structuredClone(next);
    if (change === 'area') forged.jobs[0].area.coordinates[0][0][0] += 0.01;
    if (change === 'time') forged.window.end = '2026-09-24T19:00:00+03:00';
    if (change === 'altitude') forged.jobs[0].job.altitudeM = 180;
    assert.equal(
      missionWeatherChecks(forged, []).find((c) => c.id === 'FORECAST_SCOPE')
        ?.status,
      'fail',
    );
  }
  next.scenario.wind.speedMps = 0;
  assert.equal(
    missionWeatherChecks(next, []).find((c) => c.id === 'FORECAST_APPLIED_WIND')
      ?.status,
    'fail',
  );
  assert.throws(() =>
    applyMissionWeather(d, {
      snapshot: { ...s, hours: s.hours.map((h) => ({ ...h, windMps: 31 })) },
      limits,
    }),
  );
});
void test('rain, cloud, gust and visibility cannot produce an approved feasible result; evidence repeats checks', async () => {
  const { d, s, limits } = fixture();
  const next = applyMissionWeather(d, { snapshot: s, limits });
  const good = (await solveMissionDocument(next)).candidates[0];
  assert.equal(good.status, 'feasible_model');
  assert.deepEqual(
    (await validateExportedCandidate(next, good)).filter(
      (c) => c.status === 'fail',
    ),
    [],
  );
  for (const [field, value, id] of [
    ['precipitationMm', 1, 'FORECAST_RAIN'],
    ['cloudPct', 90, 'FORECAST_CLOUD'],
    ['gustMps', 20, 'FORECAST_WIND_LIMIT'],
    ['visibilityM', 100, 'FORECAST_VISIBILITY'],
  ] as const) {
    const bad = applyMissionWeather(d, {
      snapshot: { ...s, hours: s.hours.map((h) => ({ ...h, [field]: value })) },
      limits,
    });
    const result = await solveMissionDocument(bad);
    assert.ok(
      result.candidates.every((c) => c.status !== 'feasible_model'),
      field,
    );
    assert.ok(
      result.candidates.every((c) =>
        c.checks.some((c) => c.id === id && c.status === 'fail'),
      ),
      id,
    );
    assert.equal(result.recommendation, undefined);
    assert.equal(
      (await validateExportedCandidate(bad, result.candidates[0])).find(
        (c) => c.id === 'SAVED_CHECKS',
      )?.status,
      'pass',
      field,
    );
    assert.ok(
      (await validateExportedCandidate(bad, good)).some(
        (c) => c.id === id && c.status === 'fail',
      ),
    );
  }
});
void test('forecast verification is deterministic and no wall-clock network check changes old evidence', () => {
  const { d, s, limits } = fixture();
  const next = applyMissionWeather(d, { snapshot: s, limits });
  assert.deepEqual(
    missionWeatherChecks(next, []),
    missionWeatherChecks(structuredClone(next), []),
  );
  assert.equal(
    missionWeatherChecks(next, []).find((c) => c.id === 'FORECAST_LIMITATIONS')
      ?.status,
    'unknown',
  );
});
