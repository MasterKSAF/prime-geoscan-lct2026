import { readFile, stat } from 'node:fs/promises';
import { verifyMissionRunReport } from '../lib/planner/mission-run-export.ts';
try {
  const file = process.argv[2];
  if (!file) throw new Error('Укажите путь к *.report.json.');
  if ((await stat(file)).size > 32 * 1024 * 1024)
    throw new Error('Отчёт превышает 32 МиБ.');
  const report = await verifyMissionRunReport(
    JSON.parse(await readFile(file, 'utf8')),
  );
  console.log(
    JSON.stringify(
      {
        status: 'verified_model_snapshot',
        missionId: report.operation.document.id,
        runId: report.operation.id,
        runStatus: report.operation.status,
        progressSec: report.operation.progressSec,
        flightReady: false,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
