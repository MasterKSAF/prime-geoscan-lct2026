/** Working-copy scope and draft integrity. No Git writes or publication. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const newAreas = ['app/planner/', 'app/api/planner/', 'components/planner/', 'lib/planner/', 'lib/server/',
  'docs/planner/submission/', 'docs/planner/history/', 'docs/planner/gsd-altitude-evidence-2026-09-22/',
  'docs/planner/quality-evidence-2026-09-22/', 'scripts/checks/'];
const newFiles = new Set(['lib/planner/altitude-policy.ts', 'tests/mission-altitude-gsd.test.ts',
  'tests/planner-ingress.test.ts', 'scripts/start-planner.mjs', 'scripts/verify-altitude-browser.js',
  'scripts/verify-altitude-http.ts', 'scripts/verify-browser-regression.ps1', 'scripts/verify-http-recovery.ts',
  'scripts/review-working-copy.ps1', 'scripts/build-review-draft.mjs', 'scripts/review-package-lib.mjs',
  'docs/planner/gsd-altitude-requirements-2026-09-22.md', 'docs/planner/quality-closure-2026-09-22.md',
  'docs/planner/http-ingress.md', 'docs/planner/lint-scope.md', 'docs/planner/documentation-manifest.json']);

export function safeRelative(file) {
  if (typeof file !== 'string' || !file || file.includes('\\') || file.includes(':') || file.includes('\0') ||
      path.posix.isAbsolute(file) || file.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Unsafe relative path');
  return file;
}
export function excluded(file) {
  return /^(?:output|outputs|work|tmp|node_modules|vehicle|training|notebooks|data|submission)\//i.test(file) ||
    /(?:^|\/)(?:\.git|\.env(?:\.[^/]*)?|id_rsa|id_ed25519)(?:\/|$)|\.(?:pem|key|pfx|p12|session|mp4|webm|mp3|mov|exe)$/i.test(file);
}
export function presentTrackedFiles(root = process.cwd()) {
  const tracked = execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
  const deleted = new Set(execFileSync('git', ['ls-files', '--deleted', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean));
  return tracked.filter(file => !deleted.has(file));
}
export function selectWorkingFiles(root = process.cwd()) {
  const tracked = presentTrackedFiles(root);
  const extras = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
  return [...new Set([...tracked, ...extras.filter(f => newFiles.has(f) || newAreas.some(p => f.startsWith(p)))])]
    .filter(f => !excluded(f)).map(safeRelative).sort();
}
export async function readContained(root, file) {
  safeRelative(file);
  const base = await fs.realpath(root), target = path.resolve(base, file);
  const actual = await fs.realpath(target), rel = path.relative(base, actual);
  if (!rel || rel.startsWith('..' + path.sep) || rel === '..' || path.isAbsolute(rel)) throw Error('File escapes selected root');
  if ((await fs.lstat(target)).isSymbolicLink() || !(await fs.stat(target)).isFile()) throw Error('Not a regular file');
  return fs.readFile(target);
}
export function validateEntries(entries) {
  if (!Array.isArray(entries) || !entries.length) throw Error('Empty manifest');
  const seen = new Set();
  for (const e of entries) {
    safeRelative(e.path);
    if (seen.has(e.path.toLowerCase()) || !Number.isSafeInteger(e.bytes) || e.bytes < 0 || !/^[a-f0-9]{64}$/.test(e.sha256)) throw Error('Invalid or duplicate manifest entry');
    seen.add(e.path.toLowerCase());
  }
}
export async function verifyDraft(folder) {
  const manifest = JSON.parse(await readContained(folder, 'draft-manifest.json'));
  if (manifest.schema !== 'prime-working-review/1.0' || manifest.frozen !== false || manifest.submissionReady !== false) throw Error('Not a working draft');
  validateEntries(manifest.files);
  if (sha256(JSON.stringify(manifest.files)) !== manifest.treeSha256) throw Error('Manifest tree hash mismatch');
  const failures = [];
  for (const e of manifest.files) {
    try { const bytes = await readContained(path.join(folder, 'files'), e.path);
      if (bytes.length !== e.bytes || sha256(bytes) !== e.sha256) failures.push(e.path);
    } catch { failures.push(e.path); }
  }
  const expected = new Set(manifest.files.map(e => e.path));
  async function walk(dir, prefix = '') {
    for (const item of await fs.readdir(dir, {withFileTypes: true})) {
      const file = prefix + item.name;
      if (item.isSymbolicLink()) { failures.push('UNEXPECTED_LINK ' + file); continue; }
      if (item.isDirectory()) await walk(path.join(dir, item.name), file + '/');
      else if (!expected.has(file)) failures.push('UNLISTED ' + file);
    }
  }
  await walk(path.join(folder, 'files'));
  return {status: failures.length ? 'fail' : 'pass', files: manifest.files.length, failures,
    frozen: false, submissionReady: false, claimBoundary: 'Selected byte identity only; not runtime, rights clearance or final submission.'};
}
