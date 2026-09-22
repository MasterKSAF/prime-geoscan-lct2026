import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus, totalmem, platform, release, arch } from 'node:os';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { demoMission } from '../lib/planner/mission-demo.ts';
import {
  solveMissionDocument,
  solveMissionSerialBaseline,
  solveMissionParallelBaseline,
} from '../lib/planner/mission-engine.ts';
import {
  BENCHMARK_PROTOCOL,
  benchmarkDistribution,
  compareBenchmarkCandidates,
  completeBenchmarkRunMatrix,
  missionSearchHoldoutCases,
} from '../lib/planner/mission-benchmark.ts';
import {
  canonicalStringify,
  parseMissionDocument,
  sha256,
} from '../lib/planner/mission-schema.ts';
import { missionEvidence } from '../lib/planner/mission-export.ts';
import { verifyMissionEvidence } from './verify-mission-evidence.ts';
import type {
  MissionCandidate,
  MissionDocument,
  MissionResult,
} from '../lib/planner/mission-schema.ts';

const sourceFiles = [
  'scripts/benchmark-missions.ts',
  'scripts/verify-mission-evidence.ts',
  'package-lock.json',
];
const objectives = ['makespan', 'flightTime'] as const;
const root = fileURLToPath(new URL('../', import.meta.url));
const timing = async <T>(action: () => Promise<T>) => {
  const wall = performance.now(),
    cpu = process.cpuUsage();
  const value = await action(),
    elapsed = process.cpuUsage(cpu);
  return {
    value,
    wallMs: performance.now() - wall,
    cpuMs: (elapsed.user + elapsed.system) / 1000,
  };
};
async function sourceHashes() {
  const plannerFiles = (await readdir(resolve(root, 'lib/planner')))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => `lib/planner/${name}`);
  return Object.fromEntries(
    await Promise.all(
      [...sourceFiles, ...plannerFiles].sort().map(async (file) => [
        file,
        createHash('sha256')
          .update(await readFile(resolve(root, file)))
          .digest('hex'),
      ]),
    ),
  );
}

export function benchmarkCases() {
  const cases = SHOWCASE_SCENARIOS.map((scenario) => ({
    id: scenario.id,
    group: 'showcase',
    seed: null as number | null,
    expectation: scenario.expected as string,
    document: scenario.create(),
  }));
  // Predeclared parameter grid, not selected after observing improvements.
  for (const [index, speed, direction, soc] of [
    [1, 1, 0, 100],
    [2, 2, 90, 90],
    [3, 4, 180, 80],
    [4, 6, 270, 60],
  ]) {
    const document = SHOWCASE_SCENARIOS[0].create();
    document.id = `parameter-grid-${index}`;
    document.name = `Контрольная сетка: ветер ${speed} м/с, ${direction}°, заряд ${soc}%`;
    document.scenario.wind = { speedMps: speed, fromDeg: direction };
    for (const vehicle of document.scenario.vehicles) vehicle.batteryPct = soc;
    for (const battery of document.batteries) battery.initialPct = soc;
    cases.push({
      id: document.id,
      group: 'predeclared-parameter-grid',
      seed: null,
      expectation: 'observational-no-promised-success',
      document,
    });
  }
  for (const size of [10, 100] as const) {
    const document = demoMission(size);
    document.planning.batteryPolicy = 'installed-current-v1';
    document.planning.safetyPolicy = 'continuous-occupancy-v1';
    document.batteries = document.scenario.vehicles.map((vehicle) => ({
      ...document.batteries.find(
        (battery) => battery.vehicleId === vehicle.id,
      )!,
      rechargeSec: null,
      source:
        'Синтетическая текущая батарея; нет будущей замены или восстановления заряда.',
    }));
    cases.push({
      id: `stress-${size}km2`,
      group: 'stress-current-battery',
      seed: null,
      expectation: 'observational-failures-retained',
      document,
    });
  }
  cases.push(...missionSearchHoldoutCases());
  return cases.map((entry) => ({
    ...entry,
    document: parseMissionDocument({
      ...entry.document,
      planning: { ...entry.document.planning, maxComputeMs: 2000 },
    }),
  }));
}

