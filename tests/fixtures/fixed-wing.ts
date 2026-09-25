import { demoMission } from '../../lib/planner/mission-demo.ts';
import {
  generateStrips,
  prepareGeometry,
  projection,
} from '../../lib/planner/geometry.ts';
import type { Polygon } from '../../lib/planner/schema.ts';
import { GEOSCAN_201_MODEL_PROFILE } from '../../lib/planner/fixed-wing-profile.ts';

export function fixedWingFixture(wind = 2) {
  const d = demoMission(1),
    p = projection([30.3, 60.035]);
  const square = (x: number, y: number, side: number): Polygon => ({
    type: 'Polygon',
    coordinates: [
      [
        [x, y],
        [x + side, y],
        [x + side, y + side],
        [x, y + side],
        [x, y],
      ].map((point) => p.inverse(point as [number, number])),
    ],
  });
  d.scenario.area = square(0, 0, 400);
  d.scenario.airspace = square(-2500, -2500, 6000);
  d.scenario.exclusions = [];
  d.scenario.wind = { speedMps: wind, fromDeg: 270 };
  d.scenario.clearanceM = 10;
  d.scenario.reservePct = 20;
  d.scenario.vehicles = [
    {
      ...d.scenario.vehicles[0],
      id: 'wing-201',
      name: 'Геоскан 201',
      model: '201',
      kind: 'fixedWing',
      airspeedMps: 22,
      maxAirspeedMps: 110 / 3.6,
      maxWindMps: 12,
      batteryPct: 100,
      effectiveEnduranceMin: 120,
      climbMps: 3,
      start: p.inverse([-1000, -1000]),
      landing: p.inverse([-1000, -1000]),
      fixedWingProfile: { ...GEOSCAN_201_MODEL_PROFILE },
      cameraIds: ['test-201-geometry'],
      cameraProfiles: [
        {
          id: 'test-201-geometry',
          name: 'Synthetic camera for kinematic regression',
          type: 'RGB',
          status: 'assumed',
          source:
            'Synthetic optical geometry; not an actual Geoscan payload or passport.',
          supportedModels: ['201'],
          sensorWidthMm: 30,
          sensorHeightMm: 15,
          focalLengthMm: 18,
          imageWidthPx: 6000,
          imageHeightPx: 3000,
          minimumIntervalSec: 0.1,
          shutterSec: 0.0001,
        },
      ],
    },
  ];
  d.batteries = [
    {
      ...d.batteries[0],
      id: 'wing-installed',
      vehicleId: 'wing-201',
      initialPct: 100,
      rechargeSec: null,
    },
  ];
  d.jobs = [
    {
      ...d.jobs[0],
      area: d.scenario.area,
      assignedVehicleIds: [],
      daylight: 'none',
      job: {
        ...d.jobs[0].job,
        altitudeM: 120,
        swathM: 200,
        sideOverlap: 0,
        triggerDistanceM: 20,
        autoBearing: false,
        bearingDeg: 0,
      },
      quality: {
        mode: 'camera',
        status: 'assumed',
        source:
          'Требования синтетического теста, не паспорт полезной нагрузки.',
        maximumGsdCm: 5,
        forwardOverlap: 0.8,
        maximumBlurPx: 1,
      },
    },
  ];
  d.scenario.job = d.jobs[0].job;
  d.planning.windModel = 'constantAirspeed';
  d.terrainModel = {
    kind: 'flat',
    elevationM: 0,
    source: 'Тестовая плоскость',
  };
  d.restrictions = [];
  d.scenario.reserveSites = [];
  const g = prepareGeometry(d.scenario, 10, d.scenario.area.coordinates[0][0]);
  const context = { job: d.jobs[0], scenario: d.scenario, geometry: g };
  const strips = generateStrips(g, 200, 0);
  const v = d.scenario.vehicles[0];
  return { d, p, context, strips, v, square };
}
