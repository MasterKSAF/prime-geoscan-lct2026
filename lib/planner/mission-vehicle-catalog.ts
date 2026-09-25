import type { Vehicle } from './schema.ts';
import { GEOSCAN_201_MODEL_PROFILE } from './fixed-wing-profile.ts';
import {
  cameraProfilesForModel,
  modelCameraProfile,
} from './camera-catalog.ts';

export type CatalogueModel = Exclude<Vehicle['model'], 'Custom'>;
export type VehicleConfiguration = {
  id: string;
  name: string;
  jobs: Vehicle['jobs'];
  cameraIds: string[];
  detail: string;
};
export type VehicleCatalogueEntry = {
  model: CatalogueModel;
  name: string;
  kindLabel: string;
  description: string;
  source: string;
  savedSource: string;
  passport: { maxFlightMin: number; maxSpeedMps: number; maxWindMps: number };
  configurations: VehicleConfiguration[];
};

/** Model availability is not an inventory of physical aircraft. No catalogue
 * entry is silently inserted into a mission or a registered operational fleet. */
export const MISSION_VEHICLE_CATALOG: VehicleCatalogueEntry[] = [
  {
    model: 'Gemini',
    name: 'Геоскан Gemini',
    kindLabel: 'Коптер',
    description: 'Фотосъёмка или мультиспектр — по установленной камере.',
    source:
      'https://download.geoscan.ru/site-files/gemini/Gemini_Specs_EN_RUS.pdf?v2',
    savedSource: 'docs/geoscan-md/gemini-specs.md',
    passport: { maxFlightMin: 40, maxSpeedMps: 15, maxWindMps: 10 },
    configurations: [
      {
        id: 'rgb',
        name: 'RGB · PF1B',
        jobs: ['RGB'],
        cameraIds: ['pf1b'],
        detail:
          'Geoscan PF1B: матрица 23,5 × 15,6 мм, 6000 × 4000, объектив 20 мм. Высота и покрытие рассчитываются по этой камере.',
      },
      {
        id: 'ms',
        name: 'Мультиспектр · Pollux',
        jobs: ['MS'],
        cameraIds: ['pollux'],
        detail:
          'Geoscan Pollux: 5 каналов, 1440 × 1080 на канал, 8 мм. Выбрана мультиспектральная работа, не одновременно установленная PF1B.',
      },
    ],
  },
  {
    model: '801',
    name: 'Геоскан 801',
    kindLabel: 'Коптер',
    description: 'Камеры видимого спектра и тепловизор на одном подвесе.',
    source: 'https://download.geoscan.ru/site-files/801/Geoscan_801.pdf?v2',
    savedSource: 'docs/geoscan-md/geoscan-801.md',
    passport: { maxFlightMin: 40, maxSpeedMps: 15, maxWindMps: 10 },
    configurations: [
      {
        id: 'rgb-ir',
        name: 'RGB + ИК · штатный подвес',
        jobs: ['RGB', 'IR'],
        cameraIds: ['801-wide', '801-thermal'],
        detail:
          'Две камеры видимого спектра 12 Мп (4,35 и 16 мм), тепловизор 640 × 512 (9,1 мм). Автоматический полёт подтверждён брошюрой. Не заявляем синхронную съёмку или картографическую точность: параметры задания требуют отдельного профиля.',
      },
      {
        id: 'tele-ir',
        name: 'RGB 16 мм + тепловизор · штатный подвес',
        jobs: ['RGB', 'IR'],
        cameraIds: ['801-tele', '801-thermal'],
        detail:
          'Длиннофокусная RGB-камера 16 мм и тепловизор 9,1 мм. Точная геометрия матриц требует параметров установленной камеры; цифровой зум не подменяет оптику.',
      },
    ],
  },
  {
    model: '201',
    name: 'Геоскан 201',
    kindLabel: 'Самолёт',
    description:
      'Катапультный запуск, движущиеся развороты, парашютная посадка.',
    source: 'https://download.geoscan.ru/site-files/201/Geoscan_201_Manual.pdf',
    savedSource: 'docs/geoscan-md/geoscan-201-manual.md',
    passport: { maxFlightMin: 180, maxSpeedMps: 130 / 3.6, maxWindMps: 12 },
    configurations: [
      {
        id: 'rgb',
        name: 'RGB · фотокамера',
        jobs: ['RGB'],
        cameraIds: [],
        detail:
          'Камера ещё не выбрана. Укажите конкретную комплектацию: Sony DSC-RX1RM2, Sony ZV-E10 с объективом или Riebo R4/R6.',
      },
      {
        id: 'ms',
        name: 'Мультиспектр · Pollux',
        jobs: ['MS'],
        cameraIds: ['pollux'],
        detail:
          'Geoscan Pollux указан в руководстве как вариант полезной нагрузки. RGB-камера не считается установленной одновременно.',
      },
      ...(['sony-rx1rm2', 'sony-zv-e10', 'riebo-r4', 'riebo-r6'] as const).map(
        (id) => {
          const camera = cameraProfilesForModel('201').find(
            (c) => c.id === id,
          )!;
          return {
            id,
            name: `RGB · ${camera.name}`,
            jobs: ['RGB'] as Vehicle['jobs'],
            cameraIds: [id],
            detail: camera.source,
          };
        },
      ),
    ],
  },
];

