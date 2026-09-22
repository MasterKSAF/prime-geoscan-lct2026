import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoMission } from '../lib/planner/mission-demo.ts';
import {
  missionJobContext,
  solveMissionDocument,
} from '../lib/planner/mission-engine.ts';
import {
  segmentIntersectsVolume,
  segmentSeparation,
  sunAltitudeDeg,
  validateMissionCandidate,
  validateExportedCandidate,
} from '../lib/planner/mission-validation.ts';
import { projection } from '../lib/planner/geometry.ts';
import type { Segment } from '../lib/planner/schema.ts';
import type { MissionDocument } from '../lib/planner/mission-schema.ts';

function segment(
  from: [number, number],
  to: [number, number],
  start = 0,
  end = 10,
  height = 100,
): Segment {
  return {
    from,
    to,
    phase: 'transit',
    startSec: start,
    endSec: end,
    altitudeFromM: height,
    altitudeToM: height,
    airspeedMps: 10,
    groundSpeedMps: 10,
    distanceM: 100,
    batteryFromPct: 100,
    batteryToPct: 99,
  };
}
const contexts = (d: MissionDocument) =>
  d.jobs.map((j) => missionJobContext(d, j));

void test('continuous separation detects crossing between animation frames and honors vertical/time separation', () => {
  const p = projection([30, 60]),
    a = segment(p.inverse([-50, 0]), p.inverse([50, 0])),
    b = segment(p.inverse([0, -50]), p.inverse([0, 50]));
  assert.equal(segmentSeparation(a, b, 10, 10)?.conflict, true);
  assert.ok(Math.abs(segmentSeparation(a, b, 10, 10)!.atSec - 5) < 0.001);
  assert.equal(
    segmentSeparation(
      a,
      { ...b, altitudeFromM: 150, altitudeToM: 150 },
      10,
      10,
    ),
    null,
  );
  assert.equal(
    segmentSeparation(a, { ...b, startSec: 20, endSec: 30 }, 10, 10),
    null,
  );
});

void test('4D volume detects crossing even when both endpoints are outside, excludes inactive time and height', () => {
  const p = projection([30, 60]),
    s = segment(p.inverse([-50, 0]), p.inverse([50, 0]));
  const volume = {
    footprint: [
      [
        [
          [-5, -5],
          [5, -5],
          [5, 5],
          [-5, 5],
          [-5, -5],
        ],
      ],
    ] as [number, number][][][],
    minAltitudeM: 90,
    maxAltitudeM: 110,
    startSec: 4,
    endSec: 6,
  };
  assert.equal(segmentIntersectsVolume(s, volume, p.forward), true);
  assert.equal(
    segmentIntersectsVolume(
      s,
      { ...volume, startSec: 7, endSec: 9 },
      p.forward,
    ),
    false,
  );
  assert.equal(
    segmentIntersectsVolume(
      s,
      { ...volume, maxAltitudeM: 80, minAltitudeM: 0 },
      p.forward,
    ),
    false,
  );
});

void test('solar geometry separates night/noon and dates are absolute instants', () => {
  const noon = sunAltitudeDeg(Date.parse('2026-03-20T12:00:00Z'), [0, 0]),
    midnight = sunAltitudeDeg(Date.parse('2026-03-20T00:00:00Z'), [0, 0]);
  assert.ok(noon > 87);
  assert.ok(midnight < -87);
  assert.equal(
    sunAltitudeDeg(Date.parse('2026-09-24T10:00:00+03:00'), [30, 60]),
    sunAltitudeDeg(Date.parse('2026-09-24T07:00:00Z'), [30, 60]),
  );
});

void test('1 km² full end-to-end mission has repeated sorties, distinct battery instances and both validated objectives', async () => {
  const d = demoMission(1),
    r = await solveMissionDocument(d);
  assert.equal(r.candidates.length, 2);
  for (const c of r.candidates) {
    assert.equal(c.status, 'feasible_model');
    assert.equal(c.checks.filter((x) => x.status === 'fail').length, 0);
    assert.ok(c.sorties.length >= 3);
    assert.ok(c.metrics.batteryChanges >= 1);
    assert.ok(c.metrics.grossCoveragePct > 99.99);
    assert.ok(c.metrics.minimumRemainingPct >= d.scenario.reservePct);
    assert.ok(
      c.checks.some((x) => x.id === 'CALIBRATION' && x.status === 'unknown'),
    );
    assert.ok(
      c.checks.some((x) => x.id === 'RESERVE_LANDING' && x.status === 'pass'),
    );
    assert.ok(c.plan.baseline);
    const key = c.objective === 'makespan' ? 'makespanSec' : 'flightTimeSec';
    assert.ok(c.metrics[key] <= c.plan.baseline[key] + 1e-6);
    for (const sortie of c.sorties)
      assert.equal(sortie.segments[0].startSec, sortie.startSec);
  }
});

