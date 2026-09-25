/** User-archive regression; read-only source, writes a new local QA report. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  readStoredZip,
  buildMissionArchive,
  verifyArchiveFiles,
} from '../../lib/planner/mission-archive.ts';
import { solveMissionDocument } from '../../lib/planner/mission-engine.ts';
import { validateExportedCandidate } from '../../lib/planner/mission-validation.ts';
import {
  sha256,
  type MissionDocument,
  type MissionCandidate,
} from '../../lib/planner/mission-schema.ts';
import { sortieJobIds } from '../../lib/planner/mission-sortie-jobs.ts';

const path = process.argv[2];
if (!path) throw new Error('Specify the original evidence ZIP path.');
const source = readStoredZip(await readFile(path));
const d: MissionDocument = JSON.parse(source['data/input/mission.json']);
const old: MissionCandidate = JSON.parse(source['data/plan/candidate.json']);
const hash = await sha256(d);
const result = await solveMissionDocument(d);
const reports = [];
for (const candidate of result.candidates) {
  const checks = await validateExportedCandidate(d, candidate);
  const archive = await buildMissionArchive(d, candidate);
  const replay = await verifyArchiveFiles(readStoredZip(archive.bytes));
  reports.push({
    objective: candidate.objective,
    status: candidate.status,
    metrics: candidate.metrics,
    failures: checks.filter((c) => c.status === 'fail'),
    archiveStatus: replay.status,
    sorties: candidate.sorties.map((s) => ({
      vehicleId: s.vehicleId,
      jobs: sortieJobIds(s),
      startSec: s.startSec,
      endSec: s.endSec,
    })),
    strategies: candidate.trace.filter((t) =>
      /STRATEGY|COMPACTION|DIRECT_AREA_TRANSFER/.test(t.event),
    ),
  });
}
const report = {
  checkedAt: new Date().toISOString(),
  source: path,
  inputHash: hash,
  inputUnchanged: hash === (await sha256(d)),
  previousMetrics: old.metrics,
  results: reports,
  globalOptimalityProven: false,
};
await mkdir('output/planner-0.3.8', { recursive: true });
await writeFile(
  'output/planner-0.3.8/user-demo2-regression.json',
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (
  reports.some(
    (r) => r.failures.length || r.archiveStatus !== 'passes-declared-model',
  ) ||
  !report.inputUnchanged
)
  process.exitCode = 1;
