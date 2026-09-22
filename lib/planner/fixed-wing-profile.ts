import type { FixedWingProfile, Vehicle } from './schema.ts';
import { fixedWingProfileSchema } from './schema.ts';

/** Passport ceilings are not calibrated mission performance or a flight permit. */
export const GEOSCAN_201_PASSPORT = {
  model: '201',
  kind: 'fixedWing',
  source: 'https://download.geoscan.ru/site-files/201/Geoscan_201_Manual.pdf',
  savedSource: 'docs/geoscan-md/geoscan-201-manual.md',
  edition: '2026-03-30',
  pages: [11, 12, 94, 101, 104, 115],
  minAirspeedMps: 64 / 3.6,
  maxAirspeedMps: 130 / 3.6,
  maxWindMps: 12,
  maxEnduranceMin: 180,
  maxRouteM: 210000,
  minObstacleClearanceM: 100,
  obstacleClearanceAxis: 'vertical-above-terrain-and-objects',
  maxAltitudeM: 4000,
  launch: 'catapult',
  landing: 'parachute',
  flightPlanningSupported: true,
} as const;

/** Every non-passport value remains visible and explicitly marked assumed. */
export const GEOSCAN_201_MODEL_PROFILE: FixedWingProfile = {
  version: 'geoscan201-dubins-v1',
  bankLimitDeg: 25,
  minimumTurnRadiusM: 100,
  launchHeadingDeg: 0,
  parachuteDescentMps: 4,
  parachuteReleaseAltitudeM: 70,
  trackingToleranceM: 5,
  source:
    'Учебная модель: крен 25°, радиус ≥100 м, снижение парашюта 4 м/с и трубка слежения 5 м не калиброваны по полётным логам; паспорт https://download.geoscan.ru/site-files/201/Geoscan_201_Manual.pdf, с. 11–12, 94, 104, 115.',
};

export function fixedWingTurnRadius(v: Vehicle, windMps: number) {
  const profile = v.fixedWingProfile;
  if (!profile || windMps >= v.airspeedMps) return Infinity;
  // Conservative bank bound for a constant-air-speed trajectory in uniform wind.
  // R >= A (A + W)^2 / (g tan(bank) sqrt(A^2-W^2)).
  const air = v.airspeedMps;
  return Math.max(
    profile.minimumTurnRadiusM,
    (air * (air + windMps) ** 2) /
      (9.80665 *
        Math.tan((profile.bankLimitDeg * Math.PI) / 180) *
        Math.sqrt(air * air - windMps * windMps)),
  );
}

export type VehiclePlanningEligibility = {
  supported: boolean;
  model:
    | 'multirotor'
    | 'fixed-wing-model'
    | 'unsupported-fixed-wing'
    | 'invalid-profile';
  reasons: string[];
  source?: string;
};

/** Shared, explicit capability gate. This does not check job compatibility,
 * battery, enabled state or actual weather; those depend on the mission. */
export function vehiclePlanningEligibility(
  v: Vehicle,
): VehiclePlanningEligibility {
  if (v.model === '201' || v.kind === 'fixedWing') {
    const reasons: string[] = [];
    if (v.model === '201') {
      const p = GEOSCAN_201_PASSPORT;
      if (v.kind !== p.kind)
        reasons.push('Геоскан 201 — самолёт, профиль мультиротора неприменим.');
      if (v.airspeedMps < p.minAirspeedMps || v.airspeedMps > p.maxAirspeedMps)
        reasons.push(
          'Воздушная скорость 201 должна находиться в паспортном диапазоне 64–130 км/ч.',
        );
      if (v.maxWindMps > p.maxWindMps)
        reasons.push('Заданный предел ветра выше паспортных 12 м/с для 201.');
      if (v.effectiveEnduranceMin > p.maxEnduranceMin)
        reasons.push(
          'Расчётная продолжительность 201 превышает паспортный максимум 180 минут.',
        );
      if (
        v.maxAirspeedMps !== undefined &&
        (v.maxAirspeedMps < v.airspeedMps ||
          v.maxAirspeedMps > p.maxAirspeedMps)
      )
        reasons.push(
          'Максимальная воздушная скорость 201 должна быть не ниже рабочей и не выше 130 км/ч.',
        );
      if (!fixedWingProfileSchema.safeParse(v.fixedWingProfile).success)
        reasons.push(
          'Для самолётных манёвров, посадки и аварийного возврата нужен явный fixedWingProfile; старый профиль без этих параметров не активируется автоматически.',
        );
      else if (v.fixedWingProfile!.parachuteReleaseAltitudeM !== 70)
        reasons.push(
          'Для поддержанной конфигурации 201 высота выпуска парашюта 70 м по руководству (с. 104).',
        );
      return {
        supported: reasons.length === 0,
        model: reasons.length ? 'unsupported-fixed-wing' : 'fixed-wing-model',
        reasons,
        source: p.source,
      };
    }
    reasons.push(
      'Для произвольного самолётного типа нет проверенного паспортного/маневренного профиля. Поддержан только явно настроенный Геоскан 201; модель коптера не подставляется.',
    );
    return {
      supported: false,
      model: 'unsupported-fixed-wing',
      reasons,
    };
  }
  if (
    ['Gemini', '801'].includes(v.model) &&
    (v.airspeedMps > 15 || v.maxWindMps > 10)
  )
    return {
      supported: false,
      model: 'invalid-profile',
      reasons: [
        'Скорость или допустимый ветер превышают поддерживаемые пределы профиля Gemini/801: 15 и 10 м/с.',
      ],
    };
  return { supported: true, model: 'multirotor', reasons: [] };
}