void test('deterministic plan/hash excludes wall-clock metadata', async () => {
  const a = await solveMissionDocument(demoMission(1)),
    b = await solveMissionDocument(demoMission(1));
  assert.equal(a.inputHash, b.inputHash);
  assert.deepEqual(
    a.candidates.map((c) => c.sorties),
    b.candidates.map((c) => c.sorties),
  );
});

void test('insufficient batteries produce partial/not_found, not a successful partial coverage plan', async () => {
  const d = demoMission(1);
  d.batteries = d.batteries.filter((b) => b.id.endsWith('-1'));
  d.planning.maxSortiesPerVehicle = 1;
  const r = await solveMissionDocument(d);
  assert.ok(r.candidates.every((c) => c.status !== 'feasible_model'));
  assert.ok(r.candidates.every((c) => c.metrics.grossCoveragePct < 99));
});

void test('temporary 4D restriction delays all affected flights beyond expiration', async () => {
  const d = demoMission(1),
    start = Date.parse(d.window.start);
  d.restrictions = [
    {
      id: 'temporary',
      name: 'Временный запрет',
      kind: 'noFlight',
      geometry: d.scenario.airspace,
      minAltitudeM: 0,
      maxAltitudeM: null,
      startAt: d.window.start,
      endAt: new Date(start + 1800 * 1000).toISOString(),
      source: 'Тест',
    },
  ];
  const r = await solveMissionDocument(d);
  for (const c of r.candidates) {
    assert.equal(c.status, 'feasible_model');
    assert.ok(c.sorties.every((s) => s.startSec >= 1800));
    assert.equal(
      c.checks.find((x) => x.id === 'FOUR_DIMENSIONAL')?.status,
      'pass',
    );
  }
});

void test('night window with RGB sunlight rule yields no plan; rule none does not impose a universal night ban', async () => {
  const d = demoMission(1);
  d.window.start = '2026-09-24T00:00:00+03:00';
  d.window.end = '2026-09-24T02:00:00+03:00';
  d.batteries.forEach((b) => {
    b.readyAt = d.window.start;
  });
  d.jobs[0].daylight = 'topographicClearSky';
  const night = await solveMissionDocument(d);
  assert.ok(night.candidates.every((c) => c.status === 'not_found'));
  d.jobs[0].daylight = 'none';
  const unrestricted = await solveMissionDocument(d);
  assert.ok(
    unrestricted.candidates.every((c) => c.status === 'feasible_model'),
  );
});

void test('battery recharge is explicit and stale resource time cannot be forged', async () => {
  const d = demoMission(1);
  d.scenario.vehicles = d.scenario.vehicles.slice(0, 1);
  d.batteries = d.batteries
    .filter((b) => b.vehicleId === d.scenario.vehicles[0].id)
    .slice(0, 1);
  d.batteries[0].rechargeSec = 600;
  const r = await solveMissionDocument(d),
    c = r.candidates[0];
  assert.equal(c.status, 'feasible_model');
  assert.ok(c.sorties.length >= 2);
  const ordered = [...c.sorties].sort((a, b) => a.startSec - b.startSec);
  assert.ok(ordered[1].startSec >= ordered[0].endSec + 600 - 1e-6);
  const forged = structuredClone(c.sorties),
    second = forged[1],
    advance = 500;
  second.startSec -= advance;
  second.endSec -= advance;
  second.readySec -= advance;
  second.segments.forEach((s) => {
    s.startSec -= advance;
    s.endSec -= advance;
  });
  assert.equal(
    validateMissionCandidate(d, forged, contexts(d)).find(
      (x) => x.id === 'BATTERIES',
    )?.status,
    'fail',
  );
});

