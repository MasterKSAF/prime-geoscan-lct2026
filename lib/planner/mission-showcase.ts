import { demoMission } from './mission-demo.ts';
import { projection } from './geometry.ts';
import { createDemoQuality } from './quality.ts';
import { parseMissionDocument } from './mission-schema.ts';
import type { MissionDocument, MissionJob } from './mission-schema.ts';
import type { Coordinate, Polygon, Vehicle } from './schema.ts';

export type ShowcaseScenario = {
  id: string;
  title: string;
  summary: string;
  expected: 'feasible_model' | 'rejected';
  highlights: string[];
  checks: string[];
  create: () => MissionDocument;
};

const origin = projection([30.3, 60.035]);
const point = (x: number, y: number) => origin.inverse([x, y]);
const rectangle = (
  x: number,
  y: number,
  width: number,
  height: number,
): Polygon => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
      [x, y],
    ].map((p) => origin.inverse(p as Coordinate)),
  ],
});
const instant = (d: MissionDocument, sec: number) =>
  new Date(Date.parse(d.window.start) + sec * 1000).toISOString();
const synthetic =
  'Синтетический приёмочный пример, не официальный эталон Геоскана и не разрешение реального полёта.';

function base(id: string, title: string): MissionDocument {
  const d = demoMission(1);
  d.id = id;
  d.name = title;
  d.scenario.name = title;
  d.window = {
    start: '2026-06-15T09:00:00Z',
    end: '2026-06-15T15:00:00Z',
    timezone: 'Europe/Moscow',
  };
  d.scenario.area = rectangle(0, 0, 300, 220);
  d.scenario.airspace = rectangle(-350, -350, 1500, 1200);
  d.scenario.wind = { speedMps: 0, fromDeg: 270 };
  d.scenario.clearanceM = 5;
  d.planning.preparationSec = 60;
  d.planning.serviceSec = 180;
  d.planning.maxSortiesPerVehicle = 12;
  d.planning.maxComputeMs = 5000;
  d.planning.separationHorizontalM = 30;
  d.planning.separationVerticalM = 20;
  d.planning.temporalBufferSec = 2;
  d.planning.separationSource =
    'Учебные защитные интервалы 30/20 м и 2 с; не утверждённый норматив.';
  d.notes = `${synthetic} Поверхность плоская. День и часы фиксированы; правило освещения каждой работы указано явно. Поддержание высоты и линейный расход — модельные допущения.`;
  setFleet(d, [{ id: 'rgb-1', jobs: ['RGB'], x: 80 }]);
  d.jobs = [job(d, 'rgb', 'RGB', d.scenario.area, 'rgb-1')];
  return d;
}

function setFleet(
  d: MissionDocument,
  profiles: {
    id: string;
    jobs: Vehicle['jobs'];
    x: number;
    speed?: number;
    endurance?: number;
    delay?: number;
    model?: Vehicle['model'];
  }[],
) {
  const template = d.scenario.vehicles[0];
  d.scenario.vehicles = profiles.map((profile) => ({
    ...structuredClone(template),
    id: profile.id,
    name: `${profile.model ?? 'Custom'} · ${profile.id}`,
    model: profile.model ?? 'Custom',
    jobs: profile.jobs,
    start: point(profile.x, -100),
    landing: point(profile.x, -100),
    airspeedMps: profile.speed ?? 8,
    effectiveEnduranceMin: profile.endurance ?? 28,
    source:
      'Учебная конфигурация стенда; реальная совместимость нагрузки не подтверждена.',
    assumptions: [
      'Числа скорости, ресурса и совместимости заданы для синтетического теста.',
    ],
  }));
  d.scenario.reserveSites = d.scenario.vehicles.map((v) => v.landing);
  d.batteries = d.scenario.vehicles.flatMap((vehicle, index) =>
    Array.from({ length: 6 }, (_, battery) => ({
      id: `${vehicle.id}-battery-${battery + 1}`,
      vehicleId: vehicle.id,
      name: `АКБ ${battery + 1} · ${vehicle.id}`,
      initialPct: 100,
      readyAt: instant(d, profiles[index].delay ?? 0),
      rechargeSec: null,
      cycles: null,
      commissionedAt: null,
      source:
        'Учебный запас заряженных АКБ; наличие и состояние у оператора не подтверждены.',
    })),
  );
}

