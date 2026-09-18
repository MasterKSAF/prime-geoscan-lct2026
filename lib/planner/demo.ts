import type { Scenario } from './schema.ts';

// Coordinates are real; boundaries, weather and operating profiles are synthetic test inputs.
export function demoScenario(): Scenario {
  const scenario: Scenario = {
    schemaVersion: '1.0',
    name: 'Площадная съёмка · учебный участок',
    area: {
      type: 'Polygon',
      coordinates: [
        [
          [30.289, 60.031],
          [30.31, 60.032],
          [30.314, 60.041],
          [30.299, 60.043],
          [30.287, 60.038],
          [30.289, 60.031],
        ],
      ],
    },
    airspace: {
      type: 'Polygon',
      coordinates: [
        [
          [30.28, 60.025],
          [30.322, 60.025],
          [30.322, 60.048],
          [30.28, 60.048],
          [30.28, 60.025],
        ],
      ],
    },
    exclusions: [
      {
        type: 'Polygon',
        coordinates: [
          [
            [30.299, 60.036],
            [30.303, 60.036],
            [30.303, 60.038],
            [30.299, 60.038],
            [30.299, 60.036],
          ],
        ],
      },
    ],
    reserveSites: [[30.316, 60.04]],
    job: {
      type: 'RGB',
      altitudeM: 100,
      swathM: 117.5,
      sideOverlap: 0.6,
      triggerDistanceM: 15.6,
      bearingDeg: 0,
      autoBearing: true,
      qualitySource:
        'Учебный RGB-профиль PF1B: 23,5 мм / 20 мм на 100 м; перекрытие 60% и шаг 15,6 м — параметры сценария. Скорость затвора не подтверждена.',
    },
    wind: { speedMps: 3, fromDeg: 270 },
    reservePct: 25,
    clearanceM: 15,
    objective: 'makespan',
    terrain: 'unknown',
    vehicles: [
      {
        id: 'gemini-01',
        name: 'Gemini · 01',
        model: 'Gemini',
        kind: 'multirotor',
        enabled: true,
        airspeedMps: 9,
        maxWindMps: 10,
        batteryPct: 100,
        effectiveEnduranceMin: 28,
        climbMps: 3,
        descentMps: 1,
        turnSeconds: 4,
        start: [30.289, 60.0285],
        landing: [30.289, 60.0285],
        jobs: ['RGB', 'MS'],
        assumptions: [
          '28 мин — расчётный бюджет учебной конфигурации, не измеренная выносливость.',
          'Скорость, развороты, набор/снижение и частота кадров требуют калибровки.',
        ],
        source:
          'https://download.geoscan.ru/site-files/gemini/Gemini_Specs_EN_RUS.pdf?v2',
      },
      {
        id: 'gemini-02',
        name: 'Gemini · 02',
        model: 'Gemini',
        kind: 'multirotor',
        enabled: true,
        airspeedMps: 8,
        maxWindMps: 10,
        batteryPct: 90,
        effectiveEnduranceMin: 28,
        climbMps: 3,
        descentMps: 1,
        turnSeconds: 4,
        start: [30.294, 60.0285],
        landing: [30.294, 60.0285],
        jobs: ['RGB', 'MS'],
        assumptions: [
          '28 мин — расчётный бюджет учебной конфигурации, не измеренная выносливость.',
          'Скорость, развороты, набор/снижение и частота кадров требуют калибровки.',
        ],
        source:
          'https://download.geoscan.ru/site-files/gemini/Gemini_Specs_EN_RUS.pdf?v2',
      },
      {
        id: '801-03',
        name: 'Геоскан 801 · 03',
        model: '801',
        kind: 'multirotor',
        enabled: false,
        airspeedMps: 8,
        maxWindMps: 10,
        batteryPct: 100,
        effectiveEnduranceMin: 25,
        climbMps: 2,
        descentMps: 1,
        turnSeconds: 5,
        start: [30.299, 60.0285],
        landing: [30.299, 60.0285],
        jobs: ['IR'],
        assumptions: [
          '25 мин — условный бюджет, модель батареи не опубликована.',
          'Автоматическое выполнение миссии и параметры ИК-покрытия не подтверждены.',
        ],
        source: 'https://download.geoscan.ru/site-files/801/Geoscan_801.pdf?v2',
      },
      {
        id: '201-04',
        name: 'Геоскан 201 · 04',
        model: '201',
        kind: 'fixedWing',
        enabled: false,
        airspeedMps: 20,
        maxWindMps: 12,
        batteryPct: 100,
        effectiveEnduranceMin: 100,
        climbMps: 3,
        descentMps: 2,
        turnSeconds: 10,
        start: [30.285, 60.0285],
        landing: [30.285, 60.0285],
        jobs: ['RGB', 'MS'],
        assumptions: [
          'Отключён: катапульта, кривизна разворота и парашютная посадка ещё не реализованы.',
          'Временной бюджет 100 мин — незаверенная оценка, не паспорт.',
        ],
        source:
          'https://download.geoscan.ru/site-files/201/Geoscan_201_Manual.pdf',
      },
    ],
  };
  // A 37 ha local fixture keeps the first demo feasible for two conservative profiles.
  const compact = (p: [number, number]): [number, number] => [
    30.3 + (p[0] - 30.3) * 0.5,
    60.035 + (p[1] - 60.035) * 0.5,
  ];
  for (const p of [scenario.area, scenario.airspace, ...scenario.exclusions])
    p.coordinates = p.coordinates.map((r) => r.map(compact));
  scenario.reserveSites = scenario.reserveSites.map(compact);
  scenario.vehicles = scenario.vehicles.map((v) => ({
    ...v,
    start: compact(v.start),
    landing: compact(v.landing),
  }));
  return scenario;
}
