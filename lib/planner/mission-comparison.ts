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
  const eligible = pool
    .filter(
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
    )
    .filter(
      (c) =>
        c.metrics.makespanSec <=
          (Date.parse(document.window.end) -
            Date.parse(document.window.start)) /
            1000 +
            1e-6 &&
        new Set(c.sorties.map((s) => s.vehicleId)).size <=
          (document.planning.maxVehicles ?? 20),
    );
  if (!eligible.length) return undefined;
  const deadlineSec =
    (Date.parse(document.window.end) - Date.parse(document.window.start)) /
    1000;
  const ranked = eligible.map((candidate) => ({
    candidate,
    key: missionPlanKey(candidate),
  }));
  ranked.sort((a, b) => {
    const flight =
      a.candidate.metrics.flightTimeSec - b.candidate.metrics.flightTimeSec;
    if (Math.abs(flight) > EPS) return flight;
    const end =
      a.candidate.metrics.makespanSec - b.candidate.metrics.makespanSec;
    if (Math.abs(end) > EPS) return end;
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
    'Уложиться в срок: минимальный суммарный налёт среди найденных полных планов, прошедших проверки срока, лимита БВС и безопасности. ' +
    'При равном налёте — более раннее завершение, затем больший остаток батареи и меньше вылетов. ' +
    'Поскольку срок обязателен для всех вариантов, этот выбор может совпадать с «Меньше налёт»; это не отдельная выгода. ' +
    'Налёт — время в воздухе, не физический износ. Глобальная оптимальность не доказана.';
  candidate.assumptions.push(explanation);
  return {
    candidate,
    policy: 'deadline-min-flight-v1',
    deadlineSec,
    slackSec: deadlineSec - candidate.metrics.makespanSec,
    poolSize: eligible.length,
    distinctPlanCount: new Set(ranked.map((item) => item.key)).size,
    samePlan: samePlanAs.length > 0,
    samePlanAs,
    explanation,
    resourceProxy: 'flightTimeSec',
  };
}
