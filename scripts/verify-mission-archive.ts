import { readFile, stat } from 'node:fs/promises';
import {
  readStoredZip,
  verifyArchiveFiles,
} from '../lib/planner/mission-archive.ts';
try {
  const path = process.argv[2];
  if (!path) throw new Error('Укажите путь к ZIP доказательств.');
  if ((await stat(path)).size > 100 * 1024 * 1024)
    throw new Error('Архив больше 100 МиБ.');
  console.log(
    JSON.stringify(
      await verifyArchiveFiles(readStoredZip(await readFile(path))),
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
