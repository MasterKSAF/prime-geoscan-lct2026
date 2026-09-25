import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { readStoredZip, verifyArchiveFiles } from '../../lib/planner/mission-archive.ts';
import { parseMissionDocument, sha256 } from '../../lib/planner/mission-schema.ts';

const prefix = process.argv[2] ?? 'release038-prod';
const results = [];
for (const i of [1, 2, 3]) {
  const path = `output/playwright/${prefix}-demo${i}${i === 3 ? '-diagnostic' : '.evidence'}.zip`;
  const files = readStoredZip(await readFile(path));
  const verified = await verifyArchiveFiles(files);
  assert.equal(verified.status, i === 3 ? 'diagnostic-only-not-flight-approved' : 'passes-declared-model');
  const d = parseMissionDocument(JSON.parse(files['data/input/mission.json']));
  assert.ok(files['data/input/mission.html'].includes('паспорт миссии'));
  const checks = JSON.parse(files['data/checks/validation.json']);
  const record: Record<string, unknown> = { demo: i, path, status: verified.status, files: Object.keys(files).length,
    inputHash: await sha256(d), failures: checks.filter((c: {status: string}) => c.status === 'fail').map((c: {id: string}) => c.id) };
  if (i < 3) {
    assert.deepEqual(record.failures, []);
    assert.deepEqual(JSON.parse(await readFile(`output/playwright/${prefix}-demo${i}.checks.json`, 'utf8')), checks);
    const downloadedInput = parseMissionDocument(JSON.parse(await readFile(`output/playwright/${prefix}-demo${i}-run.mission.json`, 'utf8')));
    assert.equal(await sha256(downloadedInput), await sha256(d), 'Execution download must be the actual run snapshot.');
    const run = JSON.parse(files['data/run/report.json']);
    assert.equal(run.operation.status, 'completed');
    record.runStatus = run.operation.status;
    record.routes = Object.keys(files).filter(p => p.startsWith('data/routes/'));
    record.video = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,format_name:stream=codec_name,width,height', '-of', 'json', `output/playwright/${prefix}-demo${i}.mp4`], { encoding: 'utf8' }));
    const changed = { ...files, 'data/input/mission.json': files['data/input/mission.json'] + ' ' };
    await assert.rejects(verifyArchiveFiles(changed), /Контрольная сумма/);
    record.changedArchiveRejected = true;
  }
  results.push(record);
}
const browserLog = await readFile(`output/planner-browser${prefix.endsWith('-prod') ? '-prod' : ''}-0.3.8.log`, 'utf8');
const browser = JSON.parse(browserLog.split(/\r?\n/).find(line => line.startsWith('{"checkedAt"'))!);
assert.equal(browser.checks.filter((c: {pass: boolean}) => !c.pass).length, 0);
await mkdir('output/planner-0.3.8', { recursive: true });
const report = { checkedAt: new Date().toISOString(), engine: '0.3.8', results, browser, flightReady: false, globalOptimalityProven: false };
await writeFile(`output/planner-0.3.8/${prefix}-verification.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ artifacts: results, browserChecks: browser.checks.length, browserFailures: 0 }, null, 2));
