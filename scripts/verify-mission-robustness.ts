import { mkdir, open, realpath, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  analyzeMissionRobustness,
  DEFAULT_ROBUSTNESS_PERTURBATIONS,
} from '../lib/planner/mission-robustness.ts';
import type { MissionRobustnessReport } from '../lib/planner/mission-robustness.ts';
import {
  assertSafeTree,
  checkTextSize,
  parseStructuredText,
} from '../lib/planner/mission-io.ts';
import { canonicalStringify, sha256 } from '../lib/planner/mission-schema.ts';

export const MAX_ROBUSTNESS_BUNDLE_BYTES = 4 * 1024 * 1024;
const number = (min: number, max: number) => z.number().min(min).max(max);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/);
const checkSchema = z
  .object({
    id: z.string().min(1).max(150),
    status: z.enum(['pass', 'fail', 'unknown']),
    title: z.string().max(500),
    detail: z.string().max(15000),
  })
  .strict();
const checks = z.array(checkSchema).max(300);
// No defaults at this proof boundary: missing zeroes or a missing policy are
// missing evidence, not an invitation to silently migrate a historical report.
const perturbationSchema = z
  .object({
    id,
    label: z.string().min(1).max(120),
    windSpeedDeltaMps: number(0, 10),
    windDirectionDeltaDeg: number(-180, 180),
    startDelaySec: number(0, 7200),
    batteryReductionPct: number(0, 50),
  })
  .strict();
const caseSchema = z
  .object({
    id,
    label: z.string().min(1).max(120),
    perturbation: perturbationSchema,
    status: z.enum(['safe', 'unsafe_in_model', 'not_checked']),
    detail: z.string().max(15000),
    failedChecks: checks,
    unknownChecks: checks,
    metrics: z
      .object({
        makespanSec: number(0, 1e12),
        flightTimeSec: number(0, 1e12),
        minRemainingPct: number(0, 100),
        reserveMarginPct: number(-100, 100),
        deadlineMarginSec: number(-1e12, 1e12),
      })
      .strict()
      .nullable(),
  })
  .strict();
const reportSchema = z
  .object({
    type: z.literal('prime-mission-robustness'),
    schemaVersion: z.literal('1.0'),
    policy: z.literal('fixed-route-retiming-v1'),
    inputHash: hash,
    planHash: hash,
    candidateId: id,
    createdAt: z.iso.datetime({ offset: true }),
    baseline: z
      .object({
        status: z.enum(['verified', 'rejected', 'not_checked']),
        failedChecks: checks,
        unknownChecks: checks,
      })
      .strict(),
    cases: z.array(caseSchema).max(6),
    assumptions: z.array(z.string().max(15000)).max(30),
    elapsedMs: number(0, 1e12),
    budgetExhausted: z.boolean(),
    flightReady: z.literal(false),
  })
  .strict();
const bundleSchema = z
  .object({
    type: z.literal('prime-mission-robustness-bundle'),
    schemaVersion: z.literal('1.0'),
    document: z.record(z.string(), z.unknown()),
    candidate: z.record(z.string(), z.unknown()),
    report: reportSchema,
  })
  .strict();

export type MissionRobustnessVerification = {
  type: 'prime-mission-robustness-verification';
  schemaVersion: '1.0';
  protocol: 'default-four-case-replay-v1';
  status: 'passes-declared-model' | 'incomplete' | 'rejected';
  checkedAt: string;
  inputHash: string | null;
  planHash: string | null;
  sourceReportHash: string | null;
  binding: boolean;
  failures: { id: string; detail: string }[];
  unknowns: string[];
  declaredCases: number;
  comparedCases: number;
  allDeclaredCasesRechecked: boolean;
  allCasesSafeInModel: boolean;
  replayedCases: { id: string; status: string }[];
  flightReady: false;
  limitations: string[];
};

