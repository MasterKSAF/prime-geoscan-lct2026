import { canonicalStringify } from './mission-schema.ts';
import type {
  MissionCandidate,
  MissionDocument,
  MissionRecommendation,
} from './mission-schema.ts';

const EPS = 1e-9;
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Compare physical plans, ignoring UI objective labels, trace and timestamps.
 * Exact coordinates/times are retained: this function never simplifies a route.
 */
function missionPlanKey(candidate: MissionCandidate): string {
  const sorties = candidate.sorties.map(
    ({ id: _id, name: _name, ...sortie }) => sortie,
  );
  sorties.sort(
    (a, b) =>
      compareText(a.vehicleId, b.vehicleId) ||
      a.startSec - b.startSec ||
      compareText(a.jobId, b.jobId) ||
      compareText(a.batteryId, b.batteryId),
  );
  return canonicalStringify({
    sorties,
    jobCoverage: [...candidate.jobCoverage].sort((a, b) =>
      compareText(a.jobId, b.jobId),
    ),
  });
}

export function sameMissionPlan(
  a: MissionCandidate,
  b: MissionCandidate,
): boolean {
  return missionPlanKey(a) === missionPlanKey(b);
}

/** This ranks an already validated solver pool; it is not a trajectory verifier.
 * Completeness and declared model safety are gates, never weighted trade-offs.
 */
export function buildMissionRecommendation(
  document: MissionDocument,
  pool: readonly MissionCandidate[],
  presented: readonly MissionCandidate[],
): MissionRecommendation | undefined {
  const eligible = pool.filter(
    (candidate) =>
      candidate.status === 'feasible_model' &&
      candidate.sorties.length > 0 &&
      !candidate.checks.some((check) => check.status === 'fail') &&
      !candidate.plan.checks.some((check) => check.status === 'fail') &&
      candidate.metrics.minimumRemainingPct + 1e-6 >=
        document.scenario.reservePct &&
      candidate.metrics.grossCoveragePct >= 99 &&
      candidate.metrics.coveragePct >= 99 &&
      candidate.jobCoverage.length === document.jobs.length &&
      document.jobs.every((job) =>
        candidate.jobCoverage.some(
          (row) =>
            row.jobId === job.id &&
            row.coveragePct >= 99 &&
            row.grossCoveragePct >= 99,
        ),
      ) &&
      Number.isFinite(candidate.metrics.makespanSec) &&
      candidate.metrics.makespanSec > 0 &&
      Number.isFinite(candidate.metrics.flightTimeSec) &&
      candidate.metrics.flightTimeSec > 0,
  );
  if (!eligible.length) return undefined;

  const range = (key: 'makespanSec' | 'flightTimeSec') => ({
    min: Math.min(...eligible.map((candidate) => candidate.metrics[key])),
    max: Math.max(...eligible.map((candidate) => candidate.metrics[key])),
  });
  const ranges = {
    makespanSec: range('makespanSec'),
    flightTimeSec: range('flightTimeSec'),
  };
  const normalize = (value: number, bounds: { min: number; max: number }) =>
    bounds.max === bounds.min
      ? 0
      : (value - bounds.min) / (bounds.max - bounds.min);
  const ranked = eligible.map((candidate) => {
    const normalized = {
      makespan: normalize(candidate.metrics.makespanSec, ranges.makespanSec),
      flightTime: normalize(
        candidate.metrics.flightTimeSec,
        ranges.flightTimeSec,
      ),
    };
    return {
      candidate,
      normalized,
      key: missionPlanKey(candidate),
      score: 0.5 * normalized.makespan + 0.5 * normalized.flightTime,
    };
  });
  ranked.sort((a, b) => {
    if (Math.abs(a.score - b.score) > EPS) return a.score - b.score;
    const reserve =
      b.candidate.metrics.minimumRemainingPct -
      a.candidate.metrics.minimumRemainingPct;
    if (Math.abs(reserve) > EPS) return reserve;
    return (
      a.candidate.sorties.length - b.candidate.sorties.length ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    );
  });
  const winner = ranked[0];
  const candidate = structuredClone(winner.candidate);
  candidate.id = 'balanced';
  const samePlanAs = presented
    .filter((item) => sameMissionPlan(candidate, item))
    .map((item) => item.objective);
  const explanation =
    'Компромисс 50/50 среди найденных полных вариантов без проваленных модельных проверок: ' +
    '0,5 × (T − min T)/(max T − min T) + 0,5 × (F − min F)/(max F − min F), меньше лучше. ' +
    'T — время завершения, F — суммарный налёт; при нулевом диапазоне компонент равен 0. ' +
    'При равной оценке выбраны больший остаток ресурса, затем меньше вылетов, затем детерминированный ключ плана. ' +
    'Налёт — ресурсный proxy, не физический износ оборудования. Глобальная оптимальность не доказана.';
  candidate.assumptions.push(explanation);
  return {
    candidate,
    policy: 'balanced-normalized-v1',
    weights: { makespan: 0.5, flightTime: 0.5 },
    score: winner.score,
    normalized: winner.normalized,
    ranges,
    poolSize: eligible.length,
    distinctPlanCount: new Set(ranked.map((item) => item.key)).size,
    samePlan: samePlanAs.length > 0,
    samePlanAs,
    explanation,
    resourceProxy: 'flightTimeSec',
  };
}
