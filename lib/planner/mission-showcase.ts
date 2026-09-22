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
  walkthrough?: string[];
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
    model?: Vehicle['model'];
  }[],
) {
  const template = d.scenario.vehicles[0];
  d.planning.batteryPolicy = 'installed-current-v1';
  d.planning.safetyPolicy = 'continuous-occupancy-v1';
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
  d.batteries = d.scenario.vehicles.flatMap((vehicle) =>
    Array.from({ length: 1 }, (_, battery) => ({
      id: `${vehicle.id}-battery-${battery + 1}`,
      vehicleId: vehicle.id,
      name: `АКБ ${battery + 1} · ${vehicle.id}`,
      initialPct: 100,
      readyAt: instant(d, 0),
      rechargeSec: null,
      cycles: null,
      commissionedAt: null,
      source:
        'Текущая батарея учебного БВС. Замена не прогнозируется; повторные вылеты используют остаток.',
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
      'Фотосъёмка участка: подбор одного аппарата или группы с учётом баз, скорости и ресурса. Все заданные батареи доступны к старту.',
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
        },
      ]);
      const names = [
        'БВС 01 · центральная база',
        'БВС 02 · ближняя база',
        'БВС 03 · быстрый',
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
        'Синтетическая задача 700 × 600 м. Назначения автоматические. Все заданные АКБ доступны к началу; базы, скорости и ресурс различаются. Сравниваются время завершения и суммарный налёт, не физический износ. Число различных найденных вариантов не гарантируется. Это не разрешение полёта.';
      return parseMissionDocument(d);
    },
  },
  {
    id: 'mixed-fleet',
    title: 'Три работы и смешанный флот',
    summary:
      'Фотосъёмка, мультиспектральная и тепловая съёмка назначены разным учебным БВС. Все батареи доступны к началу.',
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
    title: 'Три вылета на текущей батарее',
    summary:
      'Один БВС выполняет три небольших участка, каждый раз продолжая с остатком заряда. Без замены батареи.',
    expected: 'feasible_model',
    highlights: ['Один БВС', 'Несколько вылетов', 'Резерв и обслуживание'],
    checks: ['ENERGY', 'BATTERIES', 'WINDOW', 'EVENT_JOURNAL'],
    create: () => {
      const d = base('repeat-sorties', 'Три вылета на текущей батарее');
      setFleet(d, [{ id: 'rgb-1', jobs: ['RGB'], x: 200, endurance: 28 }]);
      d.scenario.area = rectangle(0, 0, 600, 500);
      d.jobs = [100, 240, 380].map((x, i) =>
        job(d, `rgb-${i + 1}`, 'RGB', rectangle(x, 0, 100, 100), 'rgb-1'),
      );
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

/** Three short presentation stories. Legacy acceptance examples retain their IDs. */
export const DEMONSTRATION_SCENARIOS: ShowcaseScenario[] = [
  {
    id: 'demo-01-survey',
    title: '1. Съёмка участка — от задания до результата',
    summary:
      'Квадратный участок 600 × 600 м. Три БВС в парке; система распределяет фотосъёмку и сравнивает время с общим налётом.',
    expected: 'feasible_model',
    highlights: [
      'Создание и изменение задания',
      'Автовыбор группы',
      'История, заряд и доказательства',
    ],
    checks: ['COMPATIBILITY', 'SEPARATION', 'BATTERIES', 'COVERAGE', 'METRICS'],
    walkthrough: [
      'Откройте или загрузите JSON; измените название и сохраните копию.',
      'Посмотрите участок и три БВС во вкладке «Парк».',
      'Рассчитайте варианты и выберите: раньше закончить или меньше летать.',
      'Подтвердите план, запустите симуляцию и дождитесь посадки.',
      'Откройте историю и результаты: остатки заряда, проверки, комплект JSON. Снимки в симуляции не создаются.',
    ],
    create: () => {
      const d = SHOWCASE_SCENARIOS[0].create();
      d.id = 'demo-01-survey';
      d.name = 'Демо 1 · Фотосъёмка квадрата';
      d.scenario.name = d.name;
      d.scenario.area = rectangle(0, 0, 600, 600);
      d.jobs[0].area = structuredClone(d.scenario.area);
      d.jobs[0].name = 'Фотосъёмка · квадрат 600 × 600 м';
      d.notes = `${synthetic} Первый показ: загрузка/редактирование, автоматическое распределение, выбор плана, симуляция, история и доказательства. Три БВС доступны; число задействованных определяет расчёт, не сценарий показа. Реальные фотографии не создаются.`;
      return parseMissionDocument(d);
    },
  },
  {
    id: 'demo-02-obstacles',
    title: '2. Препятствие и совместная работа',
    summary:
      'Два БВС выполняют RGB и мультиспектральную съёмку одного участка. Высокое препятствие перекрывает прямой переход от баз.',
    expected: 'feasible_model',
    highlights: [
      'Обход препятствия',
      'Разнесение по времени',
      'Два вида съёмки',
    ],
    checks: [
      'COMPATIBILITY',
      'SEPARATION',
      'GEOMETRY',
      'FOUR_DIMENSIONAL',
      'COVERAGE',
    ],
    walkthrough: [
      'Откройте сценарий и рассмотрите препятствие в «Условия».',
      'Покажите два аппарата с разными камерами и отдельные площадки старта.',
      'Рассчитайте маршрут: препятствие обходится сбоку, работы согласуются по времени.',
      'Запустите симуляцию; выберите БВС на карте, покажите этап, батарею и маршрут.',
      'В результатах раскройте проверки разнесения и объёмов; скачайте доказательства.',
    ],
    create: () => {
      const d = base(
        'demo-02-obstacles',
        'Демо 2 · Обход и согласованная съёмка',
      );
      setFleet(d, [
        {
          id: 'demo-rgb',
          jobs: ['RGB'],
          x: 0,
          speed: 8,
          endurance: 35,
          model: 'Gemini',
        },
        {
          id: 'demo-ms',
          jobs: ['MS'],
          x: 0,
          speed: 6,
          endurance: 35,
          model: 'Gemini',
        },
      ]);
      d.scenario.vehicles[1].start = point(0, 400);
      d.scenario.vehicles[1].landing = point(0, 400);
      d.scenario.vehicles[0].name = 'БВС 01 · фотокамера';
      d.scenario.vehicles[1].name = 'БВС 02 · мультиспектр';
      d.scenario.reserveSites = d.scenario.vehicles.map((v) => v.landing);
      d.scenario.area = rectangle(400, 50, 280, 220);
      d.scenario.airspace = rectangle(-350, -400, 1550, 1450);
      d.scenario.wind = { speedMps: 2, fromDeg: 270 };
      d.jobs = [
        job(d, 'demo-rgb-work', 'RGB', d.scenario.area, 'demo-rgb'),
        job(d, 'demo-ms-work', 'MS', d.scenario.area, 'demo-ms'),
      ];
      d.jobs[0].name = 'Фотосъёмка участка';
      d.jobs[1].name = 'Мультиспектральная съёмка участка';
      d.restrictions = [
        {
          id: 'demo-tall-building',
          name: 'Препятствие 160 м · прямой путь закрыт',
          kind: 'obstacle',
          geometry: rectangle(150, -200, 100, 650),
          minAltitudeM: 0,
          maxAltitudeM: 160,
          startAt: null,
          endAt: null,
          source:
            'Синтетическое высокое препятствие; высоты от общей плоской поверхности. Коридоры обхода заданы воздушной областью.',
        },
      ];
      d.notes = `${synthetic} Две камеры снимают один участок: RGB и MS — разные работы. Переходы от баз должны обойти препятствие сбоку, не поверх него: рабочая высота 100 м, препятствие 160 м. Реальные пределы 35 минут, расстояния 30/20 м и 2 с — учебные допущения. Приёмочный тест отдельно проверяет конфликт при искусственном совмещении стартов.`;
      return parseMissionDocument(d);
    },
  },
  {
    id: 'demo-03-repair',
    title: '3. Ресурса не хватает — что изменить',
    summary:
      'БВС 07 с фотокамерой и зарядом 26% должен снять участок при резерве 25%. Вместо опасного запуска — причины отказа и проверка исправлений.',
    expected: 'rejected',
    highlights: [
      'Объяснение отказа',
      'Гипотеза замены батареи',
      'Повторный расчёт и новая копия',
    ],
    checks: ['STRIPS', 'COVERAGE_demo-repair-rgb'],
    walkthrough: [
      'Загрузите JSON и покажите БВС 07: камера и текущие 26%.',
      'Нажмите «Рассчитать варианты»: неполный результат нельзя подтвердить.',
      'Результаты → Анализ → «Что изменить»: проверьте замену батареи БВС 07 на 100%.',
      'Сравните с автовыбором и дополнительными 30 минутами: одно ожидание не добавляет заряд.',
      'Подтвердите понимание гипотезы, откройте отдельную копию, повторно рассчитайте и запустите симуляцию. Реальный парк не изменён.',
    ],
    create: () => {
      const d = base(
        'demo-03-repair',
        'Демо 3 · Недостаточный заряд и решение',
      );
      setFleet(d, [
        {
          id: 'demo-07',
          jobs: ['RGB'],
          x: 150,
          model: 'Gemini',
          endurance: 28,
        },
      ]);
      d.scenario.vehicles[0].name = 'БВС 07 · фотокамера PF1B';
      d.scenario.vehicles[0].batteryPct = 26;
      d.batteries[0].initialPct = 26;
      d.jobs = [job(d, 'demo-repair-rgb', 'RGB', d.scenario.area, 'demo-07')];
      d.jobs[0].name = 'Фотосъёмка · требуется весь участок';
      d.notes = `${synthetic} Заряд 26% при резерве 25%: ожидается отказ. Проверяется гипотеза замены установленной батареи БВС 07 перед стартом; ожидание само по себе не заряжает батарею. Выданная рекомендация не является командой и не изменяет телеметрию или историю парка.`;
      return parseMissionDocument(d);
    },
  },
];
