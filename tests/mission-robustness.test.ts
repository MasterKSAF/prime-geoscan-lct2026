import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import {
  analyzeMissionRobustness,
  MAX_ROBUSTNESS_REQUEST_BYTES,
} from '../lib/planner/mission-robustness.ts';
import type { MissionRobustnessReport } from '../lib/planner/mission-robustness.ts';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { sha256 } from '../lib/planner/mission-schema.ts';
import type { MissionDocument } from '../lib/planner/mission-schema.ts';
import {
  weatherFootprint,
  weatherHeight,
  weatherPoints,
} from '../lib/planner/mission-weather.ts';

const fixture = (async () => {
  const document = SHOWCASE_SCENARIOS.find(
    (s) => s.id === 'repeat-sorties',
  )!.create();
  const result = await solveMissionDocument(document);
  assert.equal(result.candidates[0].status, 'feasible_model');
  return { document, candidate: result.candidates[0] };
})();
const unmodified = { id: 'unchanged', label: 'Без изменений' };
const closeTo = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`);

void test('robustness independently verifies original, binds complete candidate and never changes input', async () => {
  const source = await fixture;
  const before = JSON.stringify(source);
  const report = await analyzeMissionRobustness({
    ...source,
    perturbations: [unmodified],
  });
  assert.equal(report.baseline.status, 'verified');
  assert.equal(report.inputHash, await sha256(source.document));
  assert.equal(report.planHash, await sha256(source.candidate));
  assert.equal(report.cases[0].status, 'safe');
  assert.equal(report.flightReady, false);
  assert.ok(report.cases[0].unknownChecks.some((c) => c.id === 'CALIBRATION'));
  assert.equal(JSON.stringify(source), before);
  const metrics = report.cases[0].metrics!;
  closeTo(metrics.makespanSec, source.candidate.metrics.makespanSec);
  closeTo(metrics.flightTimeSec, source.candidate.metrics.flightTimeSec);
  closeTo(
    metrics.minRemainingPct,
    source.candidate.metrics.minimumRemainingPct,
  );
});

void test('SOC loss is applied once to installed battery and carried across all three flights', async () => {
  const source = await fixture;
  assert.equal(source.candidate.sorties.length, 3);
  const report = await analyzeMissionRobustness({
    ...source,
    perturbations: [
      { id: 'loss', label: 'Меньше заряда', batteryReductionPct: 10 },
      unmodified,
    ],
  });
  assert.equal(report.cases[0].status, 'safe');
  closeTo(
    report.cases[0].metrics!.minRemainingPct,
    source.candidate.metrics.minimumRemainingPct - 10,
  );
  closeTo(
    report.cases[1].metrics!.minRemainingPct,
    source.candidate.metrics.minimumRemainingPct,
  );
  closeTo(
    report.cases[0].metrics!.flightTimeSec,
    source.candidate.metrics.flightTimeSec,
  );
});

void test('reduced available SOC reports reserve violation, never a fabricated replacement', async () => {
  const report = await analyzeMissionRobustness({
    ...(await fixture),
    perturbations: [
      { id: 'loss', label: 'Недостаток ресурса', batteryReductionPct: 40 },
    ],
  });
  assert.equal(report.cases[0].status, 'unsafe_in_model');
  assert.ok(report.cases[0].failedChecks.some((c) => c.id === 'ENERGY'));
  assert.ok(report.cases[0].metrics!.reserveMarginPct < 0);
});

void test('uniform delay retains original deadline and costs no airborne battery on ground', async () => {
  const source = await fixture;
  const report = await analyzeMissionRobustness({
    ...source,
    perturbations: [{ id: 'late', label: 'Позже', startDelaySec: 300 }],
  });
  const metrics = report.cases[0].metrics!;
  assert.equal(report.cases[0].status, 'safe');
  closeTo(metrics.makespanSec, source.candidate.metrics.makespanSec + 300);
  closeTo(metrics.flightTimeSec, source.candidate.metrics.flightTimeSec);
  closeTo(
    metrics.minRemainingPct,
    source.candidate.metrics.minimumRemainingPct,
  );
});

void test('delay crossing the deadline fails WINDOW although the baseline still passes', async () => {
  const source = await fixture;
  const document = structuredClone(source.document);
  document.window.end = new Date(
    Date.parse(document.window.start) +
      Math.ceil(source.candidate.metrics.makespanSec + 20) * 1000,
  ).toISOString();
  const result = await solveMissionDocument(document);
  assert.equal(result.candidates[0].status, 'feasible_model');
  const report = await analyzeMissionRobustness({
    document,
    candidate: result.candidates[0],
    perturbations: [
      { id: 'late', label: 'Нарушение срока', startDelaySec: 300 },
    ],
  });
  assert.equal(report.baseline.status, 'verified');
  assert.equal(report.cases[0].status, 'unsafe_in_model');
  assert.ok(report.cases[0].failedChecks.some((c) => c.id === 'WINDOW'));
  assert.ok(report.cases[0].metrics!.deadlineMarginSec < 0);
});

void test('start delay rechecks absolute 4D restriction intervals instead of shifting the restrictions', async () => {
  const source = await fixture;
  const document = structuredClone(source.document);
  const flight = source.candidate.sorties[0];
  const survey = flight.segments.find((s) => s.phase === 'survey')!;
  const at = Date.parse(document.window.start);
  document.restrictions.push({
    id: 'future-work-zone',
    name: 'Закрытие области во время задержанного вылета',
    kind: 'noFlight',
    geometry: structuredClone(
      document.jobs.find((job) => job.id === flight.jobId)!.area,
    ),
    minAltitudeM: 0,
    maxAltitudeM: 6000,
    startAt: new Date(at + (survey.startSec + 1200 - 20) * 1000).toISOString(),
    endAt: new Date(at + (survey.endSec + 1200 + 20) * 1000).toISOString(),
    source:
      'Synthetic temporal restriction for regression; not official airspace.',
  });
  const result = await solveMissionDocument(document);
  assert.equal(result.candidates[0].status, 'feasible_model');
  const report = await analyzeMissionRobustness({
    document,
    candidate: result.candidates[0],
    perturbations: [
      { id: 'late', label: 'Вылет после закрытия зоны', startDelaySec: 1200 },
    ],
  });
  assert.equal(report.baseline.status, 'verified');
  assert.equal(report.cases[0].status, 'unsafe_in_model');
  assert.ok(
    report.cases[0].failedChecks.some((c) => c.id === 'FOUR_DIMENSIONAL'),
  );
});

void test('changed wind recomputes duration and carried energy for the same constant-airspeed route', async () => {
  const source = await fixture;
  const document = structuredClone(source.document);
  document.planning.windModel = 'constantAirspeed';
  const result = await solveMissionDocument(document);
  assert.equal(result.candidates[0].status, 'feasible_model');
  const report = await analyzeMissionRobustness({
    document,
    candidate: result.candidates[0],
    perturbations: [
      { id: 'wind', label: 'Другой ветер', windSpeedDeltaMps: 1 },
    ],
  });
  assert.equal(report.baseline.status, 'verified');
  assert.equal(report.cases[0].status, 'safe');
  assert.ok(
    report.cases[0].metrics!.flightTimeSec >
      result.candidates[0].metrics.flightTimeSec,
  );
  assert.ok(
    report.cases[0].metrics!.minRemainingPct <
      result.candidates[0].metrics.minimumRemainingPct,
  );
});

void test('wind over the selected vehicle limit fails; impossible kinematics never produces NaN', async () => {
  const report = await analyzeMissionRobustness({
    ...(await fixture),
    perturbations: [
      { id: 'wind', label: 'Сильный ветер', windSpeedDeltaMps: 10 },
    ],
  });
  assert.equal(report.cases[0].status, 'unsafe_in_model');
  assert.ok(report.cases[0].failedChecks.some((c) => c.id === 'COMPATIBILITY'));
  assert.equal(report.cases[0].metrics, null);
  assert.ok(report.cases[0].unknownChecks.length);
  const visit = (v: unknown): void => {
    if (typeof v === 'number') assert.ok(Number.isFinite(v));
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(report);
});

void test('altered metrics, altered route and altered input all reject before stress evaluation', async () => {
  for (const mutate of [
    (v: Awaited<typeof fixture>) => {
      v.candidate.metrics.flightTimeSec += 10;
    },
    (v: Awaited<typeof fixture>) => {
      v.candidate.sorties[0].segments[0].from[0] += 0.01;
    },
    (v: Awaited<typeof fixture>) => {
      v.document.name += ' revised';
    },
  ]) {
    const source = structuredClone(await fixture);
    mutate(source);
    const report = await analyzeMissionRobustness({
      ...source,
      perturbations: [unmodified],
    });
    assert.equal(report.baseline.status, 'rejected');
    assert.ok(report.baseline.failedChecks.length);
    assert.equal(report.cases[0].status, 'not_checked');
    assert.equal(report.cases[0].metrics, null);
  }
});

void test('partial, legacy battery and fixed-wing stress scope never appear safe', async () => {
  for (const mutate of [
    (v: Awaited<typeof fixture>) => {
      v.candidate.status = 'partial';
    },
    (v: Awaited<typeof fixture>) => {
      delete v.document.planning.batteryPolicy;
    },
    (v: Awaited<typeof fixture>) => {
      v.document.scenario.vehicles[0].kind = 'fixedWing';
    },
  ]) {
    const source = structuredClone(await fixture);
    mutate(source);
    const report = await analyzeMissionRobustness({
      ...source,
      perturbations: [unmodified],
    });
    assert.equal(report.baseline.status, 'not_checked');
    assert.equal(report.cases[0].status, 'not_checked');
    assert.ok(report.cases[0].detail.length);
  }
});

void test('request limits reject nonfinite values, duplicate cases, unknown fields and large route shapes', async () => {
  const source = await fixture;
  const malformed: unknown[] = [
    { ...source, untrusted: true },
    { ...source, maxComputeMs: Infinity },
    { ...source, perturbations: [unmodified, unmodified] },
    { ...source, perturbations: [{ ...unmodified, batteryReductionPct: -5 }] },
    { ...source, perturbations: [{ ...unmodified, windSpeedDeltaMps: NaN }] },
    {
      ...source,
      perturbations: Array.from({ length: 7 }, (_, i) => ({
        id: `case-${i}`,
        label: 'Много',
      })),
    },
    {
      ...source,
      candidate: {
        ...source.candidate,
        sorties: Array(61).fill(source.candidate.sorties[0]),
      },
    },
  ];
  for (const request of malformed)
    await assert.rejects(() => analyzeMissionRobustness(request));
});

void test('budget exhaustion gives not_checked, not a fabricated success', async (t) => {
  const source = await fixture;
  let calls = 0;
  t.mock.method(performance, 'now', () => (calls++ ? 101 : 0));
  const report = await analyzeMissionRobustness({
    ...source,
    maxComputeMs: 100,
    perturbations: [unmodified],
  });
  assert.equal(report.baseline.status, 'not_checked');
  assert.equal(report.cases[0].status, 'not_checked');
  assert.equal(report.budgetExhausted, true);
});

void test('forecast remains unchanged while the explicitly increased gust is checked', async () => {
  const source = await fixture;
  const document: MissionDocument = structuredClone(source.document);
  document.planning.windModel = 'constantAirspeed';
  const start = Date.parse(document.window.start);
  const end = Date.parse(document.window.end);
  const beginHour = Math.floor(start / 3600000) * 3600000;
  const endHour = Math.ceil(end / 3600000) * 3600000;
  document.weather = {
    snapshot: {
      version: '1.0',
      provider: 'Open-Meteo',
      kind: 'forecast',
      fetchedAt: document.window.start,
      start: document.window.start,
      end: document.window.end,
      footprint: weatherFootprint(document),
      referenceHeightM: weatherHeight(document),
      points: weatherPoints(document),
      hours: Array.from(
        { length: (endHour - beginHour) / 3600000 + 1 },
        (_, i) => ({
          at: new Date(beginHour + i * 3600000).toISOString(),
          windMps: document.scenario.wind.speedMps,
          fromDeg: document.scenario.wind.fromDeg,
          gustMps: document.scenario.vehicles[0].maxWindMps,
          precipitationMm: 0,
          cloudPct: 0,
          visibilityM: 10000,
          temperatureMinC: 15,
          temperatureMaxC: 16,
        }),
      ),
    },
    limits: {
      maxPrecipitationMm: 1,
      maxCloudPct: 100,
      minVisibilityM: 1000,
      source: 'Synthetic test fixture; not a real forecast.',
    },
  };
  const result = await solveMissionDocument(document);
  assert.equal(result.candidates[0].status, 'feasible_model');
  const savedWeather = JSON.stringify(document.weather);
  const report = await analyzeMissionRobustness({
    document,
    candidate: result.candidates[0],
    perturbations: [
      { id: 'gust', label: 'Усиление ветра и порывов', windSpeedDeltaMps: 1 },
    ],
  });
  assert.equal(report.baseline.status, 'verified');
  assert.equal(report.cases[0].status, 'unsafe_in_model');
  assert.ok(
    report.cases[0].failedChecks.some((c) => c.id === 'STRESS_FORECAST_GUST'),
  );
  assert.ok(
    !report.cases[0].failedChecks.some((c) => c.id === 'FORECAST_APPLIED_WIND'),
  );
  assert.equal(JSON.stringify(document.weather), savedWeather);
});

async function loadPost() {
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      return nextResolve(
        specifier.startsWith('@/')
          ? new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href
          : specifier,
        context,
      );
    },
  });
  try {
    return (await import('../app/api/planner/missions/analyze/route.ts')).POST;
  } finally {
    hook.deregister();
  }
}
const POST = await loadPost();
const url = 'http://localhost/api/planner/missions/analyze';

void test('analysis API returns bounded report, rejects duplicate JSON and strict schema', async () => {
  const source = await fixture;
  const headers = { 'Content-Type': 'application/json' };
  const response = await POST(
    new Request(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...source, perturbations: [unmodified] }),
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(
    ((await response.json()) as MissionRobustnessReport).baseline.status,
    'verified',
  );
  for (const body of ['{"document":{},"document":{}}', '{"__proto__":{}}']) {
    const rejected = await POST(
      new Request(url, { method: 'POST', headers, body }),
    );
    assert.equal(rejected.status, 400);
    assert.equal(((await rejected.json()) as { code: string }).code, 'JSON');
  }
  const extra = await POST(
    new Request(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...source, untrusted: true }),
    }),
  );
  assert.equal(extra.status, 400);
  assert.equal(((await extra.json()) as { code: string }).code, 'SCHEMA');
});

void test('analysis API protects content type, cross origin, byte limit and stalled upload', async (t) => {
  assert.equal(
    (await POST(new Request(url, { method: 'POST', body: '{}' }))).status,
    415,
  );
  assert.equal(
    (
      await POST(
        new Request(url, {
          method: 'POST',
          headers: {
            Origin: 'https://other.example',
            'Content-Type': 'application/json',
          },
          body: '{}',
        }),
      )
    ).status,
    403,
  );
  const large = await POST(
    new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: ' '.repeat(MAX_ROBUSTNESS_REQUEST_BYTES + 1),
    }),
  );
  assert.equal(large.status, 413);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull() {
        return new Promise<void>(() => {});
      },
      cancel() {
        cancelled = true;
        return new Promise<void>(() => {});
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stream,
    duplex: 'half',
  } as RequestInit);
  const pending = POST(request);
  t.mock.timers.tick(5000);
  assert.equal((await pending).status, 408);
  assert.equal(cancelled, true);
  assert.equal(request.body!.locked, false);
});