void test('independent validator catches forged energy, times and omitted strips', async () => {
  const d = demoMission(1),
    result = await solveMissionDocument(d),
    flights = structuredClone(result.candidates[0].sorties);
  flights[0].remainingPct = 99;
  flights[0].segments[1].endSec += 20;
  const checks = validateMissionCandidate(d, flights, contexts(d));
  assert.equal(checks.find((c) => c.id === 'TIME')?.status, 'fail');
  assert.equal(checks.find((c) => c.id === 'ENERGY')?.status, 'fail');
  assert.equal(checks.find((c) => c.id === 'RESERVE_LANDING')?.status, 'fail');
  assert.equal(
    validateMissionCandidate(d, flights.slice(1), contexts(d)).find(
      (c) => c.id === 'STRIPS',
    )?.status,
    'fail',
  );
});

void test('fixed-wing unsupported is never reported as verified multirotor', async () => {
  const d = demoMission(1);
  d.scenario.vehicles[0].kind = 'fixedWing';
  d.scenario.vehicles[0].model = '201';
  d.jobs[0].assignedVehicleIds = [d.scenario.vehicles[0].id];
  const result = await solveMissionDocument(d);
  assert.ok(result.candidates.every((c) => c.status === 'unsupported'));
});

void test('permanent exclusion cannot convert missing gross coverage into success', async () => {
  const d = demoMission(1),
    ring = d.jobs[0].area.coordinates[0],
    p = projection(ring[0]);
  d.scenario.exclusions = [
    {
      type: 'Polygon',
      coordinates: [
        [
          p.inverse([300, 300]),
          p.inverse([700, 300]),
          p.inverse([700, 700]),
          p.inverse([300, 700]),
          p.inverse([300, 300]),
        ],
      ],
    },
  ];
  const result = await solveMissionDocument(d);
  assert.ok(result.candidates.every((c) => c.status !== 'feasible_model'));
  assert.ok(result.candidates.every((c) => c.metrics.grossCoveragePct < 90));
});

void test('even sub-one-percent area removed by a permanent restriction is partial, not feasible', async () => {
  for (const mode of ['legacy-exclusion', 'restriction'] as const) {
    const d = demoMission(1),
      p = projection(d.jobs[0].area.coordinates[0][0]),
      polygon = {
        type: 'Polygon' as const,
        coordinates: [
          [
            [493, 493],
            [497, 493],
            [497, 497],
            [493, 497],
            [493, 493],
          ].map((x) => p.inverse(x as [number, number])),
        ],
      };
    if (mode === 'legacy-exclusion') d.scenario.exclusions = [polygon];
    else
      d.restrictions = [
        {
          id: 'tiny-forbidden',
          name: 'Маленькая недоступная часть',
          kind: 'noFlight',
          geometry: polygon,
          minAltitudeM: 0,
          maxAltitudeM: null,
          startAt: null,
          endAt: null,
          source: 'Тест запрета',
        },
      ];
    const result = await solveMissionDocument(d);
    for (const candidate of result.candidates) {
      assert.equal(candidate.status, 'partial');
      assert.ok(
        candidate.metrics.grossCoveragePct > 99 &&
          candidate.metrics.grossCoveragePct < 100,
      );
      assert.equal(
        candidate.checks.find((c) => c.id === 'REQUESTED_AREA')?.status,
        'fail',
      );
      assert.equal(
        (await validateExportedCandidate(d, candidate)).find(
          (c) => c.id === 'REQUESTED_AREA',
        )?.status,
        'fail',
      );
    }
  }
});

void test('different work-area projections preserve WGS84 positions and vehicle resource continuity', async () => {
  const d = demoMission(1),
    second = structuredClone(d.jobs[0]),
    p = projection(second.area.coordinates[0][0]);
  second.id = 'job-offset';
  second.name = 'Область со смещённым началом';
  second.area.coordinates = second.area.coordinates.map((ring) =>
    ring.map((point) => {
      const xy = p.forward(point);
      return p.inverse([xy[0] + 100, xy[1] + 100]);
    }),
  );
  d.jobs.push(second);
  d.batteries.forEach((b) => {
    b.rechargeSec = 600;
  });
  const result = await solveMissionDocument(d);
  for (const candidate of result.candidates) {
    assert.equal(candidate.status, 'feasible_model');
    assert.equal(candidate.jobCoverage.length, 2);
    const checked = await validateExportedCandidate(d, candidate);
    assert.equal(
      checked.filter((c) => c.status === 'fail').length,
      0,
      JSON.stringify(checked.filter((c) => c.status === 'fail')),
    );
  }
});

