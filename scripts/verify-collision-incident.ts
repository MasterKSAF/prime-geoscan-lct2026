import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { verifyMissionEvidence } from './verify-mission-evidence.ts';
import {
  recoveryOptions,
  safetySchema,
} from '../lib/planner/mission-safety.ts';
import { canonicalStringify } from '../lib/planner/mission-schema.ts';

const [evidencePath, incidentPath, output] = process.argv.slice(2);
if (!evidencePath || !incidentPath || !output)
  throw new Error('Arguments: evidence.json incident.json report.json');
for (const path of [evidencePath, incidentPath])
  assert.ok((await stat(path)).size <= 20 * 1024 * 1024, '20 MiB input limit');
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
const incident = JSON.parse(await readFile(incidentPath, 'utf8'));
const checks = await verifyMissionEvidence(evidence);
assert.equal(
  checks.filter((c) => c.status === 'fail').length,
  0,
  'Original exported plan must verify first',
);
assert.equal(incident.originalInputHash, evidence.inputHash);
assert.equal(incident.originalPlanHash, evidence.planHash);
assert.equal(incident.missionId, evidence.document.id);
const session = safetySchema.parse(incident.safety);
const reconstructed = recoveryOptions(
  evidence.document,
  evidence.candidate,
  session,
);
const normalize = (v: unknown): unknown =>
  typeof v === 'number'
    ? Math.round(v * 1e6) / 1e6
    : Array.isArray(v)
      ? v.map(normalize)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v).map(([k, value]) => [k, normalize(value)]),
          )
        : v;
assert.equal(
  canonicalStringify(normalize(reconstructed)),
  canonicalStringify(normalize(incident.returnChecks)),
  'Recomputed protective routes must match the recorded routes (1e-6 numerical tolerance)',
);
const chosen = reconstructed.find((o) => o.policy === session.policy);
assert.ok(chosen?.valid, 'Selected return must be valid');
assert.equal(session.stage, 'landed');
assert.ok(Math.abs(session.progressSec - chosen.endSec) < 1e-6);
assert.ok(chosen.minimumPct >= evidence.document.scenario.reservePct);
const report = {
  at: new Date().toISOString(),
  status: 'passes-declared-model',
  originalChecks: checks.length,
  unknown: checks.filter((c) => c.status === 'unknown').map((c) => c.id),
  binding: true,
  recoveryRecomputed: true,
  stage: session.stage,
  minimumRemainingPct: chosen.minimumPct,
  source: session.source,
  limitation:
    'Reuses recovery geometry; not proof of real flight, telemetry or event authenticity.',
};
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
