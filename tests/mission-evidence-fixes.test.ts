import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { missionEvidence, missionKML } from '../lib/planner/mission-export.ts';
import { sha256 } from '../lib/planner/mission-schema.ts';
import type { MissionCandidate } from '../lib/planner/mission-schema.ts';
import {
  verifyEvidenceFile,
  verifyMissionEvidence,
} from '../scripts/verify-mission-evidence.ts';

const calculation = solveMissionDocument(demoMission());

void test('KML preserves Unicode and XML escaping, rejects XML 1.0 forbidden code points', async () => {
  const result = await calculation,
    candidate = result.candidates[0],
    document = structuredClone(result.document);
  document.name = 'Миссия <北> & "съёмка" 🛰️\t\n';
  const errors: string[] = [],
    parsed = new DOMParser({
      onError: (level, message) => {
        if (level !== 'warning') errors.push(message);
      },
    }).parseFromString(missionKML(document, candidate), 'application/xml');
  assert.deepEqual(errors, []);
  assert.equal(
    parsed.getElementsByTagName('name')[0].textContent,
    document.name,
  );
  for (const codePoint of [
    0, 1, 8, 11, 12, 14, 31, 0xd800, 0xdfff, 0xfffe, 0xffff,
  ]) {
    document.name = `Миссия${String.fromCodePoint(codePoint)}`;
    assert.throws(
      () => missionKML(document, candidate),
      /KML: символ U\+.*XML 1\.0/,
    );
    assert.equal(document.name, `Миссия${String.fromCodePoint(codePoint)}`);
  }
  const changed = structuredClone(candidate);
  changed.sorties[0].name += '\u0001';
  assert.throws(() => missionKML(result.document, changed), /U\+0001/);
  changed.sorties[0].name = candidate.sorties[0].name;
  changed.sorties[0].batteryId += '\u0002';
  assert.throws(() => missionKML(result.document, changed), /U\+0002/);
});

void test('evidence verification still accepts a current valid calculation', async () => {
  const result = await calculation,
    evidence = await missionEvidence(result, result.candidates[0]),
    checks = await verifyMissionEvidence(evidence);
  assert.deepEqual(
    checks.filter((check) => check.status === 'fail'),
    [],
  );
});

void test('malformed mandatory metadata is rejected with matching hashes and artifacts', async () => {
  const result = await calculation,
    mutations: [string, (candidate: MissionCandidate) => void][] = [
      [
        'missing ID',
        (candidate) => {
          Reflect.deleteProperty(candidate, 'id');
        },
      ],
      [
        'null ID',
        (candidate) => {
          Object.assign(candidate, { id: null });
        },
      ],
      [
        'empty ID',
        (candidate) => {
          candidate.id = '';
        },
      ],
      [
        'invalid ID',
        (candidate) => {
          candidate.id = 'not an identifier';
        },
      ],
      [
        'missing assumptions',
        (candidate) => {
          Reflect.deleteProperty(candidate, 'assumptions');
        },
      ],
      [
        'null assumptions',
        (candidate) => {
          Object.assign(candidate, { assumptions: null });
        },
      ],
      [
        'invalid assumption type',
        (candidate) => {
          Object.assign(candidate, { assumptions: [null] });
        },
      ],
      [
        'empty assumptions',
        (candidate) => {
          candidate.assumptions = [];
        },
      ],
      [
        'blank assumption',
        (candidate) => {
          candidate.assumptions = ['  '];
        },
      ],
      [
        'missing plan timestamp',
        (candidate) => {
          Reflect.deleteProperty(candidate.plan, 'createdAt');
        },
      ],
      [
        'null plan timestamp',
        (candidate) => {
          Object.assign(candidate.plan, { createdAt: null });
        },
      ],
      [
        'invalid plan timestamp',
        (candidate) => {
          candidate.plan.createdAt = '2026-02-30T00:00:00Z';
        },
      ],
      [
        'missing plan status',
        (candidate) => {
          Reflect.deleteProperty(candidate.plan, 'status');
        },
      ],
      [
        'null plan status',
        (candidate) => {
          Object.assign(candidate.plan, { status: null });
        },
      ],
      [
        'invalid plan status',
        (candidate) => {
          Object.assign(candidate.plan, { status: 'feasible_model' });
        },
      ],
      [
        'inconsistent plan status',
        (candidate) => {
          candidate.plan.status = 'invalid';
        },
      ],
    ];
  for (const [label, mutate] of mutations) {
    const candidate = structuredClone(result.candidates[0]);
    mutate(candidate);
    const evidence = await missionEvidence(result, candidate),
      checks = await verifyMissionEvidence(evidence);
    assert.equal(evidence.planHash, await sha256(candidate), label);
    assert.ok(
      checks.some(
        (check) => check.id === 'EVIDENCE_SCHEMA' && check.status === 'fail',
      ),
      label,
    );
  }
  const evidence = await missionEvidence(result, result.candidates[0]);
  for (const createdAt of [
    undefined,
    null,
    '',
    'yesterday',
    '2026-02-30T00:00:00Z',
  ]) {
    const checks = await verifyMissionEvidence({ ...evidence, createdAt });
    assert.ok(
      checks.some(
        (check) => check.id === 'EVIDENCE_SCHEMA' && check.status === 'fail',
      ),
    );
  }
});

