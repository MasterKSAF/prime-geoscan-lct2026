import type { Check } from './schema.ts';
import type { MissionCandidate } from './mission-schema.ts';
import { canonicalStringify } from './mission-schema.ts';

export type MissionCandidateGroup = {
  representative: MissionCandidate;
  candidateIds: string[];
  objectives: MissionCandidate['objective'][];
};

/** A presentation key, never an evidence hash or a new solver candidate.
 * Only identity, objective and search/reference diagnostics are omitted.
 * Route geometry, altitudes, timing, resource state, checks and assumptions
 * retain their full precision and original order. No rounding or tolerances.
 */
function executionPresentationKey(candidate: MissionCandidate): string | null {
  const {
    id: _id,
    objective: _objective,
    trace: _trace,
    plan,
    ...execution
  } = candidate;
  const {
    createdAt: _createdAt,
    computationMs: _computationMs,
    trace: _planTrace,
    baseline: _referenceBaseline,
    scenario,
    ...planExecution
  } = plan;
  const { objective: _scenarioObjective, ...scenarioExecution } = scenario;
  const value = {
    ...execution,
    plan: { ...planExecution, scenario: scenarioExecution },
  };
  // JSON would collapse NaN and Infinity to null. Malformed values must not
  // make distinct candidates appear equivalent, even before API validation.
  const finite = (item: unknown): boolean =>
    typeof item === 'number'
      ? Number.isFinite(item)
      : Array.isArray(item)
        ? item.every(finite)
        : item !== null && typeof item === 'object'
          ? Object.values(item).every(finite)
          : true;
  return finite(value) ? canonicalStringify(value) : null;
}

/** Groups only identical execution payloads. All original candidate objects
 * remain untouched; selecting a group selects one original candidate ID.
 * A currently selected candidate stays the representative of its group.
 */
export function groupMissionCandidates(
  candidates: readonly MissionCandidate[],
  selectedCandidateId?: string,
): MissionCandidateGroup[] {
  const groups: MissionCandidateGroup[] = [];
  const byKey = new Map<string, MissionCandidateGroup>();
  for (const candidate of candidates) {
    const key = executionPresentationKey(candidate);
    const existing = key === null ? undefined : byKey.get(key);
    if (existing) {
      existing.candidateIds.push(candidate.id);
      if (!existing.objectives.includes(candidate.objective))
        existing.objectives.push(candidate.objective);
      if (candidate.id === selectedCandidateId)
        existing.representative = candidate;
      continue;
    }
    const group: MissionCandidateGroup = {
      representative: candidate,
      candidateIds: [candidate.id],
      objectives: [candidate.objective],
    };
    groups.push(group);
    if (key !== null) byKey.set(key, group);
  }
  return groups;
}

export type MissionCheckCategory =
  | 'routes'
  | 'separation'
  | 'weather'
  | 'battery'
  | 'survey'
  | 'other';
export type MissionCheckGroup = {
  id: MissionCheckCategory;
  title: string;
  status: Check['status'];
  checks: Check[];
  counts: Record<Check['status'], number>;
};
export type MissionCheckSummary = {
  groups: MissionCheckGroup[];
  counts: Record<Check['status'], number>;
  nonpasses: Check[];
  status: Check['status'];
};

const EXACT_CHECK_CATEGORIES: Readonly<Record<string, MissionCheckCategory>> = {
  GEOMETRY: 'routes',
  ROUTE: 'routes',
  SITE: 'routes',
  PHASES: 'routes',
  TIME: 'routes',
  ENDPOINTS: 'routes',
  FLIGHT_ENVELOPE: 'routes',
  FOUR_DIMENSIONAL: 'routes',
  ALTERNATE_ESCAPE: 'routes',
  TERRAIN: 'routes',
  ALTITUDE_PREFERENCE: 'routes',
  RESERVE_SITES: 'routes',
  SEPARATION: 'separation',
  GROUND_SEPARATION: 'separation',
  WIND: 'weather',
  WIND_LIMIT: 'weather',
  COMPATIBILITY: 'weather',
  DAYLIGHT: 'weather',
  CLOUD_CEILING: 'weather',
  VISIBILITY: 'weather',
  ENERGY: 'battery',
  BATTERY: 'battery',
  BATTERIES: 'battery',
  RESERVE_LANDING: 'battery',
  CALIBRATION: 'battery',
  STRIPS: 'survey',
  REQUESTED_AREA: 'survey',
  COVERAGE: 'survey',
  IMAGE_FOOTPRINTS: 'survey',
  PAYLOAD: 'survey',
  PAYLOAD_PROFILE: 'survey',
};

function categoryForCheck(check: Check): MissionCheckCategory {
  // Validators namespace checks as job-id:QUALITY_... or sortie-id:... .
  // Independent export verification also prefixes EXPORTED_. Neither prefix
  // is a reason to discard a check or infer a status from its prose.
  const id = check.id
    .split(':')
    .at(-1)!
    .replace(/^EXPORTED_/, '');
  if (id.startsWith('QUALITY_') || id.startsWith('COVERAGE_')) return 'survey';
  if (id.startsWith('FORECAST_')) return 'weather';
  return Object.hasOwn(EXACT_CHECK_CATEGORIES, id)
    ? EXACT_CHECK_CATEGORIES[id]
    : 'other';
}

function countChecks(
  checks: readonly Check[],
): Record<Check['status'], number> {
  const counts = { pass: 0, fail: 0, unknown: 0 };
  for (const check of checks) counts[check.status]++;
  return counts;
}

function aggregateStatus(
  counts: Record<Check['status'], number>,
): Check['status'] {
  return counts.fail > 0
    ? 'fail'
    : counts.unknown > 0 || counts.pass === 0
      ? 'unknown'
      : 'pass';
}

/** One source check belongs to exactly one group; unfamiliar check IDs remain
 * visible under Other. An empty group is unknown, never an implicit pass.
 * This summarizes the selected model plan, not real-flight certification.
 */
export function groupMissionChecks(
  checks: readonly Check[],
): MissionCheckSummary {
  const definitions: [MissionCheckCategory, string][] = [
    ['routes', 'Маршруты'],
    ['separation', 'Разнесение'],
    ['weather', 'Погода'],
    ['battery', 'Батарея'],
    ['survey', 'Съёмка'],
    ['other', 'Прочее'],
  ];
  const groups = definitions
    .map(([id, title]): MissionCheckGroup => {
      const own = checks.filter((check) => categoryForCheck(check) === id);
      const counts = countChecks(own);
      return {
        id,
        title,
        checks: own,
        counts,
        status: aggregateStatus(counts),
      };
    })
    .filter((group) => group.id !== 'other' || group.checks.length > 0);
  const counts = countChecks(checks);
  return {
    groups,
    counts,
    nonpasses: checks.filter((check) => check.status !== 'pass'),
    status:
      counts.fail > 0
        ? 'fail'
        : groups.some((group) => group.status === 'unknown')
          ? 'unknown'
          : aggregateStatus(counts),
  };
}
