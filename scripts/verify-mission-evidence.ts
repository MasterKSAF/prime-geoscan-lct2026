import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  parseMissionDocument,
  sha256,
  sha256Text,
  MISSION_ENGINE_VERSION,
} from '../lib/planner/mission-schema.ts';
import { validateExportedCandidate } from '../lib/planner/mission-validation.ts';
import { missionGeoJSON, missionKML } from '../lib/planner/mission-export.ts';
import type { MissionCandidate } from '../lib/planner/mission-schema.ts';
import type { Check } from '../lib/planner/schema.ts';

// This CLI verifies a local calculation bundle. It does not execute input text,
// fetch URLs, trust saved pass flags or issue any real-flight commands.
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/);
const instantSchema = z.iso.datetime({ offset: true });
const candidateMetadataSchema = z
  .object({
    id: idSchema,
    objective: z.enum(['makespan', 'flightTime']),
    status: z.enum([
      'feasible_model',
      'invalid',
      'not_found',
      'partial',
      'unsupported',
    ]),
    assumptions: z
      .array(z.string().refine((value) => value.trim().length > 0))
      .min(1),
    plan: z.object({
      createdAt: instantSchema,
      status: z.enum(['invalid', 'undetermined']),
    }),
  })
  .refine(
    (candidate) =>
      candidate.plan.status ===
      (candidate.status === 'feasible_model' ? 'undetermined' : 'invalid'),
    {
      path: ['plan', 'status'],
      message: 'Статус представления не соответствует статусу кандидата.',
    },
  );
const envelopeSchema = z.object({
  schemaVersion: z.literal('2.0'),
  evidenceKind: z.literal('model-calculation'),
  flightReady: z.literal(false),
  createdAt: instantSchema,
  inputHash: hashSchema,
  planHash: hashSchema,
  document: z.custom<unknown>((value) => record(value)),
  // Validate metadata without stripping any candidate fields from the hash.
  // The independent validator checks trajectories, metrics and saved claims.
  candidate: z.custom<MissionCandidate>(
    (value) => candidateMetadataSchema.safeParse(value).success,
    'Некорректные обязательные метаданные кандидата или plan.',
  ),
  approval: z
    .object({
      inputHash: hashSchema,
      planHash: hashSchema,
      candidateId: idSchema,
      approvedAt: instantSchema,
    })
    .nullable(),
  artifacts: z.object({
    geojson: z.custom<unknown>((value) => record(value)),
    kml: z.string(),
  }),
  artifactHashes: z.object({
    geojsonCanonicalJson: hashSchema,
    kmlUtf8: hashSchema,
  }),
});

export async function verifyMissionEvidence(value: unknown): Promise<Check[]> {
  const checks: Check[] = [],
    add = (id: string, pass: boolean, detail: string) =>
      checks.push({ id, status: pass ? 'pass' : 'fail', title: id, detail });
  const parsed = envelopeSchema.safeParse(value);
  if (!parsed.success) {
    add('EVIDENCE_SCHEMA', false, parsed.error.message);
    return checks;
  }
  const evidence = parsed.data;
  try {
    const document = parseMissionDocument(evidence.document),
      candidate = evidence.candidate;
    checks.push(...(await validateExportedCandidate(document, candidate)));
    add('ENVELOPE', true, 'Расчётный пакет, а не разрешение реального полёта.');
    add(
      'ENGINE_VERSION',
      candidate.plan.engineVersion === MISSION_ENGINE_VERSION,
      `Текущий валидатор ${MISSION_ENGINE_VERSION}.`,
    );
    add(
      'EVIDENCE_HASHES',
      evidence.inputHash === (await sha256(document)) &&
        evidence.planHash === (await sha256(candidate)),
      'Канонические SHA-256 входа и полного кандидата.',
    );
    add(
      'CLAIMED_SUCCESS',
      candidate.status === 'feasible_model',
      'Для положительного отчёта требуется полный допустимый модельный план.',
    );
    if (evidence.approval)
      add(
        'APPROVAL_BINDING',
        evidence.approval.inputHash === evidence.inputHash &&
          evidence.approval.planHash === evidence.planHash &&
          evidence.approval.candidateId === candidate.id,
        'Подтверждение относится к точной версии; это не электронная подпись личности.',
      );
    try {
      const geojson = missionGeoJSON(document, candidate),
        kml = missionKML(document, candidate),
        geojsonHash = await sha256(geojson);
      add(
        'GEOJSON_REBUILT',
        geojsonHash === (await sha256(evidence.artifacts.geojson)) &&
          geojsonHash === evidence.artifactHashes.geojsonCanonicalJson,
        'GeoJSON заново построен из проверяемых вылетов.',
      );
      add(
        'KML_REBUILT',
        kml === evidence.artifacts.kml &&
          (await sha256Text(kml)) === evidence.artifactHashes.kmlUtf8,
        'KML заново построен; хеш от точных UTF-8 байтов.',
      );
    } catch (error) {
      add('ARTIFACTS', false, errorMessage(error));
    }
  } catch (error) {
    add('EVIDENCE_VALIDATION', false, errorMessage(error));
  }
  return checks;
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const failure = (id: string, error: unknown): Check => ({
  id,
  title: id,
  status: 'fail',
  detail: errorMessage(error),
});

export async function verifyEvidenceFile(path?: string, reportPath?: string) {
  let checks: Check[];
  try {
    if (!path)
      throw new Error(
        'Usage: npm run verify:evidence -- <evidence.json> [report.json]',
      );
    if ((await stat(path)).size > 50 * 1024 * 1024)
      throw new Error('Evidence exceeds 50 MiB.');
    const text = await readFile(path, 'utf8');
    if (Buffer.byteLength(text, 'utf8') > 50 * 1024 * 1024)
      throw new Error('Evidence exceeds 50 MiB.');
    checks = await verifyMissionEvidence(JSON.parse(text));
  } catch (error) {
    checks = [failure('EVIDENCE_INPUT', error)];
  }
  const report = {
    createdAt: new Date().toISOString(),
    file: path ?? null,
    status: checks.some((check) => check.status === 'fail')
      ? 'rejected'
      : 'passes-declared-model',
    flightReady: false,
    checks,
    limitation:
      'Отдельный повторный проход валидатора; общая с оптимизатором библиотека геометрии. Это не независимая сертификация.',
  };
  if (reportPath) {
    try {
      await writeFile(reportPath, JSON.stringify(report, null, 2));
    } catch (error) {
      report.status = 'rejected';
      checks.push(failure('REPORT_WRITE', error));
    }
  }
  return report;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = await verifyEvidenceFile(process.argv[2], process.argv[3]),
    failures = report.checks.filter((check) => check.status === 'fail'),
    unknowns = report.checks.filter((check) => check.status === 'unknown');
  console.log(
    JSON.stringify(
      {
        status: report.status,
        checks: report.checks.length,
        failures,
        unknowns,
      },
      null,
      2,
    ),
  );
  if (failures.length) process.exitCode = 1;
}
