import { mkdir, open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { certifyMissionContingencies } from '../lib/planner/mission-contingency.ts';
import {
  canonicalStringify,
  missionDocumentSchema,
  sha256,
} from '../lib/planner/mission-schema.ts';
import type { MissionCandidate } from '../lib/planner/mission-schema.ts';
import { parseStructuredText } from '../lib/planner/mission-io.ts';

export const MAX_CONTINGENCY_BUNDLE_BYTES = 16 * 1024 * 1024;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const limitsSchema = z
  .object({
    maxIntervalSec: z.number().min(1).max(60),
    maxAnchors: z.number().int().min(1).max(2048),
    maxComputeMs: z.number().min(1).max(30000),
  })
  .strict();
const bundleSchema = z
  .object({
    type: z.literal('prime-mission-contingency'),
    schemaVersion: z.literal('1.0'),
    document: missionDocumentSchema,
    candidate: z.unknown(),
    certificate: z
      .object({
        protocol: z.literal('controlled-abort-interval-v1'),
        limits: limitsSchema,
        inputHash: hash,
        candidateHash: hash,
        status: z.enum(['certified_model', 'not_certified']),
        computationMs: z.number().min(0).max(1e9),
        budgetExceeded: z.boolean(),
        anchorCount: z.number().int().min(0).max(1000000),
        checkedAnchors: z.number().int().min(0).max(2048),
        certifiedAnchors: z.number().int().min(0).max(2048),
        independentAnchors: z.number().int().min(0).max(2048),
        plannedCorridorAnchors: z.number().int().min(0).max(2048),
        maxResponseDelaySec: z.number().min(0).max(604800),
        minimumRemainingPct: z.number().min(0).max(100).nullable(),
        anchors: z.array(z.unknown()).max(2048),
        reasons: z.array(z.string().max(30000)).max(100),
        assumptions: z.array(z.string().max(30000)).max(100),
      })
      .strict(),
  })
  .strict();

/** Replay against original inputs; no persisted green flags or summaries trusted. */
export async function verifyMissionContingencyBundle(value: unknown) {
  // Bound programmatic callers as well as the CLI before accepting nested traces.
  parseStructuredText(
    JSON.stringify(value),
    'json',
    MAX_CONTINGENCY_BUNDLE_BYTES,
  );
  const bundle = bundleSchema.parse(value),
    claimed = bundle.certificate;
  const checks: { id: string; pass: boolean; detail: string }[] = [];
  const check = (id: string, pass: boolean, detail: string) =>
    checks.push({ id, pass, detail });
  check(
    'INPUT_HASH',
    (await sha256(bundle.document)) === claimed.inputHash,
    'SHA-256 полного исходного задания.',
  );
  check(
    'CANDIDATE_HASH',
    (await sha256(bundle.candidate)) === claimed.candidateHash,
    'SHA-256 полного исходного плана.',
  );
  check(
    'COUNT_ARITHMETIC',
    claimed.checkedAnchors === claimed.anchors.length &&
      claimed.certifiedAnchors ===
        claimed.independentAnchors + claimed.plannedCorridorAnchors &&
      claimed.certifiedAnchors <= claimed.checkedAnchors &&
      claimed.checkedAnchors <= claimed.anchorCount,
    'Нельзя скрыть пропущенные интервалы или смешать отдельный уход с исходным коридором.',
  );
  const replay = await certifyMissionContingencies(
    bundle.document,
    bundle.candidate as MissionCandidate,
    { ...claimed.limits, maxComputeMs: 30000 },
  );
  check(
    'FRESH_INPUT',
    replay.inputHash === claimed.inputHash &&
      replay.candidateHash === claimed.candidateHash,
    'Результат повторной проверки связан с теми же исходниками.',
  );
  if (claimed.status === 'certified_model') {
    check(
      'FULL_CERTIFICATE',
      !claimed.budgetExceeded &&
        claimed.reasons.length === 0 &&
        claimed.anchorCount > 0 &&
        claimed.certifiedAnchors === claimed.anchorCount,
      'Полнота заявленного сертификата.',
    );
    check(
      'REPLAY_COMPLETE',
      replay.status === 'certified_model',
      'Независимый повторный проход маршрутов, ресурса, прочих БВС и площадок.',
    );
    const semantic = (certificate: typeof claimed) => {
      const { computationMs: _time, limits, ...rest } = certificate;
      return {
        ...rest,
        limits: {
          maxIntervalSec: limits.maxIntervalSec,
          maxAnchors: limits.maxAnchors,
        },
      };
    };
    check(
      'EXACT_SEMANTIC_REPLAY',
      canonicalStringify(semantic(claimed)) ===
        canonicalStringify(semantic(replay)),
      'Сверены все интервалы, точки, сегменты, метрики, типы ухода и ограничения; время CPU не сравнивается.',
    );
  } else {
    check(
      'PARTIAL_ANCHORS',
      claimed.anchors.every((a) =>
        replay.anchors.some(
          (b) => canonicalStringify(a) === canonicalStringify(b),
        ),
      ),
      'Опубликованные частичные интервалы должны совпадать с повторным расчётом. Неполный отчёт не становится сертификатом.',
    );
  }
  return {
    type: 'prime-mission-contingency-verification',
    schemaVersion: '1.0',
    status: checks.some((c) => !c.pass)
      ? 'rejected'
      : claimed.status === 'certified_model'
        ? 'passes-declared-model'
        : 'incomplete',
    bundleHash: await sha256(bundle),
    inputHash: claimed.inputHash,
    candidateHash: claimed.candidateHash,
    checks,
    replayStatus: replay.status,
    anchorCount: replay.anchorCount,
    independentAnchors: replay.independentAnchors,
    plannedCorridorAnchors: replay.plannedCorridorAnchors,
    flightReady: false,
    limitations: replay.assumptions,
  };
}

export async function verifyMissionContingencyFile(
  inputPath: string,
  outputPath: string,
) {
  const input = resolve(inputPath),
    output = resolve(outputPath);
  if (input.toLowerCase() === output.toLowerCase())
    throw new Error('Вход и выход должны различаться.');
  const handle = await open(input, 'r');
  let text: string;
  try {
    const bytes = new Uint8Array(MAX_CONTINGENCY_BUNDLE_BYTES + 1);
    let count = 0;
    while (count < bytes.length) {
      const result = await handle.read(
        bytes,
        count,
        bytes.length - count,
        count,
      );
      if (!result.bytesRead) break;
      count += result.bytesRead;
    }
    if (count > MAX_CONTINGENCY_BUNDLE_BYTES)
      throw new Error('Комплект больше 16 МиБ.');
    text = new TextDecoder('utf-8', { fatal: true }).decode(
      bytes.subarray(0, count),
    );
  } finally {
    await handle.close();
  }
  const report = await verifyMissionContingencyBundle(
    parseStructuredText(text, 'json', MAX_CONTINGENCY_BUNDLE_BYTES),
  );
  await mkdir(dirname(output), { recursive: true });
  const destination = await open(output, 'wx'); // No overwrite or following an existing symlink.
  try {
    await destination.writeFile(JSON.stringify(report, null, 2), 'utf8');
  } finally {
    await destination.close();
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
    const report = await verifyMissionContingencyFile(input, output);
    console.log(JSON.stringify(report));
    if (report.status !== 'passes-declared-model')
      process.exitCode = report.status === 'incomplete' ? 2 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