function emptyVerification(): MissionRobustnessVerification {
  return {
    type: 'prime-mission-robustness-verification',
    schemaVersion: '1.0',
    protocol: 'default-four-case-replay-v1',
    status: 'rejected',
    checkedAt: new Date().toISOString(),
    inputHash: null,
    planHash: null,
    sourceReportHash: null,
    binding: false,
    failures: [],
    unknowns: [],
    declaredCases: 0,
    comparedCases: 0,
    allDeclaredCasesRechecked: false,
    allCasesSafeInModel: false,
    replayedCases: [],
    flightReady: false,
    limitations: [
      'Повтор выполняется тем же расчётным модулем и валидатором, но не доверяет сохранённым зелёным флагам и метрикам. Это не независимая физическая модель или полётные испытания.',
      'Этот формат доказывает наличие стандартных четырёх стресс-сценариев UI. Произвольный набор API требует другого явно объявленного контракта.',
      'Допуск сравнения чисел — 0,000001 в исходных единицах. Метки создания, время вычисления и факт исчерпания временного бюджета не воспроизводятся как измерения.',
      'SHA-256 связывает содержимое, но не удостоверяет автора. Вероятности успеха, сертификация и разрешение на реальный полёт не подтверждаются.',
      'Подтверждённый отрицательный стресс-сценарий остаётся отрицательным: passes-declared-model означает совпадение проверяемого отчёта, а не безопасность каждого случая.',
    ],
  };
}

function sameMetrics(
  first: MissionRobustnessReport['cases'][number]['metrics'],
  second: MissionRobustnessReport['cases'][number]['metrics'],
): boolean {
  if (first === null || second === null) return first === second;
  return Object.keys(first).every((name) => {
    const key = name as keyof typeof first;
    return Math.abs(first[key] - second[key]) <= 1e-6;
  });
}

