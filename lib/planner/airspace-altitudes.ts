import { z } from 'zod';

/** Pressure altitude is not AGL. This is a declared model, never live QNH. */
export const airspaceAltitudeReferenceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('standard-atmosphere'),
      source: z.string().min(1).max(500),
    })
    .strict(),
  z
    .object({
      kind: z.literal('pressure-altitude-offset'),
      // pressure altitude = AMSL + offset, within the declared uncertainty.
      offsetM: z.number().min(-3000).max(3000),
      uncertaintyM: z.number().min(0).max(3000),
      source: z.string().min(1).max(500),
    })
    .strict(),
  z
    .object({ kind: z.literal('unknown'), source: z.string().min(1).max(500) })
    .strict(),
]);
export type AirspaceAltitudeReference = z.infer<
  typeof airspaceAltitudeReferenceSchema
>;
export type AltitudeDatum =
  | 'AGL'
  | 'AMSL'
  | 'FL'
  | 'mission-reference'
  | 'ground'
  | 'unlimited'
  | 'unknown';
export type AltitudeBound = { reference: AltitudeDatum; value: number | null };
export type AirspaceAltitudeContext = {
  terrainModel:
    | { kind: 'unknown'; source: string }
    | { kind: 'flat'; elevationM: number; source: string };
  airspaceAltitudeReference?: AirspaceAltitudeReference;
};
export type ParsedZoneAltitude = {
  status: 'parsed' | 'unresolved';
  lower: AltitudeBound;
  upper: AltitudeBound;
  raw: string;
  conditions: string;
  warnings: string[];
};
const unknownBound = (): AltitudeBound => ({
  reference: 'unknown',
  value: null,
});
const defaultAtmosphere: AirspaceAltitudeReference = {
  kind: 'standard-atmosphere',
  source:
    'Стандартная атмосфера ISA — модель стенда по умолчанию, не измеренное давление.',
};
export const atmosphereFor = (d: AirspaceAltitudeContext) =>
  d.airspaceAltitudeReference ?? defaultAtmosphere;

function bound(text: string): AltitudeBound | null {
  const value = text.trim();
  if (/^(земли|земля|GND|SFC)$/iu.test(value))
    return { reference: 'ground', value: 0 };
  if (/^(UNL|неограниченно|бесконечности)$/iu.test(value))
    return { reference: 'unlimited', value: null };
  const fl = /^FL\s*(\d{1,3}(?:[.,]\d+)?)$/iu.exec(value);
  if (fl) return { reference: 'FL', value: Number(fl[1].replace(',', '.')) };
  // Parenthesized feet in the supplied catalogue are rounded equivalents.
  // Metres remain authoritative; annotations cannot silently change the datum.
  const metres =
    /^(\d+(?:[.,]\d+)?)\s*[мm](?:\s*\(\d+(?:[.,]\d+)?(?:\s*(?:ф[уy]т|ft))?\))?\s*(AGL|AMSL)$/iu.exec(
      value,
    );
  if (metres)
    return {
      reference: metres[2].toUpperCase() as 'AGL' | 'AMSL',
      value: Number(metres[1].replace(',', '.')),
    };
  const feet = /^(\d+(?:[.,]\d+)?)\s*(?:ft|фут)\s*(AGL|AMSL)$/iu.exec(value);
  if (feet)
    return {
      reference: feet[2].toUpperCase() as 'AGL' | 'AMSL',
      value: Number(feet[1].replace(',', '.')) * 0.3048,
    };
  return null;
}