void test('exported verification rebuilds selected bearing and rejects input/profile/metric mutation', async () => {
  const d = demoMission(1),
    result = await solveMissionDocument(d),
    candidate = result.candidates[0];
  const valid = await validateExportedCandidate(d, candidate);
  assert.equal(valid.filter((c) => c.status === 'fail').length, 0);
  const changed = structuredClone(d);
  changed.jobs[0].quality.sensorWidthMm = 15;
  assert.equal(
    (await validateExportedCandidate(changed, candidate)).find(
      (c) => c.id === 'INPUT_HASH',
    )?.status,
    'fail',
  );
  const bad = structuredClone(candidate);
  bad.jobCoverage[0].bearingDeg = 33;
  assert.equal(
    (await validateExportedCandidate(d, bad)).find(
      (c) => c.id === 'BEARING_PROVENANCE',
    )?.status,
    'fail',
  );
  bad.jobCoverage[0].bearingDeg = candidate.jobCoverage[0].bearingDeg;
  bad.metrics.flightTimeSec = 1;
  assert.equal(
    (await validateExportedCandidate(d, bad)).find((c) => c.id === 'METRICS')
      ?.status,
    'fail',
  );
});

void test('independent export verification accepts a genuinely selected perpendicular bearing', async () => {
  const d = demoMission(1),
    p = projection(d.jobs[0].area.coordinates[0][0]);
  d.jobs[0].area.coordinates = d.jobs[0].area.coordinates.map((ring) =>
    ring.map((point) => {
      const xy = p.forward(point);
      return p.inverse([xy[0], xy[1] * 0.25]);
    }),
  );
  const result = await solveMissionDocument(d);
  assert.ok(result.candidates.some((c) => c.jobCoverage[0].bearingDeg === 90));
  for (const candidate of result.candidates) {
    const checked = await validateExportedCandidate(d, candidate);
    assert.equal(
      checked.filter((c) => c.status === 'fail').length,
      0,
      JSON.stringify(checked.filter((c) => c.status === 'fail')),
    );
  }
});

void test('export verification rejects changed legacy-view geometry and profiles despite an unchanged document hash', async () => {
  const d = demoMission(1),
    result = await solveMissionDocument(d),
    candidate = structuredClone(result.candidates[0]);
  candidate.plan.scenario.wind.speedMps = 30;
  candidate.plan.scenario.area.coordinates =
    candidate.plan.scenario.area.coordinates.map((ring) =>
      ring.map(([lon, lat]) => [lon + 0.005, lat]),
    );
  const checked = await validateExportedCandidate(d, candidate);
  assert.equal(checked.find((c) => c.id === 'INPUT_HASH')?.status, 'pass');
  assert.equal(checked.find((c) => c.id === 'VIEW_PROJECTION')?.status, 'fail');
});

void test('strict trajectory schema rejects unknown phases, duplicate IDs, non-finite values and forged shot counts', async () => {
  const d = demoMission(1),
    result = await solveMissionDocument(d),
    original = result.candidates[0].sorties;
  const magic = structuredClone(original);
  (magic[0].segments[1] as unknown as { phase: string }).phase = 'magic';
  assert.equal(
    validateMissionCandidate(d, magic, contexts(d))[0].status,
    'fail',
  );
  const duplicate = structuredClone(original);
  duplicate[1].id = duplicate[0].id;
  assert.equal(
    validateMissionCandidate(d, duplicate, contexts(d))[0].status,
    'fail',
  );
  const nan = structuredClone(original);
  nan[0].segments[0].startSec = NaN;
  assert.equal(validateMissionCandidate(d, nan, contexts(d))[0].status, 'fail');
  const fakeShots = structuredClone(original);
  fakeShots[0].shots = 123456;
  assert.equal(
    validateMissionCandidate(d, fakeShots, contexts(d)).find(
      (c) => c.id === 'TIME',
    )?.status,
    'fail',
  );
});

void test('objective selection uses shared pool and never loses to the other available candidate', async () => {
  const d = demoMission(10);
  d.planning.maxSortiesPerVehicle = 12;
  d.batteries.forEach((b) => {
    b.rechargeSec = 4500;
  });
  const result = await solveMissionDocument(d),
    fast = result.candidates.find((c) => c.objective === 'makespan')!,
    economical = result.candidates.find((c) => c.objective === 'flightTime')!;
  assert.equal(fast.status, 'feasible_model');
  assert.equal(economical.status, 'feasible_model');
  assert.ok(fast.metrics.makespanSec <= economical.metrics.makespanSec + 1e-6);
  assert.ok(
    economical.metrics.flightTimeSec <= fast.metrics.flightTimeSec + 1e-6,
  );
});