/** Pure import-safe verification. It does not execute commands or write files. */
export async function verifyMissionRobustnessBundle(
  value: unknown,
): Promise<MissionRobustnessVerification> {
  const verification = emptyVerification();
  const fail = (id: string, detail: string) =>
    verification.failures.push({ id, detail });
  const unknown = new Set<string>();
  let incomplete = false;
  try {
    assertSafeTree(value);
    checkTextSize(JSON.stringify(value), MAX_ROBUSTNESS_BUNDLE_BYTES);
    const bundle = bundleSchema.parse(value);
    const saved: MissionRobustnessReport = bundle.report;
    verification.declaredCases = saved.cases.length;
    verification.inputHash = await sha256(bundle.document);
    verification.planHash = await sha256(bundle.candidate);
    verification.sourceReportHash = await sha256(saved);
    verification.binding =
      saved.inputHash === verification.inputHash &&
      saved.planHash === verification.planHash &&
      saved.candidateId === bundle.candidate.id;
    const planning = bundle.document.planning;
    if (
      !planning ||
      typeof planning !== 'object' ||
      !('safetyPolicy' in planning) ||
      planning.safetyPolicy !== 'continuous-occupancy-v1' ||
      !('batteryPolicy' in planning) ||
      planning.batteryPolicy !== 'installed-current-v1'
    )
      fail(
        'INPUT_POLICIES',
        'В пакете должны явно присутствовать действующие политики безопасности и текущей батареи; значения не подставляются по умолчанию.',
      );
    if (!verification.binding)
      fail(
        'BINDING',
        'Хеши отчёта или идентификатор кандидата не соответствуют приложенным данным.',
      );
    const suiteValid =
      saved.cases.length === DEFAULT_ROBUSTNESS_PERTURBATIONS.length &&
      saved.cases.every((item, i) => {
        const expected = DEFAULT_ROBUSTNESS_PERTURBATIONS[i];
        return (
          item.id === expected.id &&
          item.label === expected.label &&
          canonicalStringify(item.perturbation) === canonicalStringify(expected)
        );
      });
    if (!suiteValid)
      fail(
        'CASE_MANIFEST',
        'Нужны все четыре стандартных случая с неизменными ID, порядком и параметрами. Удаление, подмена или пользовательский набор не допускаются этим форматом.',
      );
    for (const item of saved.cases) {
      item.unknownChecks.forEach((c) => unknown.add(`${item.id}:${c.id}`));
      if (
        item.failedChecks.some((c) => c.status !== 'fail') ||
        item.unknownChecks.some((c) => c.status !== 'unknown')
      )
        fail(
          `CHECK_STATUS:${item.id}`,
          'Статусы проверок не соответствуют разделу отчёта.',
        );
      if (
        item.status === 'not_checked' &&
        (item.metrics !== null ||
          item.failedChecks.length ||
          item.unknownChecks.length)
      )
        fail(
          `UNCHECKED_CLAIMS:${item.id}`,
          'Непроверенный случай не может содержать проверенные метрики или утверждения.',
        );
    }
    saved.baseline.unknownChecks.forEach((c) =>
      unknown.add(`baseline:${c.id}`),
    );
    if (
      saved.baseline.failedChecks.some((c) => c.status !== 'fail') ||
      saved.baseline.unknownChecks.some((c) => c.status !== 'unknown')
    )
      fail(
        'BASELINE_CHECK_STATUS',
        'Статусы базовых проверок не соответствуют разделам.',
      );
    if (
      saved.baseline.status === 'not_checked' &&
      (saved.baseline.failedChecks.length ||
        saved.baseline.unknownChecks.length)
    )
      fail(
        'BASELINE_UNCHECKED_CLAIMS',
        'Непроверенный исходный план не должен содержать якобы полученные проверки.',
      );
    if (verification.failures.length) {
      verification.unknowns = [...unknown].sort();
      return verification;
    }
    const replay = await analyzeMissionRobustness({
      document: bundle.document,
      candidate: bundle.candidate,
      perturbations: saved.cases.map((item) => item.perturbation),
      maxComputeMs: 5000,
    });
    verification.replayedCases = replay.cases.map((item) => ({
      id: item.id,
      status: item.status,
    }));
    if (
      replay.inputHash !== verification.inputHash ||
      replay.planHash !== verification.planHash
    )
      fail(
        'REPLAY_BINDING',
        'Повторный расчёт нормализовал вход иначе; исходные хеши нельзя считать подтверждёнными.',
      );
    // The declared analysis limit may differ, but no other limitation text may
    // silently disappear (e.g. replacement of unknowns by flight guarantees).
    const assumptionsWithoutBudget = (values: string[]) =>
      values.map((text) =>
        text.replace(
          /Мягкий бюджет ([1-9][0-9]{2,3}) мс/,
          (match, value: string) =>
            Number(value) >= 100 && Number(value) <= 5000
              ? 'Мягкий бюджет <value> мс'
              : match,
        ),
      );
    if (
      canonicalStringify(assumptionsWithoutBudget(saved.assumptions)) !==
      canonicalStringify(assumptionsWithoutBudget(replay.assumptions))
    )
      fail(
        'ASSUMPTIONS',
        'Список допущений и границ не совпадает с повторно сформированным отчётом.',
      );
    replay.baseline.unknownChecks.forEach((c) =>
      unknown.add(`baseline:${c.id}`),
    );
    if (replay.baseline.status === 'rejected')
      fail(
        'BASELINE_INVALID',
        'Приложенный исходный план не прошёл повторную проверку.',
      );
    if (
      saved.baseline.status === 'not_checked' ||
      replay.baseline.status === 'not_checked'
    ) {
      incomplete = true;
      unknown.add('BASELINE_NOT_CHECKED');
    } else if (
      canonicalStringify(saved.baseline) !== canonicalStringify(replay.baseline)
    ) {
      fail(
        'BASELINE_COMPARISON',
        'Исходный статус, нарушения или неизвестные факторы не совпали.',
      );
    }
    for (const [index, original] of saved.cases.entries()) {
      const actual = replay.cases[index];
      actual.unknownChecks.forEach((c) => unknown.add(`${actual.id}:${c.id}`));
      if (
        original.status === 'not_checked' ||
        actual.status === 'not_checked'
      ) {
        incomplete = true;
        unknown.add(`CASE_NOT_CHECKED:${original.id}`);
        continue;
      }
      verification.comparedCases++;
      if (original.status !== actual.status)
        fail(
          `STATUS:${original.id}`,
          `Сохранено ${original.status}, получено ${actual.status}.`,
        );
      if (
        canonicalStringify(original.failedChecks) !==
        canonicalStringify(actual.failedChecks)
      )
        fail(
          `FAILURES:${original.id}`,
          'Нарушения не совпали с повторной проверкой.',
        );
      if (
        canonicalStringify(original.unknownChecks) !==
        canonicalStringify(actual.unknownChecks)
      )
        fail(
          `UNKNOWNS:${original.id}`,
          'Неизвестные факторы были изменены или скрыты.',
        );
      if (!sameMetrics(original.metrics, actual.metrics))
        fail(
          `METRICS:${original.id}`,
          'Остаток заряда, запас, сроки или налёт не совпали с пересчётом.',
        );
      if (original.detail !== actual.detail)
        fail(`DETAIL:${original.id}`, 'Пояснение статуса было изменено.');
    }
    verification.allDeclaredCasesRechecked =
      !incomplete &&
      verification.comparedCases === DEFAULT_ROBUSTNESS_PERTURBATIONS.length;
    verification.allCasesSafeInModel =
      verification.allDeclaredCasesRechecked &&
      replay.cases.every((c) => c.status === 'safe') &&
      verification.failures.length === 0;
    verification.status = verification.failures.length
      ? 'rejected'
      : incomplete
        ? 'incomplete'
        : 'passes-declared-model';
  } catch (error) {
    fail(
      'FORMAT_OR_REPLAY',
      error instanceof Error
        ? error.message.slice(0, 1500)
        : 'Не удалось разобрать или повторить проверку.',
    );
    verification.status = 'rejected';
  }
  verification.unknowns = [...unknown].sort();
  return verification;
}