type Pair = Awaited<ReturnType<typeof compareBenchmarkCandidates>>;
type Artifact = {
  file: string;
  hash: string;
  evidenceFile: string | null;
  evidenceHash: string | null;
};
type Run = {
  caseId: string;
  repeat: number;
  order: 'planned-first' | 'serial-first';
  plannedTiming: { wallMs: number; cpuMs: number };
  serialTiming: { wallMs: number; cpuMs: number };
  parallelTiming: { wallMs: number; cpuMs: number };
  pairs: {
    objective: 'makespan' | 'flightTime';
    planned: Artifact;
    serial: Artifact;
    parallel: Artifact;
    comparison: Pair;
    parallelComparison: Pair;
  }[];
};
type Report = {
  schemaVersion: '2.0';
  protocol: typeof BENCHMARK_PROTOCOL;
  methodology: { repeats: number };
  cases: {
    id: string;
    group: string;
    seed: number | null;
    expectation: string;
    file: string;
    inputHash: string;
  }[];
  runs: Run[];
  sourceHashes: Record<string, string>;
  sourceStable: boolean;
  aggregate: ReturnType<typeof aggregate>;
};
function aggregate(runs: Run[]) {
  return {
    runs: runs.length,
    plannedWallMs: benchmarkDistribution(
      runs.map((run) => run.plannedTiming.wallMs),
    ),
    plannedCpuMs: benchmarkDistribution(
      runs.map((run) => run.plannedTiming.cpuMs),
    ),
    serialWallMs: benchmarkDistribution(
      runs.map((run) => run.serialTiming.wallMs),
    ),
    serialCpuMs: benchmarkDistribution(
      runs.map((run) => run.serialTiming.cpuMs),
    ),
    parallelWallMs: benchmarkDistribution(
      runs.map((run) => run.parallelTiming.wallMs),
    ),
    parallelCpuMs: benchmarkDistribution(
      runs.map((run) => run.parallelTiming.cpuMs),
    ),
    objectives: Object.fromEntries(
      objectives.map((objective) => {
        const pairs = runs
          .flatMap((run) => run.pairs)
          .filter((pair) => pair.objective === objective);
        return [
          objective,
          {
            total: pairs.length,
            plannedComplete: pairs.filter(
              (pair) => pair.comparison.planned.acceptedComplete,
            ).length,
            serialComplete: pairs.filter(
              (pair) => pair.comparison.serial.acceptedComplete,
            ).length,
            comparable: pairs.filter((pair) => pair.comparison.comparable)
              .length,
            excluded: pairs.filter((pair) => !pair.comparison.comparable)
              .length,
            // Repeats are timing repetitions, not independent mission samples.
            improvementPercent: benchmarkDistribution(
              pairs.flatMap((pair) =>
                pair.comparison.improvement?.percent == null
                  ? []
                  : [pair.comparison.improvement.percent],
              ),
            ),
            wins: pairs.filter(
              (pair) => (pair.comparison.improvement?.absoluteSec ?? 0) > 1e-6,
            ).length,
            ties: pairs.filter(
              (pair) =>
                pair.comparison.comparable &&
                Math.abs(pair.comparison.improvement!.absoluteSec) <= 1e-6,
            ).length,
            losses: pairs.filter(
              (pair) => (pair.comparison.improvement?.absoluteSec ?? 0) < -1e-6,
            ).length,
            parallelBaseline: {
              complete: pairs.filter(
                (p) => p.parallelComparison.serial.acceptedComplete,
              ).length,
              comparable: pairs.filter((p) => p.parallelComparison.comparable)
                .length,
              improvementPercent: benchmarkDistribution(
                pairs.flatMap((p) =>
                  p.parallelComparison.improvement?.percent == null
                    ? []
                    : [p.parallelComparison.improvement.percent],
                ),
              ),
              wins: pairs.filter(
                (p) =>
                  (p.parallelComparison.improvement?.absoluteSec ?? 0) > 1e-6,
              ).length,
              ties: pairs.filter(
                (p) =>
                  p.parallelComparison.comparable &&
                  Math.abs(p.parallelComparison.improvement!.absoluteSec) <=
                    1e-6,
              ).length,
              losses: pairs.filter(
                (p) =>
                  (p.parallelComparison.improvement?.absoluteSec ?? 0) < -1e-6,
              ).length,
            },
            plannedStatusCounts: Object.fromEntries(
              [
                'feasible_model',
                'partial',
                'not_found',
                'invalid',
                'unsupported',
              ].map((status) => [
                status,
                pairs.filter(
                  (pair) => pair.comparison.planned.status === status,
                ).length,
              ]),
            ),
          },
        ];
      }),
    ),
  };
}
async function json(file: string, value: unknown) {
  await writeFile(file, JSON.stringify(value, null, 2));
}
async function readJson(file: string): Promise<unknown> {
  if ((await stat(file)).size > 50 * 1024 * 1024)
    throw new Error(`File exceeds 50 MiB: ${basename(file)}`);
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function runMissionBenchmark(
  outputDir = 'output/mission-benchmark',
  repeats = 3,
) {
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10)
    throw new Error('Repeats must be 1–10.');
  const output = resolve(root, outputDir),
    allowed = resolve(root, 'output/mission-benchmark'),
    inside = relative(allowed, output);
  if (inside.startsWith('..') || isAbsolute(inside))
    throw new Error('Output must stay under output/mission-benchmark.');
  await mkdir(output, { recursive: true });
  const sourcesBefore = await sourceHashes(),
    cases = benchmarkCases(),
    runs: Run[] = [],
    inputs: Report['cases'] = [];
  // One explicit warm-up; it is not included in mission success or timing totals.
  await solveMissionDocument(
    cases.find((entry) => entry.id === 'repeat-sorties')!.document,
  );
  for (const entry of cases) {
    const inputHash = await sha256(entry.document),
      inputFile = `${entry.id}.mission.json`;
    await json(resolve(output, inputFile), entry.document);
    inputs.push({
      id: entry.id,
      group: entry.group,
      seed: entry.seed,
      expectation: entry.expectation,
      file: inputFile,
      inputHash,
    });
    for (let repeat = 0; repeat < repeats; repeat++) {
      const serialAction = async () => {
        const values: MissionCandidate[] = [];
        for (const objective of objectives)
          values.push(
            await solveMissionSerialBaseline(
              structuredClone(entry.document),
              objective,
            ),
          );
        return values;
      };
      const parallelAction = async () => {
        const values: MissionCandidate[] = [];
        for (const objective of objectives)
          values.push(
            await solveMissionParallelBaseline(
              structuredClone(entry.document),
              objective,
            ),
          );
        return values;
      };
      let planned: Awaited<ReturnType<typeof timing<MissionResult>>>;
      let serial: Awaited<ReturnType<typeof timing<MissionCandidate[]>>>;
      let parallel: Awaited<ReturnType<typeof timing<MissionCandidate[]>>>;
      const order =
        (repeat + inputs.length) % 2 ? 'planned-first' : 'serial-first';
      if (order === 'planned-first') {
        planned = await timing(() =>
          solveMissionDocument(structuredClone(entry.document)),
        );
        serial = await timing(serialAction);
        parallel = await timing(parallelAction);
      } else {
        parallel = await timing(parallelAction);
        serial = await timing(serialAction);
        planned = await timing(() =>
          solveMissionDocument(structuredClone(entry.document)),
        );
      }
      const run: Run = {
        caseId: entry.id,
        repeat,
        order,
        plannedTiming: { wallMs: planned.wallMs, cpuMs: planned.cpuMs },
        serialTiming: { wallMs: serial.wallMs, cpuMs: serial.cpuMs },
        parallelTiming: { wallMs: parallel.wallMs, cpuMs: parallel.cpuMs },
        pairs: [],
      };
      async function artifact(
        candidate: MissionCandidate,
        role: string,
        accepted: boolean,
      ): Promise<Artifact> {
        const file = `${entry.id}-r${repeat}-${candidate.objective}-${role}.candidate.json`;
        await json(resolve(output, file), candidate);
        if (!accepted)
          return {
            file,
            hash: await sha256(candidate),
            evidenceFile: null,
            evidenceHash: null,
          };
        const evidence = await missionEvidence(planned.value, candidate),
          checks = await verifyMissionEvidence(evidence);
        if (checks.some((check) => check.status === 'fail'))
          throw new Error(`Evidence failed: ${file}`);
        const evidenceFile = file.replace('.candidate.json', '.evidence.json');
        await json(resolve(output, evidenceFile), evidence);
        return {
          file,
          hash: await sha256(candidate),
          evidenceFile,
          evidenceHash: await sha256(evidence),
        };
      }
      for (const objective of objectives) {
        const candidate = planned.value.candidates.find(
            (item) => item.objective === objective,
          )!,
          baseline = serial.value.find((item) => item.objective === objective)!,
          comparison = await compareBenchmarkCandidates(
            entry.document,
            candidate,
            baseline,
          ),
          parallelCandidate = parallel.value.find(
            (item) => item.objective === objective,
          )!,
          parallelComparison = await compareBenchmarkCandidates(
            entry.document,
            candidate,
            parallelCandidate,
            'parallel',
          );
        run.pairs.push({
          objective,
          comparison,
          parallelComparison,
          planned: await artifact(
            candidate,
            'planned',
            comparison.planned.acceptedComplete,
          ),
          serial: await artifact(
            baseline,
            'serial',
            comparison.serial.acceptedComplete,
          ),
          parallel: await artifact(
            parallelCandidate,
            'parallel',
            parallelComparison.serial.acceptedComplete,
          ),
        });
      }
      runs.push(run);
      console.log(
        JSON.stringify({
          case: entry.id,
          repeat: repeat + 1,
          planned: run.pairs.map((pair) => pair.comparison.planned.status),
          comparable: run.pairs.map((pair) => pair.comparison.comparable),
        }),
      );
    }
  }
  const sourcesAfter = await sourceHashes(),
    report = {
      schemaVersion: '2.0' as const,
      protocol: BENCHMARK_PROTOCOL,
      createdAt: new Date().toISOString(),
      sourceHashes: sourcesBefore,
      sourceStable:
        canonicalStringify(sourcesBefore) === canonicalStringify(sourcesAfter),
      environment: {
        node: process.version,
        platform: platform(),
        release: release(),
        arch: arch(),
        cpuModel: cpus()[0]?.model ?? 'unknown',
        logicalCpuCount: cpus().length,
        totalMemoryBytes: totalmem(),
        note: 'Single local Node process; process.cpuUsage includes user+system. Wall times include local contention; no GPU/network.',
      },
      methodology: {
        warmup: 'One repeat-sorties optimizer run, excluded from aggregates.',
        repeats,
        order:
          'Alternating planned→serial→parallel / parallel→serial→planned; each run reparses an independent identical input clone.',
        budgets:
          '2000 ms search budget total for both optimized objectives; 1000 ms per serial/parallel baseline objective. Solve timings include built-in validation; additional post-validation and evidence export are outside those timers.',
        serial:
          'Same route generator, quality, energy and safety validator; first feasible placement, one airborne sortie at a time. Not a competitor product or exact optimum.',
        parallel:
          'Same validated route generator; greedy maximum-prefix packs, declared job/strip order, no repair or restarts; simultaneous compatible sorties allowed. Not a competitor product or exact optimum.',
        success:
          'feasible_model AND fresh complete validator passes; partial/not_found/unsupported/invalid retained and never scored as savings.',
        statistics:
          'Nearest-rank percentiles. Repeats are repeated runs of the same case, not independent statistical samples. No confidence interval or market-wide claim.',
        limitations:
          'Synthetic declared flat terrain and uncalibrated energy. Unknown checks retained. Exact exhaustive optimizer/global optimality not claimed; validators share geometry.',
        deterministic:
          'Inputs and source hashes reproducible; bounded wall-clock search/timestamps/timings and full result hashes may differ between runs or CPUs.',
      },
      cases: inputs,
      runs,
      aggregate: aggregate(runs),
    };
  await json(resolve(output, 'report.json'), report);
  if (!report.sourceStable)
    throw new Error(
      'Sources changed during run; report preserved but not a stable release benchmark.',
    );
  return report;
}

