import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoScenario } from '../lib/planner/demo.ts';
import { groundSpeed, solve, validatePlan } from '../lib/planner/engine.ts';
import {
  area,
  inside,
  prepareGeometry,
  projection,
  router,
  segmentInside,
} from '../lib/planner/geometry.ts';
import { evidenceBundle, toGeoJSON, toKML } from '../lib/planner/export.ts';
import { parseScenario } from '../lib/planner/schema.ts';
import type { Plan, Scenario } from '../lib/planner/schema.ts';

test('coordinates: local projection round trip and metre scale', () => {
  const p = projection([30, 60]);
  const v = p.inverse(p.forward([30.01, 60.01]));
  assert.ok(Math.abs(v[0] - 30.01) < 1e-10);
  assert.ok(Math.abs(p.forward([30.01, 60])[0] - 556) < 1);
});
test('wind: headwind, tailwind and crab correction', () => {
  assert.equal(
    groundSpeed([0, 0], [0, 100], 10, { speedMps: 3, fromDeg: 0 }),
    7,
  );
  assert.equal(
    groundSpeed([0, 0], [0, 100], 10, { speedMps: 3, fromDeg: 180 }),
    13,
  );
  assert.ok(
    Math.abs(
      groundSpeed([0, 0], [100, 0], 10, { speedMps: 6, fromDeg: 0 }) - 8,
    ) < 1e-8,
  );
  assert.throws(
    () => groundSpeed([0, 0], [100, 0], 4, { speedMps: 5, fromDeg: 0 }),
    /ветер/,
  );
});
test('polygon crossing: vertices valid but segment through forbidden island is invalid', () => {
  const s = demoScenario(),
    g = prepareGeometry(s),
    hole = s.exclusions[0].coordinates[0];
  const left = g.forward([hole[0][0] - 0.002, (hole[0][1] + hole[2][1]) / 2]),
    right = g.forward([hole[1][0] + 0.002, (hole[0][1] + hole[2][1]) / 2]);
  assert.ok(inside(left, g.free) && inside(right, g.free));
  assert.equal(segmentInside(left, right, g.free), false);
  const detour = router(g)(left, right);
  assert.ok(detour && detour.length > 2);
  assert.ok(
    detour.slice(1).every((p, i) => segmentInside(detour[i], p, g.free)),
  );
});
test('demo: all strips, endpoints, time, reserve and geometric coverage checked', () => {
  const p = solve(demoScenario());
  assert.equal(p.status, 'undetermined');
  assert.ok(p.missions.length >= 1);
  assert.ok(p.metrics.coveragePct >= 99);
  assert.equal(p.checks.filter((c) => c.status === 'fail').length, 0);
  assert.ok(p.checks.some((c) => c.id === 'TERRAIN' && c.status === 'unknown'));
  assert.ok(p.missions.every((m) => m.remainingPct >= p.scenario.reservePct));
  assert.ok(p.metrics.targetHa < p.metrics.areaHa);
});
test('deterministic result independent of wall-clock metadata', () => {
  const a = solve(demoScenario()),
    b = solve(demoScenario());
  assert.deepEqual(a.metrics, b.metrics);
  assert.deepEqual(a.missions, b.missions);
});
test('two criteria both execute; sum-of-flight-times is not distance', () => {
  const s = demoScenario();
  s.objective = 'flightTime';
  const p = solve(s);
  assert.ok(p.metrics.flightTimeSec >= p.metrics.makespanSec);
  assert.ok(Math.abs(p.metrics.flightTimeSec - p.metrics.distanceM) > 1);
});
test('optimizer does not worsen a feasible baseline on selected criterion', () => {
  const s = demoScenario();
  s.vehicles.forEach((v) => (v.effectiveEnduranceMin = 60));
  for (const criterion of ['flightTime', 'makespan'] as const) {
    s.objective = criterion;
    const p = solve(s);
    assert.ok(p.baseline);
    const k = criterion === 'flightTime' ? 'flightTimeSec' : 'makespanSec';
    assert.ok(p.metrics[k] <= p.baseline[k] + 1e-8);
  }
});
test('incompatible job, unsupported payload and fixed wing fail closed', () => {
  const s = demoScenario();
  s.job.type = 'IR';
  assert.throws(() => solve(s), /не поддерживает/);
  s.job.type = 'Geophysics';
  assert.throws(() => solve(s), /профиль сенсора/);
  s.job.type = 'RGB';
  s.vehicles[3].enabled = true;
  assert.throws(() => solve(s), /201/);
});
test('battery, wind and empty fleet rejected', () => {
  const s = demoScenario();
  s.vehicles[0].batteryPct = 10;
  assert.throws(() => solve(s), /заряд/);
  s.vehicles[0].batteryPct = 100;
  s.wind.speedMps = 20;
  assert.throws(() => solve(s), /Ветер/);
  s.wind.speedMps = 3;
  s.vehicles.forEach((v) => (v.enabled = false));
  assert.throws(() => solve(s), /хотя бы/);
});
test('tiny endurance cannot produce a full mission', () => {
  const s = demoScenario();
  s.vehicles.forEach((v) => (v.effectiveEnduranceMin = 1));
  assert.throws(() => solve(s), /не найден/);
});
test('schema rejects malformed, excessive and unknown data', () => {
  assert.throws(() =>
    parseScenario({ ...demoScenario(), secret: 'not allowed' }),
  );
  const s = demoScenario();
  s.wind.speedMps = NaN;
  assert.throws(() => parseScenario(s));
  s.wind.speedMps = 3;
  s.vehicles[1].id = s.vehicles[0].id;
  assert.throws(() => parseScenario(s), /уникальны/);
});
test('self-intersection and distant coordinates rejected', () => {
  const s = demoScenario();
  s.area.coordinates = [
    [
      [30, 60],
      [30.01, 60.01],
      [30.01, 60],
      [30, 60.01],
      [30, 60],
    ],
  ];
  assert.throws(() => solve(s));
  const far = demoScenario();
  far.vehicles[0].start = [31, 61];
  assert.throws(() => solve(far), /15 км/);
});
test('start in no-fly zone rejected', () => {
  const s = demoScenario();
  s.vehicles[0].start = s.exclusions[0].coordinates[0][0];
  assert.throws(() => solve(s), /Точка старта/);
});
test('validator detects forged energy, time, endpoint and strip omissions', () => {
  const s = demoScenario(),
    p = solve(s),
    m = structuredClone(p.missions);
  m[0].remainingPct = 99;
  m[0].segments[1].endSec += 50;
  let checked = validatePlan(s, m, p.metrics.stripCount);
  assert.ok(checked.checks.find((c) => c.id === 'ENERGY')?.status === 'fail');
  assert.ok(checked.checks.find((c) => c.id === 'TIME')?.status === 'fail');
  m[0].segments[0].from = [30.29, 60.036];
  checked = validatePlan(s, m, p.metrics.stripCount);
  assert.equal(
    checked.checks.find((c) => c.id === 'ENDPOINTS')?.status,
    'fail',
  );
  checked = validatePlan(s, p.missions.slice(1), p.metrics.stripCount);
  assert.equal(checked.checks.find((c) => c.id === 'STRIPS')?.status, 'fail');
});
test('GeoJSON round trip includes ordered phases and explicit non-geodetic heights', () => {
  const p = {
    ...solve(demoScenario()),
    inputHash: 'test',
    createdAt: '2026-09-15T00:00:00Z',
  } as Plan;
  const geo = JSON.parse(JSON.stringify(toGeoJSON(p)));
  const segments = geo.features.filter(
    (f: { properties: { kind: string } }) => f.properties.kind === 'segment',
  );
  assert.equal(
    segments.length,
    p.missions.reduce((a, m) => a + m.segments.length, 0),
  );
  for (const m of p.missions) {
    const restored = segments.filter(
      (f: { properties: { vehicleId: string } }) =>
        f.properties.vehicleId === m.vehicleId,
    );
    restored.forEach(
      (
        f: {
          geometry: { coordinates: number[][] };
          properties: { sequence: number; phase: string; altitudeToM: number };
        },
        i: number,
      ) => {
        assert.equal(f.properties.sequence, i + 1);
        assert.equal(f.properties.phase, m.segments[i].phase);
        assert.equal(f.properties.altitudeToM, m.segments[i].altitudeToM);
        assert.deepEqual(f.geometry.coordinates, [
          m.segments[i].from,
          m.segments[i].to,
        ]);
      },
    );
  }
  const kml = toKML(p);
  assert.ok(kml.includes('relativeAltitudeToM'));
  assert.ok(!kml.includes('<altitudeMode>absolute'));
  p.scenario.name = '<test & "quotes">';
  assert.ok(toKML(p).includes('&lt;test &amp; &quot;quotes&quot;&gt;'));
  assert.equal(evidenceBundle(p).evidenceKind, 'model-calculation');
});
test('area and hole topology: excluded area cannot improve the gross coverage claim', () => {
  const s = demoScenario(),
    g = prepareGeometry(s);
  assert.ok(area(g.target) < area(g.gross));
  const invalid: Scenario = structuredClone(s);
  invalid.area.coordinates.push([
    [31, 61],
    [31.001, 61],
    [31.001, 61.001],
    [31, 61],
  ]);
  assert.throws(() => prepareGeometry(invalid), /Отверстие/);
});
