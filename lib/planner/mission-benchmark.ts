import { canonicalStringify, sha256 } from './mission-schema.ts';
import { validateExportedCandidate } from './mission-validation.ts';
import type { MissionCandidate, MissionDocument } from './mission-schema.ts';
import type { Check } from './schema.ts';
import { SHOWCASE_SCENARIOS } from './mission-showcase.ts';
import { migrateMissionCameraBindings } from './camera-profile.ts';

export const BENCHMARK_PROTOCOL = 'same-input-two-baselines-v2' as const;

/** Fixed additional regression inputs declared before the v2 comparison run.
 * Public synthetic holdouts, not an unseen expert set or market sample. */
export function missionSearchHoldoutCases() {
  const base = () =>
    SHOWCASE_SCENARIOS.find((x) => x.id === 'automatic-tradeoff')!.create();
  return [
    {
      id: 'holdout-oblique-wind',
      edit: (d: MissionDocument) => {
        d.planning.windModel = 'constantAirspeed';
        d.scenario.wind = { speedMps: 2, fromDeg: 33 };
      },
    },
    {
      id: 'holdout-reverse-bases',
      edit: (d: MissionDocument) => {
        d.scenario.vehicles.reverse();
        d.jobs[0].job.bearingDeg = 123;
        d.jobs[0].job.autoBearing = true;
      },
    },
    {
      id: 'holdout-low-current-energy',
      edit: (d: MissionDocument) => {
        d.planning.windModel = 'constantAirspeed';
        d.scenario.wind = { speedMps: 3, fromDeg: 143 };
        d.scenario.vehicles.forEach((v) => {
          v.batteryPct = 55;
        });
        d.batteries.forEach((b) => {
          b.initialPct = 55;
        });
      },
    },
    {
      id: 'holdout-short-window',
      edit: (d: MissionDocument) => {
        d.window.end = new Date(
          Date.parse(d.window.start) + 900000,
        ).toISOString();
      },
    },
    {
      id: 'holdout-no-camera',
      edit: (d: MissionDocument) => {
        d.scenario.vehicles.forEach((v) => {
          v.jobs = ['IR'];
        });
      },
    },
    {
      id: 'holdout-no-useful-charge',
      edit: (d: MissionDocument) => {
        d.scenario.vehicles.forEach((v) => {
          v.batteryPct = 25.1;
        });
        d.batteries.forEach((b) => {
          b.initialPct = 25.1;
        });
      },
    },
  ].map(({ id, edit }) => {
    const document = base();
    edit(document);
    document.id = id;
    document.name = id;
    document.planning.maxComputeMs = 2000;
    return {
      id,
      group: 'fixed-public-search-holdout-v2',
      seed: null,
      expectation:
        id.endsWith('no-camera') || id.endsWith('no-useful-charge')
          ? 'must-reject'
          : 'observational-failures-retained',
      document,
    };
  });
}

function serialSchedule(candidate: MissionCandidate) {
  const sorties = [...candidate.sorties].sort(
    (a, b) => a.startSec - b.startSec,
  );
  return sorties.every(
    (sortie, i) => i === 0 || sortie.startSec >= sorties[i - 1].endSec - 1e-6,
  );
}