/** Only a complete, recognized altitude clause is usable; prose exemptions stay inactive. */
export function parseZoneAltitude(raw: string): ParsedZoneAltitude {
  const lines = raw
    .replace(/\u00a0/g, ' ')
    .trim()
    .split(/\r?\n/);
  const warnings: string[] = [];
  let first = (lines.shift() ?? '').trim();
  if (/^Некорректная геометрия!\s*/iu.test(first)) {
    warnings.push(
      'В источнике отмечена некорректная геометрия; контур проверяется отдельно.',
    );
    first = first.replace(/^Некорректная геометрия!\s*/iu, '');
  }
  const conditions = lines.join('\n').trim();
  if (conditions)
    warnings.push(
      'Текстовые исключения не дают автоматического допуска этой миссии.',
    );
  const unresolved = (): ParsedZoneAltitude => ({
    status: 'unresolved',
    lower: unknownBound(),
    upper: unknownBound(),
    raw,
    conditions,
    warnings,
  });
  if (/^(?:На всех высотах(?:\s+GND\s*-\s*UNL)?|GND\s*-\s*UNL)$/iu.test(first))
    return {
      status: 'parsed',
      lower: { reference: 'ground', value: 0 },
      upper: { reference: 'unlimited', value: null },
      raw,
      conditions,
      warnings,
    };
  const range = /^[ОO]т\s+(.+?)\s+до\s+(.+)$/iu.exec(first);
  const from = /^[ОO]т\s+(.+)$/iu.exec(first);
  const lower = range ? bound(range[1]) : from ? bound(from[1]) : null;
  const upper = range
    ? bound(range[2])
    : from
      ? { reference: 'unlimited' as const, value: null }
      : null;
  if (!lower || !upper || lower.reference === 'unlimited') return unresolved();
  if (
    [lower, upper].some(
      (b) =>
        b.value !== null &&
        (!Number.isFinite(b.value) || b.value < 0 || b.value > 60000),
    )
  )
    return unresolved();
  if (
    lower.reference === upper.reference &&
    lower.value !== null &&
    upper.value !== null &&
    lower.value > upper.value
  )
    return unresolved();
  return { status: 'parsed', lower, upper, raw, conditions, warnings };
}

export function localAltitudeBound(
  bound: AltitudeBound,
  side: 'lower' | 'upper',
  d: AirspaceAltitudeContext,
): number | null {
  if (bound.reference === 'unlimited' || bound.reference === 'unknown')
    return null;
  if (bound.reference === 'ground') return 0;
  if (bound.value === null) return null;
  if (bound.reference === 'mission-reference') return bound.value;
  // AGL and ground are meaningful in the solver only on its declared flat surface.
  if (d.terrainModel.kind !== 'flat') return null;
  if (bound.reference === 'AGL') return bound.value;
  if (bound.reference === 'AMSL')
    return bound.value - d.terrainModel.elevationM;
  const atmosphere = atmosphereFor(d);
  if (atmosphere.kind === 'unknown') return null;
  const offset =
    atmosphere.kind === 'pressure-altitude-offset' ? atmosphere.offsetM : 0;
  const uncertainty =
    atmosphere.kind === 'pressure-altitude-offset'
      ? atmosphere.uncertaintyM
      : 0;
  return (
    bound.value * 30.48 -
    offset -
    d.terrainModel.elevationM +
    (side === 'lower' ? -uncertainty : uncertainty)
  );
}

export function resolveZoneAltitude(
  parsed: ParsedZoneAltitude,
  d: AirspaceAltitudeContext,
) {
  let lower = localAltitudeBound(parsed.lower, 'lower', d);
  let upper = localAltitudeBound(parsed.upper, 'upper', d);
  let resolved =
    parsed.status === 'parsed' &&
    lower !== null &&
    (upper !== null || parsed.upper.reference === 'unlimited');
  // Do not turn contradictory mixed-datum ranges into empty, permissive space.
  if (lower !== null && upper !== null && lower > upper) {
    lower = null;
    upper = null;
    resolved = false;
  }
  const usesFl =
    parsed.lower.reference === 'FL' || parsed.upper.reference === 'FL';
  return {
    resolved,
    // Preserve each independently known bound. An unknown upper does not erase a known lower.
    minAltitudeM: Math.max(-500, lower ?? -500),
    maxAltitudeM: upper === null ? null : Math.max(-500, upper),
    conversion: {
      terrain: d.terrainModel,
      atmosphere: usesFl ? atmosphereFor(d) : null,
      basis: usesFl
        ? 'declared-pressure-altitude-model'
        : 'declared-terrain-model',
      flightPermission: false,
    },
  };
}