function job(
  d: MissionDocument,
  id: string,
  type: MissionJob['job']['type'],
  area: Polygon,
  vehicleId: string,
): MissionJob {
  return {
    id,
    name: `${type} · ${id}`,
    area,
    job: { ...d.scenario.job, type, bearingDeg: 0, autoBearing: true },
    quality: createDemoQuality(type),
    assignedVehicleIds: [vehicleId],
    daylight: 'none',
  };
}

export const SHOWCASE_SCENARIOS: ShowcaseScenario[] = [
  {
    id: 'automatic-tradeoff',
    title: 'Автовыбор БВС: время, налёт и баланс',
    summary:
      'Один RGB-участок и три совместимых БВС с разными базами, скоростями и доступностью АКБ. Три проверенных варианта выбираются реальным поиском.',
    expected: 'feasible_model',
    highlights: [
      'Автоматическое назначение',
      'Три разных плана',
      'Ресурс = суммарный налёт',
    ],
    checks: ['COMPATIBILITY', 'SEPARATION', 'BATTERIES', 'COVERAGE', 'METRICS'],
    create: () => {
      const d = base('automatic-tradeoff', 'Автовыбор БВС: время и налёт');
      d.scenario.area = rectangle(0, 0, 700, 600);
      d.scenario.airspace = rectangle(-400, -500, 1500, 1600);
      d.environment = {
        visibilityM: 5000,
        minVisibilityM: 1000,
        cloudBaseM: 250,
        cloudClearanceM: 50,
        source:
          'Синтетические постоянные условия; облака относительно общей модельной плоскости старта, не прогноз.',
      };
      Object.assign(d.planning, {
        maxComputeMs: 2000,
        maxSortiesPerVehicle: 8,
        separationVerticalM: 15,
        separationSource:
          'Учебные защитные расстояния и интервалы; не утверждённый норматив.',
      });
      setFleet(d, [
        {
          id: 'rgb-center',
          jobs: ['RGB', 'MS', 'IR'],
          x: 350,
          speed: 9,
          endurance: 26,
          delay: 300,
        },
        {
          id: 'rgb-near',
          jobs: ['RGB', 'MS', 'IR'],
          x: 80,
          speed: 6,
          endurance: 30,
        },
        {
          id: 'rgb-fast',
          jobs: ['RGB', 'MS', 'IR'],
          x: 620,
          speed: 12,
          endurance: 22,
          delay: 600,
        },
      ]);
      const names = [
        'RGB-A · центральная база',
        'RGB-B · ближняя база',
        'RGB-C · быстрый, АКБ позже',
      ];
      d.scenario.vehicles.forEach((vehicle, index) => {
        vehicle.name = names[index];
        vehicle.start = point([350, 80, 620][index], [-150, -100, -200][index]);
        vehicle.landing = [...vehicle.start];
        vehicle.assumptions = [
          'Все три учебных мультиротора совместимы с RGB. Скорость, ресурс и доступность АКБ заданы оператором для стенда.',
        ];
        vehicle.source =
          'Полностью синтетический профиль для демонстрации автоматического выбора, не паспорт реального БВС.';
      });
      d.scenario.reserveSites = d.scenario.vehicles.map(
        (vehicle) => vehicle.landing,
      );
      d.batteries = d.batteries.filter(
        (battery) => Number(battery.id.split('-').at(-1)) <= 3,
      );
      for (const battery of d.batteries) {
        const vehicle = d.scenario.vehicles.find(
          (v) => v.id === battery.vehicleId,
        )!;
        battery.name = `АКБ ${battery.id.split('-').at(-1)} · ${vehicle.name}`;
        battery.source =
          'Синтетическая доступность заряженного экземпляра АКБ; не измеренное время реальной подготовки.';
      }
      d.jobs = [job(d, 'rgb-01', 'RGB', d.scenario.area, 'rgb-center')];
      d.jobs[0].name = 'RGB · автоматический выбор совместимого БВС';
      d.jobs[0].assignedVehicleIds = [];
      d.notes =
        'Синтетическая задача 700 × 600 м. Назначения пусты: движок сам выбирает среди трёх совместимых БВС. RGB-B медленнее, но АКБ доступны сразу; RGB-A быстрее и готов через 300 с; RGB-C быстрее всех и готов через 600 с. Отличаются также базы и временной ресурс. Компромисс налёта — не физический износ. Геометрия и профили не являются разрешённым полётным заданием.';
      return parseMissionDocument(d);
    },
  },
  {
    id: 'mixed-fleet',
    title: 'Три работы и смешанный флот',
    summary:
      'RGB, мультиспектральная и ИК-съёмка назначены разным учебным БВС; ИК-батареи доступны позже.',
    expected: 'feasible_model',
    highlights: [
      'RGB + MS + IR',
      'Разные скорости и доступность',
      'Две цели на одном входе',
    ],
    checks: ['COMPATIBILITY', 'SEPARATION', 'WINDOW', 'COVERAGE'],
    create: () => {
      const d = base('mixed-fleet', 'Три работы и смешанный флот');
      d.scenario.wind.speedMps = 2;
      setFleet(d, [
        { id: 'rgb-1', jobs: ['RGB'], x: 80, speed: 8, model: 'Gemini' },
        { id: 'ms-1', jobs: ['MS'], x: 380, speed: 7, model: 'Gemini' },
        {
          id: 'ir-1',
          jobs: ['IR'],
          x: 680,
          speed: 6,
          delay: 240,
          model: '801',
        },
      ]);
      d.scenario.area = rectangle(0, 0, 780, 180);
      d.jobs = (['RGB', 'MS', 'IR'] as const).map((type, i) =>
        job(
          d,
          `job-${type.toLowerCase()}`,
          type,
          rectangle(i * 300, 0, 180, 180),
          d.scenario.vehicles[i].id,
        ),
      );
      return parseMissionDocument(d);
    },
  },
  {
    id: 'lidar-geophysics',
    title: 'LiDAR и геофизический подвес',
    summary:
      'Два явно учебных профиля: плотность лазерных точек и шаг геофизических измерений; подвес 10 м.',
    expected: 'feasible_model',
    highlights: ['LiDAR', 'Геофизика', 'Собственные правила качества'],
    checks: ['COMPATIBILITY', 'FLIGHT_ENVELOPE', 'SEPARATION', 'COVERAGE'],
    create: () => {
      const d = base('lidar-geophysics', 'LiDAR и геофизический подвес');
      setFleet(d, [
        { id: 'lidar-1', jobs: ['LiDAR'], x: 80, speed: 8 },
        { id: 'geo-1', jobs: ['Geophysics'], x: 380, speed: 6 },
      ]);
      d.scenario.area = rectangle(0, 0, 500, 200);
      d.jobs = [
        job(d, 'lidar', 'LiDAR', rectangle(0, 0, 200, 200), 'lidar-1'),
        job(
          d,
          'geophysics',
          'Geophysics',
          rectangle(300, 0, 200, 200),
          'geo-1',
        ),
      ];
      d.jobs[1].quality.sensorOffsetM = 10;
      return parseMissionDocument(d);
    },
  },
  {
    id: 'repeat-sorties',
    title: 'Повторные вылеты и смена АКБ',
    summary:
      'Один БВС с ограниченным ресурсом выполняет участок несколькими вылетами и обслуживается между ними.',
    expected: 'feasible_model',
    highlights: ['Один БВС', 'Несколько вылетов', 'Резерв и обслуживание'],
    checks: ['ENERGY', 'BATTERIES', 'WINDOW', 'EVENT_JOURNAL'],
    create: () => {
      const d = base('repeat-sorties', 'Повторные вылеты и смена АКБ');
      setFleet(d, [{ id: 'rgb-1', jobs: ['RGB'], x: 200, endurance: 12 }]);
      d.scenario.area = rectangle(0, 0, 600, 500);
      d.jobs = [job(d, 'rgb', 'RGB', d.scenario.area, 'rgb-1')];
      return parseMissionDocument(d);
    },
  },
  {
    id: 'timed-airspace',
    title: 'Ожидание временного запрета',
    summary:
      'Учебный запрет действует первые 15 минут до высоты 200 м. Работу можно выполнить после открытия зоны.',
    expected: 'feasible_model',
    highlights: ['4D-ограничение', 'Время старта', 'Без сокращения задания'],
    checks: ['FOUR_DIMENSIONAL', 'WINDOW', 'REQUESTED_AREA'],
    create: () => {
      const d = base('timed-airspace', 'Ожидание временного запрета');
      d.restrictions = [
        {
          id: 'temporary-zone',
          name: 'Зона открывается через 15 минут',
          kind: 'noFlight',
          geometry: rectangle(-50, -150, 450, 450),
          minAltitudeM: 0,
          maxAltitudeM: 200,
          startAt: d.window.start,
          endAt: instant(d, 900),
          source:
            'Учебное ограничение: координаты, высота над плоской поверхностью и UTC-интервал.',
        },
      ];
      return parseMissionDocument(d);
    },
  },
  {
    id: 'height-obstacle',
    title: 'Высотное препятствие под маршрутом',
    summary:
      'Препятствие высотой 40 м находится на переходе. Маршрут на высоте 100 м должен сохранять заданный вертикальный зазор.',
    expected: 'feasible_model',
    highlights: ['Препятствие 40 м', 'Различие высот', 'Переход на 100 м'],
    checks: ['GEOMETRY', 'FOUR_DIMENSIONAL', 'PHASES', 'RESERVE_LANDING'],
    create: () => {
      const d = base('height-obstacle', 'Высотное препятствие под маршрутом');
      setFleet(d, [{ id: 'rgb-1', jobs: ['RGB'], x: 0 }]);
      d.scenario.area = rectangle(350, 0, 300, 250);
      d.jobs = [job(d, 'rgb', 'RGB', d.scenario.area, 'rgb-1')];
      d.restrictions = [
        {
          id: 'tower',
          name: 'Учебное высотное препятствие',
          kind: 'obstacle',
          geometry: rectangle(130, -160, 100, 370),
          minAltitudeM: 0,
          maxAltitudeM: 40,
          startAt: null,
          endAt: null,
          source:
            'Синтетическое препятствие; высоты над объявленной плоской поверхностью.',
        },
      ];
      return parseMissionDocument(d);
    },
  },
  {
    id: 'area-with-hole',
    title: 'Участок с внутренним отверстием',
    summary:
      'Непрямоугольная рабочая область с отверстием демонстрирует сохранение геометрии при импорте и экспорте.',
    expected: 'feasible_model',
    highlights: [
      'Polygon с отверстием',
      'Полнота рабочих полос',
      'GeoJSON / KML',
    ],
    checks: ['GEOMETRY', 'STRIPS', 'REQUESTED_AREA', 'COVERAGE'],
    create: () => {
      const d = base('area-with-hole', 'Участок с внутренним отверстием');
      const area = rectangle(0, 0, 450, 350);
      area.coordinates.push(
        rectangle(160, 110, 90, 100).coordinates[0].slice().reverse(),
      );
      d.scenario.area = area;
      d.jobs = [job(d, 'rgb', 'RGB', area, 'rgb-1')];
      return parseMissionDocument(d);
    },
  },
  {
    id: 'wind-limit',
    title: 'Отказ: ветер выше предела',
    summary:
      'Ветер 20 м/с превышает предел 10 м/с доступного профиля. Требуется другое окно или подходящий БВС.',
    expected: 'rejected',
    highlights: ['Отрицательный пример', 'Предел профиля', 'Причина отказа'],
    checks: ['UNSUPPORTED_0', 'STRIPS'],
    create: () => {
      const d = base('wind-limit', 'Отказ: ветер выше предела');
      d.scenario.wind.speedMps = 20;
      return parseMissionDocument(d);
    },
  },
  {
    id: 'insufficient-energy',
    title: 'Отказ: недостаточный ресурс',
    summary:
      'При заряде 26% и резерве 25% не хватает энергии на полноценный вылет. Неполный план не становится успешным.',
    expected: 'rejected',
    highlights: ['Отрицательный пример', 'Резерв 25%', 'Батареи 26%'],
    checks: ['STRIPS', 'COVERAGE_rgb'],
    create: () => {
      const d = base('insufficient-energy', 'Отказ: недостаточный ресурс');
      for (const battery of d.batteries) battery.initialPct = 26;
      for (const vehicle of d.scenario.vehicles) vehicle.batteryPct = 26;
      return parseMissionDocument(d);
    },
  },
];
