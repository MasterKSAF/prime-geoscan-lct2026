import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const buildPath = 'output/planner-airspace-build-final-20260924.log';
const build = await readFile(buildPath, 'utf8');
const count = label => Number(new RegExp(`ℹ ${label} (\\d+)`, 'u').exec(build)?.[1]);
assert.equal(count('tests'), 659);
assert.equal(count('pass'), 659);
assert.equal(count('fail'), 0);
assert.match(build, /✓ built in/u);
assert.match(build, /naming to docker\.io\/library\/prime-planner:local done/u);

const browser = {};
for (const [name, filename, expected] of [
  ['airspace', 'airspace-prod-20260924.log', 16],
  ['baseEditing', 'airspace-prod-base-20260924.log', 24],
  ['objectsAndImports', 'airspace-prod-objects-20260924.log', 34],
  ['plansAndDownloads', 'airspace-prod-plans-20260924.log', 20],
]) {
  const path = `output/playwright/${filename}`;
  const log = await readFile(path, 'utf8');
  const result = JSON.parse(/^### Result\r?\n([^\r\n]+)/mu.exec(log)?.[1] ?? 'null');
  assert.ok(result, path);
  assert.equal(result.passed, expected, path);
  assert.equal(result.checks.length, expected, path);
  assert.ok(result.checks.every(check => check.pass === true), path);
  assert.deepEqual(result.errors, [], path);
  browser[name] = { ...result, log: path, logSha256: sha256(log) };
}
const archiveReportPath = 'output/playwright/airspace-prod-download-verification.json';
const archives = JSON.parse(await readFile(archiveReportPath, 'utf8'));
assert.equal(archives.archives, 4);
for (const item of archives.checks) {
  assert.equal(sha256(await readFile(item.filename)), item.sha256);
  assert.equal(item.result.status, item.filename.includes('demo3')
    ? 'diagnostic-only-not-flight-approved' : 'passes-declared-model');
}
const auditPath = 'docs/planner/airspace-source-audit-2026-09-24.json';
const auditText = await readFile(auditPath, 'utf8');
const audit = JSON.parse(auditText);
for (const source of audit.sources) {
  assert.equal(sha256(await readFile(`docs/planner/expert-materials/2026-09-23/originals/${source.filename}`)), source.sha256);
}
const health = await (await fetch('http://127.0.0.1:3016/api/planner/health')).json();
assert.equal(health.missionEngineVersion, '0.3.9');
assert.equal(health.status, 'ok');
assert.equal(health.flightReady, false);
const files = [
  'lib/planner/airspace-altitudes.ts', 'lib/planner/mission-catalog.ts',
  'lib/planner/mission-bases.ts', 'lib/planner/mission-engine.ts',
  'lib/planner/mission-safety.ts', 'lib/planner/mission-contingency.ts',
  'lib/planner/mission-schema.ts', 'lib/planner/mission-validation.ts',
  'lib/planner/mission-archive.ts', 'components/planner/mission-map.tsx',
  'components/planner/mission-airspace-layer-summary.tsx',
  'components/planner/mission-data-panel.tsx', 'components/planner/mission-program-help.tsx',
  'app/planner/mission-expert.css', 'docs/planner/contracts/mission-v2.schema.json',
  'tests/mission-airspace-altitudes.test.ts', 'tests/mission-catalog.test.ts',
  'tests/mission-map-lifecycle.test.ts', 'scripts/checks/airspace-20260924-browser.js',
  'scripts/checks/audit-airspace-20260924.ts',
];
const hashes = await Promise.all(files.map(async path => ({path, sha256:sha256(await readFile(path))})));
const report = {
  schemaVersion: 1,
  verifiedAt: new Date().toISOString(),
  engineVersion: health.missionEngineVersion,
  health,
  dockerImage: execFileSync('docker', ['inspect', 'lct-planner-1', '--format', '{{.Image}}'], {encoding:'utf8'}).trim(),
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(),
  scope: 'Working tree, not a clean clone, frozen submission, live airspace permission or physical flight certification.',
  automatedTests: {total:count('tests'),passed:count('pass'),failed:count('fail'),log:buildPath,logSha256:sha256(build)},
  browser,
  browserChecks: Object.values(browser).reduce((sum, entry) => sum + entry.passed, 0),
  downloadedArchives: archives.checks,
  sourceAudit: {path:auditPath,sha256:sha256(auditText)},
  files: hashes,
};
await writeFile('docs/planner/airspace-2026-09-24-verification.json', JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({engineVersion:report.engineVersion,automatedTests:report.automatedTests,browserChecks:report.browserChecks,dockerImage:report.dockerImage,archives:archives.archives},null,2));