void test('evidence with XML-forbidden text is rejected even when input and candidate hashes match', async () => {
  const result = structuredClone(await calculation),
    evidence = await missionEvidence(result, result.candidates[0]);
  evidence.document.name += '\u0001';
  evidence.inputHash = await sha256(evidence.document);
  evidence.candidate.plan.inputHash = evidence.inputHash;
  evidence.planHash = await sha256(evidence.candidate);
  const checks = await verifyMissionEvidence(evidence);
  assert.ok(
    checks.some(
      (check) =>
        check.id === 'ARTIFACTS' &&
        check.status === 'fail' &&
        /U\+0001/.test(check.detail),
    ),
  );
});

void test('malformed evidence always writes a structured rejection report', async () => {
  const result = await calculation,
    evidence = await missionEvidence(result, result.candidates[0]),
    directory = await mkdtemp(join(tmpdir(), 'mission-evidence-fixes-')),
    inputPath = join(directory, 'input.json'),
    reportPath = join(directory, 'report.json');
  try {
    const malformed: [string, unknown][] = [
      ['null envelope', null],
      ['array envelope', []],
      ['empty envelope', {}],
      ['missing candidate', { ...evidence, candidate: undefined }],
      ['null candidate', { ...evidence, candidate: null }],
      [
        'missing plan',
        {
          ...evidence,
          candidate: { ...evidence.candidate, plan: undefined },
        },
      ],
      [
        'null plan',
        { ...evidence, candidate: { ...evidence.candidate, plan: null } },
      ],
      [
        'empty plan',
        { ...evidence, candidate: { ...evidence.candidate, plan: {} } },
      ],
      ['null document', { ...evidence, document: null }],
      ['invalid document', { ...evidence, document: {} }],
      ['missing approval', { ...evidence, approval: undefined }],
      ['false approval', { ...evidence, approval: false }],
      ['missing artifacts', { ...evidence, artifacts: undefined }],
      ['null artifacts', { ...evidence, artifacts: null }],
      [
        'wrong KML type',
        { ...evidence, artifacts: { ...evidence.artifacts, kml: 1 } },
      ],
      ['null hashes', { ...evidence, artifactHashes: null }],
      ['wrong input hash type', { ...evidence, inputHash: 1 }],
    ];
    for (const [label, value] of malformed) {
      await writeFile(inputPath, JSON.stringify(value));
      const report = await verifyEvidenceFile(inputPath, reportPath);
      assert.equal(report.status, 'rejected', label);
      assert.equal(report.flightReady, false, label);
      assert.ok(
        report.checks.some((check) => check.status === 'fail'),
        label,
      );
      assert.deepEqual(
        JSON.parse(await readFile(reportPath, 'utf8')),
        report,
        label,
      );
    }
    await writeFile(inputPath, '{"broken":');
    const invalidJson = await verifyEvidenceFile(inputPath, reportPath);
    assert.equal(invalidJson.status, 'rejected');
    assert.equal(invalidJson.checks[0].id, 'EVIDENCE_INPUT');
    assert.deepEqual(
      JSON.parse(await readFile(reportPath, 'utf8')),
      invalidJson,
    );
    const missingFile = await verifyEvidenceFile(
      join(directory, 'missing.json'),
      reportPath,
    );
    assert.equal(missingFile.status, 'rejected');
    assert.deepEqual(
      JSON.parse(await readFile(reportPath, 'utf8')),
      missingFile,
    );
    const missingArgument = await verifyEvidenceFile(undefined, reportPath);
    assert.equal(missingArgument.status, 'rejected');
    assert.deepEqual(
      JSON.parse(await readFile(reportPath, 'utf8')),
      missingArgument,
    );
    await truncate(inputPath, 50 * 1024 * 1024 + 1);
    const tooLarge = await verifyEvidenceFile(inputPath, reportPath);
    assert.equal(tooLarge.status, 'rejected');
    assert.match(tooLarge.checks[0].detail, /50 MiB/);
    assert.deepEqual(JSON.parse(await readFile(reportPath, 'utf8')), tooLarge);
    const unwritableReport = await verifyEvidenceFile(inputPath, directory);
    assert.equal(unwritableReport.status, 'rejected');
    assert.ok(
      unwritableReport.checks.some((check) => check.id === 'REPORT_WRITE'),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