/** Saved pass flags and baseline metrics alone are not benchmark evidence. */
export async function benchmarkCandidate(
  document: MissionDocument,
  candidate: MissionCandidate,
  role: 'planned' | 'serial' | 'parallel',
) {
  document = migrateMissionCameraBindings(document).document;
  const checks: Check[] = await validateExportedCandidate(document, candidate);
  checks.push({
    id: 'BENCHMARK_POLICY',
    title: 'Актуальные политики',
    status:
      document.planning.safetyPolicy === 'continuous-occupancy-v1' &&
      document.planning.batteryPolicy === 'installed-current-v1'
        ? 'pass'
        : 'fail',
    detail:
      'Одинаковая непрерывная проверка безопасности и текущая установленная батарея.',
  });
  checks.push({
    id: 'BENCHMARK_INPUT',
    title: 'Одинаковый вход',
    status:
      candidate.plan.inputHash === (await sha256(document)) ? 'pass' : 'fail',
    detail:
      'Полный вход, включая задания, доступный парк, зоны, качество, ресурсы и бюджет поиска.',
  });
  if (role === 'serial')
    checks.push({
      id: 'BENCHMARK_SERIAL',
      title: 'Последовательный базовый план',
      status:
        serialSchedule(candidate) &&
        candidate.trace.some((row) => row.event === 'BASELINE_PROTOCOL')
          ? 'pass'
          : 'fail',
      detail:
        'Полные маршруты: одновременно летит не более одного БВС. Не конкурентное ПО и не доказанный оптимум.',
    });
  if (role === 'parallel')
    checks.push({
      id: 'BENCHMARK_PARALLEL',
      title: 'Параллельный жадный базовый план',
      status: candidate.trace.some(
        (row) => row.event === 'PARALLEL_BASELINE_PROTOCOL',
      )
        ? 'pass'
        : 'fail',
      detail:
        'Максимальные пакеты, исходный порядок, без откатов. Одновременные вылеты разрешены, но не обязательны; все ограничения проверяются заново.',
    });
  const failures = checks
    .filter((check) => check.status === 'fail')
    .map((check) => check.id);
  return {
    status: candidate.status,
    acceptedComplete:
      candidate.status === 'feasible_model' && failures.length === 0,
    failures,
    unknowns: checks
      .filter((check) => check.status === 'unknown')
      .map((check) => check.id),
    checks,
    metrics: structuredClone(candidate.metrics),
    candidateHash: await sha256(candidate),
  };
}

export async function compareBenchmarkCandidates(
  document: MissionDocument,
  planned: MissionCandidate,
  serial: MissionCandidate,
  baselineRole: 'serial' | 'parallel' = 'serial',
) {
  document = migrateMissionCameraBindings(document).document;
  const inputHash = await sha256(document),
    proposed = await benchmarkCandidate(document, planned, 'planned'),
    baseline = await benchmarkCandidate(document, serial, baselineRole),
    sameObjective = planned.objective === serial.objective,
    comparable =
      proposed.acceptedComplete && baseline.acceptedComplete && sameObjective,
    metric = planned.objective === 'makespan' ? 'makespanSec' : 'flightTimeSec',
    reason = [
      ...(!proposed.acceptedComplete
        ? ['Предлагаемый план не прошёл полную модельную проверку.']
        : []),
      ...(!baseline.acceptedComplete
        ? ['Базовый план не прошёл полную модельную проверку.']
        : []),
      ...(!sameObjective
        ? ['Критерии сравниваемых кандидатов не совпадают.']
        : []),
    ];
  return {
    protocol: BENCHMARK_PROTOCOL,
    baselineRole,
    inputHash,
    objective: planned.objective,
    comparable,
    reason,
    planned: proposed,
    serial: baseline,
    improvement: comparable
      ? {
          metric,
          absoluteSec: serial.metrics[metric] - planned.metrics[metric],
          percent:
            serial.metrics[metric] > 0
              ? (100 * (serial.metrics[metric] - planned.metrics[metric])) /
                serial.metrics[metric]
              : null,
          makespanSec: serial.metrics.makespanSec - planned.metrics.makespanSec,
          flightTimeSec:
            serial.metrics.flightTimeSec - planned.metrics.flightTimeSec,
        }
      : null,
  };
}

/** Nearest-rank percentiles; no hidden interpolation or dropped non-positive values. */
export function benchmarkDistribution(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = (p: number) =>
    sorted.length
      ? sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]
      : null;
  return {
    count: sorted.length,
    min: sorted[0] ?? null,
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1) ?? null,
  };
}

export function completeBenchmarkRunMatrix(
  declaredCaseIds: readonly string[],
  runs: readonly { caseId: string; repeat: number }[],
  repeats: number,
) {
  if (
    !Number.isInteger(repeats) ||
    repeats < 1 ||
    repeats > 10 ||
    new Set(declaredCaseIds).size !== declaredCaseIds.length
  )
    return false;
  const actual = runs.map((run) => `${run.caseId}:${run.repeat}`).sort(),
    expected = declaredCaseIds
      .flatMap((id) => Array.from({ length: repeats }, (_, i) => `${id}:${i}`))
      .sort();
  return canonicalStringify(actual) === canonicalStringify(expected);
}
