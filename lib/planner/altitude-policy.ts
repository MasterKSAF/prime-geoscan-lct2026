import type { Check, Segment } from './schema.ts';

/** Track requirement confirmed by the expert on 22.09.2026. Not a flight permit.
 * FAP 138's simplified regime says LESS THAN 150 m above ground/water.
 * A 1 m planning guard is our engineering choice, not a statutory separation. */
export const TRACK_ALTITUDE_LIMIT_M = 150;
export const AUTO_ALTITUDE_CEILING_M = 149;

export function trackAltitudeAllowed(heightM: number): boolean {
  return (
    Number.isFinite(heightM) && heightM >= 0 && heightM < TRACK_ALTITUDE_LIMIT_M
  );
}

export function trackAltitudeCheck(
  workHeights: readonly number[],
  segments: readonly Pick<Segment, 'altitudeFromM' | 'altitudeToM'>[] = [],
): Check {
  const heights = workHeights.concat(
    segments.flatMap((s) => [s.altitudeFromM, s.altitudeToM]),
  );
  const invalid = heights.filter((h) => !trackAltitudeAllowed(h));
  return {
    id: 'TRACK_ALTITUDE',
    status: invalid.length ? 'fail' : 'pass',
    title: 'Предел трека: ниже 150 м AGL',
    detail: invalid.length
      ? `Высота ${invalid[0]} м недопустима: требуется 0 ≤ H < 150 м над поверхностью во всех фазах, включая переходы и возврат. Снизьте высоту или измените маршрут; расширение входного коридора не отменяет предел.`
      : 'Рабочие высоты и оба конца каждого линейного сегмента ниже 150 м над принятой поверхностью; поэтому предел соблюдается и между концами. Рельеф/реальный AGL требуют подтверждения; это не разрешение на полёт.',
  };
}