export async function verifyBenchmarkReport(reportPath: string) {
  const location = resolve(reportPath),
    folder = dirname(location),
    report = (await readJson(location)) as Report,
    failures: string[] = [],
    unknowns = new Set<string>(),
    check = (name: string, ok: boolean) => {
      if (!ok) failures.push(name);
    };
  if (
    report.schemaVersion !== '2.0' ||
    report.protocol !== BENCHMARK_PROTOCOL ||
    !Array.isArray(report.cases) ||
    !Array.isArray(report.runs)
  )
    throw new Error('Invalid benchmark report.');
  const local = (file: string) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(file))
      throw new Error('Unsafe artifact filename.');
    return resolve(folder, file);
  };
  check('SOURCES_STABLE_DURING_RUN', report.sourceStable === true);
  check(
    'CURRENT_SOURCE_HASHES',
    canonicalStringify(await sourceHashes()) ===
      canonicalStringify(report.sourceHashes),
  );
  const docs = new Map<string, MissionDocument>();
  const declaredCases = benchmarkCases();
  check(
    'DECLARED_CASE_SET',
    canonicalStringify(report.cases.map((entry) => entry.id).sort()) ===
      canonicalStringify(declaredCases.map((entry) => entry.id).sort()),
  );
  const repeats = report.methodology?.repeats;
  check(
    'REPEAT_COUNT',
    Number.isInteger(repeats) && repeats >= 1 && repeats <= 10,
  );
  for (const entry of report.cases) {
    check(`UNIQUE_CASE:${entry.id}`, !docs.has(entry.id));
    const document = parseMissionDocument(await readJson(local(entry.file)));
    check(
      `INPUT_HASH:${entry.id}`,
      (await sha256(document)) === entry.inputHash,
    );
    const declared = declaredCases.find((item) => item.id === entry.id);
    check(
      `DECLARED_INPUT:${entry.id}`,
      Boolean(declared) &&
        (await sha256(declared!.document)) === entry.inputHash,
    );
    docs.set(entry.id, document);
  }
  check(
    'COMPLETE_UNIQUE_RUN_MATRIX',
    completeBenchmarkRunMatrix(
      declaredCases.map((entry) => entry.id),
      report.runs,
      repeats,
    ),
  );
  for (const run of report.runs) {
    const document = docs.get(run.caseId);
    if (!document) throw new Error('Run references absent input.');
    check(
      `TIMING_SHAPE:${run.caseId}:${run.repeat}`,
      [
        run.plannedTiming.wallMs,
        run.plannedTiming.cpuMs,
        run.serialTiming.wallMs,
        run.serialTiming.cpuMs,
        run.parallelTiming.wallMs,
        run.parallelTiming.cpuMs,
      ].every((value) => Number.isFinite(value) && value >= 0),
    );
    check(
      `TWO_OBJECTIVES:${run.caseId}:${run.repeat}`,
      canonicalStringify(run.pairs.map((pair) => pair.objective).sort()) ===
        canonicalStringify([...objectives].sort()),
    );
    for (const pair of run.pairs) {
      const planned = (await readJson(
          local(pair.planned.file),
        )) as MissionCandidate,
        serial = (await readJson(local(pair.serial.file))) as MissionCandidate,
        parallel = (await readJson(
          local(pair.parallel.file),
        )) as MissionCandidate,
        comparison = await compareBenchmarkCandidates(
          document,
          planned,
          serial,
        ),
        parallelComparison = await compareBenchmarkCandidates(
          document,
          planned,
          parallel,
          'parallel',
        ),
        prefix = `${run.caseId}:r${run.repeat}:${pair.objective}`;
      check(
        `PAIR:${prefix}`,
        canonicalStringify(comparison) === canonicalStringify(pair.comparison),
      );
      check(
        `OBJECTIVE:${prefix}`,
        planned.objective === pair.objective &&
          serial.objective === pair.objective &&
          parallel.objective === pair.objective,
      );
      check(
        `PARALLEL_PAIR:${prefix}`,
        canonicalStringify(parallelComparison) ===
          canonicalStringify(pair.parallelComparison),
      );
      for (const [record, candidate, verified] of [
        [pair.planned, planned, comparison.planned],
        [pair.serial, serial, comparison.serial],
        [pair.parallel, parallel, parallelComparison.serial],
      ] as const) {
        check(
          `CANDIDATE_HASH:${record.file}`,
          (await sha256(candidate)) === record.hash,
        );
        verified.unknowns.forEach((id) => unknowns.add(id));
        check(
          `EVIDENCE_PRESENCE:${record.file}`,
          verified.acceptedComplete === Boolean(record.evidenceFile),
        );
        if (record.evidenceFile) {
          const evidence = await readJson(local(record.evidenceFile));
          check(
            `EVIDENCE_HASH:${record.file}`,
            (await sha256(evidence)) === record.evidenceHash,
          );
          const checks = await verifyMissionEvidence(evidence);
          check(
            `EVIDENCE_RECHECK:${record.file}`,
            checks.every((row) => row.status !== 'fail'),
          );
          const envelope = evidence as { inputHash: string; planHash: string };
          check(
            `EVIDENCE_BINDING:${record.file}`,
            envelope.planHash === record.hash &&
              envelope.inputHash === (await sha256(document)),
          );
        }
      }
    }
  }
  check(
    'AGGREGATES_RECOMPUTED',
    canonicalStringify(aggregate(report.runs)) ===
      canonicalStringify(report.aggregate),
  );
  const verification = {
    createdAt: new Date().toISOString(),
    status: failures.length ? 'rejected' : 'passes-declared-model',
    reportHash: await sha256(report),
    cases: report.cases.length,
    runs: report.runs.length,
    failures,
    unknowns: [...unknowns].sort(),
    flightReady: false,
    limitation:
      'Recomputed constraints, comparisons, evidence and aggregate arithmetic. CPU timings are recorded observations, not independently reconstructible measurements. Hashes are not author signatures.',
  };
  await json(resolve(folder, 'verification.json'), verification);
  return verification;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv[2] === '--verify') {
      const result = await verifyBenchmarkReport(
        process.argv[3] ?? 'output/mission-benchmark/report.json',
      );
      console.log(JSON.stringify(result));
      if (result.status === 'rejected') process.exitCode = 1;
    } else {
      const output = process.argv[2] ?? 'output/mission-benchmark',
        report = await runMissionBenchmark(
          output,
          Number(process.argv[3] ?? 3),
        );
      console.log(JSON.stringify({ output, ...report.aggregate }));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
