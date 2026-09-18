import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { DOMParser } from '@xmldom/xmldom';
import { demoMission } from '../../lib/planner/mission-demo.ts';
import { solveMissionDocument } from '../../lib/planner/mission-engine.ts';
import { validateExportedCandidate } from '../../lib/planner/mission-validation.ts';
import { createDemoQuality } from '../../lib/planner/quality.ts';
import { projection } from '../../lib/planner/geometry.ts';
import { missionGeoJSON, missionKML } from '../../lib/planner/mission-export.ts';
import { parseMissionText, canonicalMissionJson, serializeMissionJson } from '../../lib/planner/mission-io.ts';
import { createMissionLibrary } from '../../lib/planner/mission-library.ts';
import type { Segment, Coordinate, Polygon } from '../../lib/planner/schema.ts';

// Engineering acceptance gates, NOT an official jury scoring formula.
// Run separately: node --experimental-transform-types --experimental-test-isolation=none --test tests/acceptance/track5-readiness.test.ts
// No historical output fixtures, external services, actual BVS or browser user data required.
const p = projection([30.3, 60.035]);
const square = (x: number, y: number, side: number): Polygon => ({
  type: 'Polygon',
  coordinates: [[[x, y], [x + side, y], [x + side, y + side], [x, y + side], [x, y]]
    .map(v => p.inverse(v as Coordinate))],
});
function smallMission() {
  const d = demoMission(1);
  d.scenario.area = square(0, 0, 250);
  d.scenario.airspace = square(-500, -500, 1500);
  d.scenario.reserveSites = [p.inverse([50, -80])];
  d.scenario.wind = { speedMps: 0, fromDeg: 0 };
  d.scenario.clearanceM = 5;
  d.scenario.vehicles = d.scenario.vehicles.slice(0, 1);
  Object.assign(d.scenario.vehicles[0], {
    start: p.inverse([50, -80]), landing: p.inverse([50, -80]),
    jobs: ['RGB', 'MS', 'IR', 'LiDAR', 'Geophysics'], effectiveEnduranceMin: 28,
  });
  d.batteries = d.batteries.filter(b => b.vehicleId === d.scenario.vehicles[0].id);
  d.jobs[0].area = d.scenario.area;
  d.jobs[0].job.autoBearing = false;
  d.jobs[0].daylight = 'none';
  d.planning.maxComputeMs = 3000;
  d.planning.temporalBufferSec = 0;
  return d;
}

for (const area of [1, 10] as const) {
  void test(`A${area === 1 ? 1 : 2}: ${area} km2 has complete validated plans for both objectives`, async () => {
    const d = demoMission(area);
    const result = await solveMissionDocument(d);
    assert.deepEqual(new Set(result.candidates.map(c => c.objective)), new Set(['makespan', 'flightTime']));
    for (const c of result.candidates) {
      assert.equal(c.status, 'feasible_model');
      assert.ok(c.metrics.grossCoveragePct >= 99.99);
      assert.ok(c.metrics.minimumRemainingPct >= d.scenario.reservePct);
      assert.ok(c.sorties.length > c.metrics.vehicleCount, 'Repeat sorties must be modeled.');
      assert.equal((await validateExportedCandidate(d, c)).filter(v => v.status === 'fail').length, 0);
    }
  });
}