/** Explicit file entry point. Refuse existing output, so symlinks/hardlinks and
 * aliases cannot cause this verifier to overwrite its source or any user file. */
export async function verifyMissionRobustnessFile(
  inputPath: string,
  outputPath: string,
) {
  const input = resolve(inputPath),
    output = resolve(outputPath);
  if (input.toLowerCase() === output.toLowerCase())
    throw new Error('Выходной файл не может совпадать с входным.');
  const source = await stat(input);
  if (!source.isFile() || source.size > MAX_ROBUSTNESS_BUNDLE_BYTES)
    throw new Error('Ожидается файл пакета не более 4 МиБ.');
  // Detect a path through an existing directory symlink before any write.
  const canonicalInput = await realpath(input);
  let existingOutput: string | null = null;
  try {
    existingOutput = await realpath(output);
  } catch (error) {
    if (
      !(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      )
    )
      throw error;
  }
  if (existingOutput?.toLowerCase() === canonicalInput.toLowerCase())
    throw new Error('Выходной путь ссылается на входной файл.');
  if (existingOutput)
    throw new Error('Выходной файл уже существует; укажите новое имя.');
  // A stat check alone is not a memory limit if another process grows the file
  // before readFile completes. Read at most the bound plus one byte instead.
  const sourceHandle = await open(input, 'r');
  let text: string;
  try {
    const buffer = new Uint8Array(MAX_ROBUSTNESS_BUNDLE_BYTES + 1);
    let count = 0;
    while (count < buffer.byteLength) {
      const part = await sourceHandle.read(
        buffer,
        count,
        buffer.byteLength - count,
        count,
      );
      if (!part.bytesRead) break;
      count += part.bytesRead;
    }
    if (count > MAX_ROBUSTNESS_BUNDLE_BYTES)
      throw new Error('Пакет вырос выше предела 4 МиБ во время чтения.');
    text = new TextDecoder('utf-8', { fatal: true }).decode(
      buffer.subarray(0, count),
    );
  } finally {
    await sourceHandle.close();
  }
  const value = parseStructuredText(text, 'json', MAX_ROBUSTNESS_BUNDLE_BYTES);
  const report = await verifyMissionRobustnessBundle(value);
  await mkdir(dirname(output), { recursive: true });
  const handle = await open(output, 'wx');
  try {
    await handle.writeFile(JSON.stringify(report, null, 2), 'utf8');
  } finally {
    await handle.close();
  }
  return report;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [input, output, ...extra] = process.argv.slice(2);
    if (!input || !output || extra.length)
      throw new Error(
        'Arguments: bundle.json verification.json (new output file).',
      );
    const report = await verifyMissionRobustnessFile(input, output);
    console.log(JSON.stringify(report));
    if (report.status !== 'passes-declared-model')
      process.exitCode = report.status === 'incomplete' ? 2 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