export function vehicleCatalogueEntry(model: Vehicle['model']) {
  return MISSION_VEHICLE_CATALOG.find((entry) => entry.model === model);
}

export function installedVehicleConfiguration(vehicle: Vehicle): string {
  const configurations =
    vehicleCatalogueEntry(vehicle.model)?.configurations ?? [];
  if (vehicle.cameraIds !== undefined) {
    const selected = [...vehicle.cameraIds].sort().join(',');
    return (
      configurations.find(
        (c) =>
          [...c.cameraIds].sort().join(',') === selected &&
          [...c.jobs].sort().join(',') === [...vehicle.jobs].sort().join(','),
      )?.id ?? ''
    );
  }
  // Only legacy, unbound profiles may be matched by work type.
  return (
    configurations.find((c) => c.jobs.join(',') === vehicle.jobs.join(','))
      ?.id ?? ''
  );
}

export function catalogueCameraConfiguration(
  model: CatalogueModel,
  configurationId: string,
): Pick<Vehicle, 'jobs' | 'cameraIds' | 'cameraProfiles'> {
  const { configuration } = vehicleCatalogueConfiguration(
    model,
    configurationId,
  );
  return {
    jobs: [...configuration.jobs],
    cameraIds: [...configuration.cameraIds],
    cameraProfiles: cameraProfilesForModel(model).map((c) =>
      modelCameraProfile(c.id),
    ),
  };
}

export function vehicleCatalogueConfiguration(
  model: CatalogueModel,
  id?: string,
) {
  const entry = vehicleCatalogueEntry(model);
  const configuration = id
    ? entry?.configurations.find((item) => item.id === id)
    : entry?.configurations[0];
  if (!entry || !configuration)
    throw new Error('Неизвестная комплектация БВС.');
  return { entry, configuration };
}

/** Current model presets are deliberately separate from historic demo fixtures.
 * Passport maxima and assumed operating budgets are not interchangeable. */
export function createCatalogueVehicleProfile(
  model: Vehicle['model'],
  configurationId?: string,
): Omit<Vehicle, 'id' | 'name' | 'start' | 'landing'> {
  if (model === 'Custom') {
    if (configurationId)
      throw new Error('Для своего БВС комплектацию задаёт оператор.');
    return {
      model,
      kind: 'multirotor',
      enabled: true,
      airspeedMps: 9,
      maxWindMps: 10,
      batteryPct: 100,
      effectiveEnduranceMin: 28,
      climbMps: 3,
      descentMps: 1,
      turnSeconds: 4,
      jobs: ['RGB'],
      cameraIds: [],
      cameraProfiles: [],
      assumptions: [
        'Стартовые параметры — учебные допущения. Оператор должен задать ограничения своей комплектации.',
      ],
      source:
        'Профиль оператора: параметры и совместимость требуют подтверждения.',
    };
  }
  const { entry, configuration } = vehicleCatalogueConfiguration(
    model,
    configurationId,
  );
  const isWing = model === '201';
  return {
    model,
    kind: isWing ? 'fixedWing' : 'multirotor',
    enabled: true,
    airspeedMps: isWing ? 22 : model === '801' ? 8 : 9,
    maxAirspeedMps: isWing ? 110 / 3.6 : 15,
    maxWindMps: entry.passport.maxWindMps,
    batteryPct: 100,
    effectiveEnduranceMin: isWing ? 100 : model === '801' ? 25 : 28,
    climbMps: model === '801' ? 2 : 3,
    descentMps: isWing ? 2 : 1,
    turnSeconds: isWing ? 0 : model === '801' ? 5 : 4,
    ...catalogueCameraConfiguration(model, configuration.id),
    assumptions: [
      `Расчётная комплектация: ${configuration.name}. Фактическую установку оборудования подтверждает оператор; создание профиля не является телеметрией.`,
      `${isWing ? 100 : model === '801' ? 25 : 28} мин — консервативный расчётный бюджет при полном заряде, не измеренная выносливость. Паспортный максимум — до ${entry.passport.maxFlightMin} мин при определённых условиях.`,
      '100% — стартовое значение нового модельного профиля. Укажите фактический текущий заряд; будущая замена батареи не прогнозируется.',
      'Оптика берётся из установленной камеры БВС. Интервал 1 с и выдержка 1/1000 с — явный модельный режим, не паспортный предел; неполную геометрию камеры должен задать оператор.',
      isWing
        ? 'Включена упрощённая самолётная модель: крен, радиус и точность слежения — допущения. Нужны свободные коридоры запуска, разворотов и парашютной посадки; паспортный запас над препятствиями — 100 м.'
        : 'Скорости подъёма/снижения, манёвры и линейный расход энергии — модельные параметры; требуется калибровка по полётным логам.',
    ],
    source: entry.source,
    ...(isWing
      ? { fixedWingProfile: structuredClone(GEOSCAN_201_MODEL_PROFILE) }
      : {}),
  };
}
