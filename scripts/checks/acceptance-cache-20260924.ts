import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { sha256, MISSION_ENGINE_VERSION, type MissionResult } from '../../lib/planner/mission-schema.ts';
import { verifyMissionOperation, type MissionOperation } from '../../lib/planner/mission-operations.ts';

const folder = 'output/playwright/acceptance-2026-09-24/engine';
const result: MissionResult = JSON.parse(await readFile(`${folder}/demo2-dense-real-acceptance.result.json`, 'utf8'));
const candidate = structuredClone(result.candidates.find((c) => c.status === 'feasible_model')!);
assert.ok(candidate);
const timestamp = new Date().toISOString();
const planHash = await sha256(candidate);
const payload: Omit<MissionOperation, 'integrityHash'> = {
  schemaVersion: '1.0', modelOnly: true, engineVersion: MISSION_ENGINE_VERSION,
  id: 'dense-cache-acceptance', revision: 1, status: 'scheduled', progressSec: 0,
  createdAt: timestamp, updatedAt: timestamp, startedAt: null, finishedAt: null,
  document: result.document, candidate, inputHash: result.inputHash, planHash,
  approval: { inputHash: result.inputHash, planHash, candidateId: candidate.id, approvedAt: timestamp },
};
const row: MissionOperation = { ...payload, integrityHash: await sha256(payload) };
const timings: Record<string, number> = {};
async function measure(name: string, fn: () => Promise<unknown>) {
  const start = performance.now();
  await fn();
  timings[name] = performance.now() - start;
}
await measure('coldMs', () => verifyMissionOperation(row));
await measure('warmMs', () => verifyMissionOperation(structuredClone(row)));
await measure('warmSecondMs', () => verifyMissionOperation(row));
const changed = structuredClone(row);
changed.candidate.sorties[0].remainingPct = 99;
changed.planHash = await sha256(changed.candidate);
changed.approval.planHash = changed.planHash;
const { integrityHash: _oldHash, ...changedPayload } = changed;
changed.integrityHash = await sha256(changedPayload);
await measure('mutatedResealedRejectedMs', () => assert.rejects(
  verifyMissionOperation(changed), /повторную модельную проверку/,
));
await measure('originalAfterRejectedMs', () => verifyMissionOperation(row));
const report = {
  generatedAt: new Date().toISOString(), engineVersion: MISSION_ENGINE_VERSION,
  inputHash: result.inputHash, planHash, pass: true, timings,
  note: 'Local Node timing only, not a browser latency claim. Integrity, metadata and current safety checks are repeated; only successful exact-hash static geometry is reused.',
};
await writeFile(`${folder}/static-cache-benchmark.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