void test('A3: every vehicle receives individual route, phases, times, heights and speeds in GeoJSON/KML', async () => {
  const d = demoMission(1);
  const c = (await solveMissionDocument(d)).candidates[0];
  assert.equal(c.status, 'feasible_model');
  for (const id of new Set(c.sorties.map(s => s.vehicleId))) {
    const geo = missionGeoJSON(d, c, id);
    assert.ok(geo.features.length > 0);
    assert.ok(geo.features.every(f => f.properties.vehicleId === id));
    const xml = new DOMParser().parseFromString(missionKML(d, c, id), 'application/xml');
    assert.equal(xml.documentElement?.localName, 'kml');
    const values = Array.from(xml.getElementsByTagName('Data'));
    assert.ok(values.filter(v => v.getAttribute('name') === 'vehicleId').every(v => v.textContent === id));
    for (const key of ['sequence', 'phase', 'altitudeFromM', 'altitudeToM', 'groundSpeedMps', 'startSec', 'endSec']) {
      assert.ok(values.some(v => v.getAttribute('name') === key), `Missing KML field ${key}`);
    }
    for (const s of c.sorties.filter(s => s.vehicleId === id)) {
      assert.equal(s.segments[0].phase, 'takeoff');
      assert.equal(s.segments.at(-1)?.phase, 'landing');
      const points = geo.features.filter(f => f.properties.sortieId === s.id && f.properties.kind === 'waypoint');
      assert.equal(points.length, s.segments.length);
    }
  }
});

void test('A4: wind beyond vehicle limits cannot receive a feasible plan', async () => {
  const d = demoMission(1);
  d.scenario.wind.speedMps = 20;
  const r = await solveMissionDocument(d);
  assert.ok(r.candidates.every(c => c.status !== 'feasible_model'));
  assert.ok(r.candidates.some(c => c.checks.some(v => v.status === 'fail')));
});

function position(s: Segment, t: number) {
  const k = (t - s.startSec) / (s.endSec - s.startSec);
  return {
    lon: s.from[0] + (s.to[0] - s.from[0]) * k,
    lat: s.from[1] + (s.to[1] - s.from[1]) * k,
    z: s.altitudeFromM + (s.altitudeToM - s.altitudeFromM) * k,
  };
}

void test('A5: an accepted plan cannot bring a suspended geophysics sensor inside the other BVS safety separation', async () => {
  const d = smallMission();
  const v = structuredClone(d.scenario.vehicles[0]);
  Object.assign(v, { id: 'gemini-2', start: p.inverse([90, -80]), landing: p.inverse([90, -80]), climbMps: 4.2, descentMps: 1.4 });
  d.scenario.vehicles.push(v);
  d.batteries.push({ ...structuredClone(d.batteries[0]), id: 'battery-2', vehicleId: v.id });
  d.jobs[0].assignedVehicleIds = [d.scenario.vehicles[0].id];
  const job = structuredClone(d.jobs[0]);
  job.id = 'geo'; job.job.type = 'Geophysics'; job.job.altitudeM = 140;
  job.quality = createDemoQuality('Geophysics'); job.quality.sensorOffsetM = 50;
  job.assignedVehicleIds = [v.id]; d.jobs.push(job);
  const r = await solveMissionDocument(d);
  const violations: object[] = [];
  for (const c of r.candidates.filter(c => c.status === 'feasible_model')) {
    for (const a of c.sorties.filter(s => s.jobId === 'geo'))
      for (const b of c.sorties.filter(s => s.jobId !== 'geo'))
        for (const aa of a.segments.filter(s => s.phase === 'survey'))
          for (const bb of b.segments.filter(s => s.phase === 'survey')) {
            const begin = Math.max(aa.startSec, bb.startSec), end = Math.min(aa.endSec, bb.endSec);
            if (end <= begin) continue;
            // Independent point witness, without the production separation helper.
            // A found violation disproves safety; no sampled violation is not an exhaustive proof.
            const t = begin + (end - begin) / 2;
            const x = position(aa, t), y = position(bb, t);
            const radians = Math.PI / 180;
            const horizontalM = 6371008.8 * Math.hypot((x.lon - y.lon) * radians * Math.cos((x.lat + y.lat) / 2 * radians), (x.lat - y.lat) * radians);
            const verticalM = Math.abs(x.z - 50 - y.z);
            if (horizontalM < d.planning.separationHorizontalM && verticalM < d.planning.separationVerticalM)
              violations.push({ objective: c.objective, t, horizontalM, verticalM });
          }
  }
  assert.equal(violations.length, 0, `Accepted unsafe sensor approach: ${JSON.stringify(violations[0])}`);
});

