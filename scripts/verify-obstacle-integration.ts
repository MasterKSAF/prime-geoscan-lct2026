import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { IDBFactory } from 'fake-indexeddb';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { parseMissionText } from '../lib/planner/mission-io.ts';
import {
  parseObstacleKml,
  relevantObstacles,
} from '../lib/planner/obstacle-layer.ts';
import {
  buildMissionArchive,
  verifyArchiveFiles,
} from '../lib/planner/mission-archive.ts';
import { createMissionOperations } from '../lib/planner/mission-operations.ts';
import { sha256, sha256Text } from '../lib/planner/mission-schema.ts';
import { certifyMissionContingencies } from '../lib/planner/mission-contingency.ts';
const out = 'output/obstacles-20260922';
await mkdir(out, { recursive: true });
const start = performance.now(),
  doc = parseMissionText(
    await readFile(
      'public/planner/scenarios/demo-02-expert-obstacles.mission.json',
      'utf8',
    ),
  );
const importStart = performance.now(),
  catalog = parseObstacleKml(doc.obstacleLayer!.sourceText),
  importMs = performance.now() - importStart;
const result = await solveMissionDocument(doc),
  candidate = result.candidates.find((c) => c.status === 'feasible_model');
if (!candidate)
  throw new Error(
    JSON.stringify(
      result.candidates.map((c) => ({ status: c.status, checks: c.checks })),
    ),
  );
const operations = createMissionOperations({ indexedDB: new IDBFactory() });
let run = await operations.enqueue({
  id: 'run-expert-obstacles-20260922',
  document: doc,
  candidate,
  approval: {
    inputHash: result.inputHash,
    planHash: await sha256(candidate),
    candidateId: candidate.id,
    approvedAt: new Date().toISOString(),
  },
});
run = await operations.start(run.id, run.revision);
run = await operations.advance(
  run.id,
  run.revision,
  candidate.metrics.makespanSec,
);
const archive = await buildMissionArchive(doc, candidate, run),
  verified = await verifyArchiveFiles(archive.files);
await writeFile(`${out}/expert-mission.evidence.zip`, archive.bytes);
const contingency = await certifyMissionContingencies(doc, candidate, {
  maxComputeMs: 5000,
});
await writeFile(
  `${out}/contingency.json`,
  JSON.stringify(contingency, null, 2),
);
const report = {
  createdAt: new Date().toISOString(),
  node: process.version,
  flightReady: false,
  importMs,
  totalMs: performance.now() - start,
  sourceSha256: await sha256Text(doc.obstacleLayer!.sourceText),
  objects: catalog.total,
  accepted: catalog.accepted,
  repaired: catalog.repaired,
  rejected: catalog.rejected,
  relevantIds: relevantObstacles(doc).map((o) => ({
    id: o.id,
    sourceId: o.sourceId,
    name: o.name,
    bounds: o.bounds,
  })),
  candidates: result.candidates.map((c) => ({
    objective: c.objective,
    status: c.status,
    metrics: c.metrics,
  })),
  operation: { id: run.id, status: run.status, progressSec: run.progressSec },
  archiveVerification: verified.status,
  contingency: {
    status: contingency.status,
    anchorCount: contingency.anchorCount,
    certifiedAnchors: contingency.certifiedAnchors,
    reasons: contingency.reasons,
  },
};
await writeFile(`${out}/verification.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
operations.close();
