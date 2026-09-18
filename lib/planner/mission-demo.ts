import { demoScenario } from './demo.ts';
import { migrateScenario, parseMissionDocument } from './mission-schema.ts';
import type { MissionDocument } from './mission-schema.ts';
import type { Coordinate, Polygon } from './schema.ts';
import { projection } from './geometry.ts';
import { createDemoQuality } from './quality.ts';
export { createDemoQuality } from './quality.ts';

/** Synthetic geometry at real coordinates: NOT a permitted real flight site. */
export function demoMission(areaKm2: 1 | 10 | 100 = 1): MissionDocument {
  const doc = migrateScenario(demoScenario(), `demo-${areaKm2}km2`),
    side = Math.sqrt(areaKm2) * 1000;
  const p = projection([30.3, 60.035]);
  const square = (a: number, b: number, c: number, d: number): Polygon => ({
    type: 'Polygon',
    coordinates: [
      [
        [a, b],
        [c, b],
        [c, d],
        [a, d],
        [a, b],
      ].map((v) => p.inverse(v as Coordinate)),
    ],
  });
  doc.name = `Учебная съёмка · ${areaKm2} км²`;
  doc.scenario.name = doc.name;
  doc.scenario.area = square(0, 0, side, side);
  doc.scenario.airspace = square(-400, -400, side + 400, side + 400);
  doc.scenario.exclusions = [];
  const count = areaKm2 === 1 ? 2 : areaKm2 === 10 ? 4 : 10;
  const template = doc.scenario.vehicles[0];
  doc.scenario.vehicles = Array.from({ length: count }, (_, i) => ({
    ...structuredClone(template),
    id: `gemini-${i + 1}`,
    name: `Gemini · ${String(i + 1).padStart(2, '0')}`,
    enabled: true,
    batteryPct: 100,
    start: p.inverse([(side * (i + 0.5)) / count, -120]),
    landing: p.inverse([(side * (i + 0.5)) / count, -120]),
  }));
  doc.scenario.reserveSites = doc.scenario.vehicles.map((v) => v.landing);
  doc.scenario.wind = { speedMps: 2, fromDeg: 270 };
  doc.jobs = [
    {
      id: 'rgb-01',
      name: 'RGB · вся территория',
      area: doc.scenario.area,
      job: { ...doc.scenario.job, autoBearing: true },
      assignedVehicleIds: [],
      quality: createDemoQuality('RGB'),
      daylight: 'topographicClearSky',
    },
  ];
  doc.terrainModel = {
    kind: 'flat',
    elevationM: 0,
    source:
      'Синтетическая горизонтальная поверхность; не реальный DEM участка.',
  };
  doc.batteries = doc.scenario.vehicles.flatMap((v) =>
    Array.from({ length: areaKm2 === 1 ? 3 : 8 }, (_, i) => ({
      id: `${v.id}-battery-${i + 1}`,
      vehicleId: v.id,
      name: `${v.name} · АКБ ${i + 1}`,
      initialPct: 100,
      readyAt: doc.window.start,
      rechargeSec: null,
      cycles: null,
      commissionedAt: null,
      source:
        'Учебный запас заряженных АКБ; наличие у реального оператора не подтверждено.',
    })),
  );
  if (areaKm2 === 10) {
    doc.planning.maxSortiesPerVehicle = 12;
    for (const battery of doc.batteries) {
      battery.rechargeSec = 4500;
      battery.source +=
        ' Для стенда: полный цикл зарядки 75 минут на последовательном заряднике каждого БВС; ориентир Gemini при +25 °C, реальные условия не подтверждены.';
    }
  }
  doc.notes =
    'Учебный сценарий. Координаты реальные; область, базы, допуски, ресурсы и плоская поверхность синтетические. 100 км² — нагрузочный вход: выполнимость и время расчёта не гарантируются.';
  return parseMissionDocument(doc);
}