void test('A6: proof checker rejects removed mandatory turn phases even after consistent metric changes', async () => {
  const d = smallMission();
  const original = (await solveMissionDocument(d)).candidates[0];
  assert.equal(original.status, 'feasible_model');
  const c = structuredClone(original);
  let removed = 0;
  for (const s of c.sorties) {
    const v = d.scenario.vehicles.find(v => v.id === s.vehicleId)!;
    const initial = s.segments[0].batteryFromPct;
    let at = s.startSec;
    s.segments = s.segments.filter(seg => { if (seg.phase === 'turn') { removed++; return false; } return true; });
    for (const seg of s.segments) {
      const duration = seg.endSec - seg.startSec;
      seg.startSec = at; seg.endSec = at + duration;
      seg.batteryFromPct = initial - (at - s.startSec) / (v.effectiveEnduranceMin * 60) * 100;
      seg.batteryToPct = initial - (seg.endSec - s.startSec) / (v.effectiveEnduranceMin * 60) * 100;
      at = seg.endSec;
    }
    s.endSec = at; s.durationSec = at - s.startSec; s.readySec = at + d.planning.serviceSec;
    s.remainingPct = s.segments.at(-1)!.batteryToPct;
  }
  assert.ok(removed > 0);
  c.metrics.makespanSec = Math.max(...c.sorties.map(s => s.endSec));
  c.metrics.flightTimeSec = c.sorties.reduce((n, s) => n + s.durationSec, 0);
  c.metrics.minimumRemainingPct = Math.min(...c.sorties.map(s => s.remainingPct));
  c.plan.missions = structuredClone(c.sorties);
  c.plan.metrics.makespanSec = c.metrics.makespanSec;
  c.plan.metrics.flightTimeSec = c.metrics.flightTimeSec;
  assert.ok((await validateExportedCandidate(d, c)).some(v => v.status === 'fail'), `${removed} turns removed; ${original.metrics.flightTimeSec - c.metrics.flightTimeSec}s unearned flight-time saving accepted.`);
});

void test('A7: every accepted mission can be saved to the library and exported without field loss', async () => {
  const circle = (x: number, y: number, radius: number): Coordinate[] => {
    const points = Array.from({ length: 69 }, (_, i): Coordinate => [x + radius * Math.cos(i * 2 * Math.PI / 69), y + radius * Math.sin(i * 2 * Math.PI / 69)]);
    return [...points, points[0]];
  };
  const area: Polygon = { type: 'Polygon', coordinates: [circle(30.3, 60.035, .009), circle(30.295, 60.035, .001), circle(30.305, 60.035, .001), circle(30.3, 60.03, .001), circle(30.3, 60.04, .001)] };
  const d = demoMission(1);
  d.jobs = Array.from({ length: 8 }, (_, i) => ({ ...structuredClone(d.jobs[0]), id: `dense-${i}`, area }));
  const accepted = parseMissionText(JSON.stringify(d), 'json');
  const library = createMissionLibrary({ indexedDB: new IDBFactory() });
  try {
    await library.save(accepted);
    assert.equal((await library.list()).length, 1);
    assert.equal(canonicalMissionJson(parseMissionText(serializeMissionJson(accepted))), canonicalMissionJson(accepted));
  } finally { library.close(); }
});

void test('A8: the running API rejects duplicate safety-constraint keys just as file import does', async () => {
  const body = JSON.stringify(demoMission(1)).replace('"reservePct":25', '"reservePct":80,"reservePct":25');
  assert.ok(body.includes('"reservePct":80,"reservePct":25'));
  assert.throws(() => parseMissionText(body, 'json'));
  const response = await fetch('http://127.0.0.1:3016/api/planner/missions/solve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 400, 'Ambiguous reservePct must be rejected before solving, not silently use 25 instead of 80.');
});
