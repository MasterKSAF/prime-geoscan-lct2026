import assert from 'node:assert/strict';
import test from 'node:test';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { missionSummaryMarkdown } from '../lib/planner/mission-io.ts';
import { missionPassportHtml } from '../lib/planner/mission-passport.ts';
import {
  missionWeatherChecks,
  weatherAltitudeRange,
  weatherFootprint,
  weatherHeight,
  weatherMatches,
  weatherPoints,
  type WeatherSnapshot,
} from '../lib/planner/mission-weather.ts';

function fixture() {
  const d = demoMission();
  d.jobs[0].quality.altitudeMode = 'gsd';
  d.jobs[0].quality.maximumGsdCm = 2;
  // Deliberate legacy trap: this geometry cannot supply a valid survey altitude.
  d.jobs[0].quality.focalLengthMm = 1;
  for (const [i, v] of d.scenario.vehicles.entries()) {
    const camera = v.cameraProfiles![0];
    camera.id = `synthetic-camera-${i}`;
    camera.name = 'Synthetic regression optics, not a hardware claim';
    camera.status = 'assumed';
    camera.focalLengthMm = i === 0 ? 10 : 20;
    v.cameraIds = [camera.id];
  }
  return d;
}

function snapshot(d: ReturnType<typeof fixture>): WeatherSnapshot {
  const start = Date.parse(d.window.start),
    end = Date.parse(d.window.end);
  return {
    version: '1.0',
    provider: 'Open-Meteo',
    kind: 'forecast',
    fetchedAt: d.window.start,
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
}

void test('input readouts leave camera-dependent GSD height and swath unresolved', () => {
  const d = fixture(),
    before = JSON.stringify(d);
  const summary = missionSummaryMarkdown(d).split(
    '## Полный состав задания',
  )[0];
  assert.match(summary, /высота по камере — будет рассчитана после назначения/);
  assert.match(summary, /полоса по камере — будет рассчитана после назначения/);
  assert.doesNotMatch(summary, /100 м \(по GSD\)|5\.106 м/);
  const table = missionPassportHtml(d).split('</table>')[0];
  assert.match(table, /По камере — будет рассчитана после назначения/);
  assert.doesNotMatch(table, /<td>5\.106 м|<td>100 м/);
  assert.equal(JSON.stringify(d), before);
  d.jobs[0].quality.altitudeMode = 'fixed';
  assert.match(missionSummaryMarkdown(d), /100 м \(заданная высота\)/);
  assert.match(missionPassportHtml(d), /100 м \(заданная\)/);
});

void test('weather spans compatible installed optics, not legacy work optics or first vehicle', () => {
  const d = fixture(),
    before = JSON.stringify(d);
  assert.deepEqual(weatherAltitudeRange(d), {
    minimumM: 51.063,
    maximumM: 102.127,
    unresolvedJobIds: [],
  });
  assert.equal(weatherHeight(d), 120);
  d.scenario.vehicles.reverse();
  assert.equal(weatherHeight(d), 120);
  d.scenario.vehicles.reverse();
  assert.equal(JSON.stringify(d), before);
  d.scenario.vehicles[1].enabled = false;
  assert.equal(weatherHeight(d), 80);
  d.scenario.vehicles[1].enabled = true;
  d.jobs[0].assignedVehicleIds = [d.scenario.vehicles[0].id];
  assert.equal(weatherHeight(d), 80);
});

void test('bound candidate weather height uses only its actual camera and never falls back', () => {
  const d = fixture(),
    vehicle = d.scenario.vehicles[0];
  const bound = {
    jobCoverage: [
      {
        jobId: d.jobs[0].id,
        cameraVehicleId: vehicle.id,
        cameraProfileId: vehicle.cameraIds![0],
        bearingDeg: 0,
        grossAreaHa: 100,
        targetAreaHa: 100,
        coveragePct: 99,
        grossCoveragePct: 99,
      },
    ],
  };
  assert.deepEqual(weatherAltitudeRange(d, bound), {
    minimumM: 51.063,
    maximumM: 51.063,
    unresolvedJobIds: [],
  });
  assert.equal(weatherHeight(d, bound), 80);
  bound.jobCoverage[0].cameraProfileId = 'wrong-camera';
  assert.deepEqual(weatherAltitudeRange(d, bound), {
    minimumM: null,
    maximumM: null,
    unresolvedJobIds: [d.jobs[0].id],
  });
});

void test('unresolved or incompatible camera altitude cannot pass forecast scope or height', () => {
  const d = fixture(),
    s = snapshot(d);
  assert.equal(weatherMatches(d, s), true);
  for (const v of d.scenario.vehicles)
    v.cameraProfiles![0].supportedModels = ['801'];
  assert.deepEqual(weatherAltitudeRange(d), {
    minimumM: null,
    maximumM: null,
    unresolvedJobIds: [d.jobs[0].id],
  });
  assert.equal(
    weatherHeight(d),
    120,
    'request fallback is the declared ceiling, not a camera height',
  );
  assert.equal(weatherMatches(d, s), false);
  d.weather = {
    snapshot: s,
    limits: {
      maxPrecipitationMm: 0,
      maxCloudPct: 20,
      minVisibilityM: 1000,
      source: 'Synthetic regression limits, not an operational certificate',
    },
  };
  const checks = missionWeatherChecks(d, []);
  assert.equal(checks.find((c) => c.id === 'FORECAST_SCOPE')?.status, 'fail');
  assert.equal(
    checks.find((c) => c.id === 'FORECAST_HEIGHT')?.status,
    'unknown',
  );
});
