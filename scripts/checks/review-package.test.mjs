import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {excluded, safeRelative, validateEntries, readContained, sha256, verifyDraft, presentTrackedFiles, selectWorkingFiles} from '../review-package-lib.mjs';

test('working selection handles archived tracked docs without silently losing their replacement', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prime-docs-move-test-'));
  const git = (...args) => {
    const result = spawnSync('git', args, {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
  };
  git('init', '--quiet');
  await fs.mkdir(path.join(root, 'docs/planner/history'), {recursive: true});
  await fs.writeFile(path.join(root, 'docs/planner/old.md'), 'old');
  await fs.writeFile(path.join(root, 'README.md'), 'current');
  git('add', 'README.md', 'docs/planner/old.md');
  await fs.rename(path.join(root, 'docs/planner/old.md'), path.join(root, 'docs/planner/history/old.md'));
  assert.deepEqual(presentTrackedFiles(root), ['README.md']);
  assert.deepEqual(selectWorkingFiles(root), ['README.md', 'docs/planner/history/old.md']);
  await fs.writeFile(path.join(root, 'docs/planner/old.md'), 'restored');
  assert.ok(presentTrackedFiles(root).includes('docs/planner/old.md'));
});

test('unsafe, absolute and traversal paths are rejected', () => {
  for (const p of ['../secret', '/tmp/x', 'C:/x', 'a\\b', 'a/../b', 'a//b', 'a/./b', '']) assert.throws(() => safeRelative(p));
  assert.equal(safeRelative('docs/planner/README.md'), 'docs/planner/README.md');
});
test('other tracks, outputs, credentials and recordings excluded', () => {
  for (const p of ['output/a.json', 'vehicle/a.ts', 'training/a.ts', 'submission/bez-nomera/x', '.env', '.env.local', 'a/id_rsa', 'a/x.session', 'a/talk.mp4']) assert.equal(excluded(p), true, p);
  assert.equal(excluded('lib/planner/quality.ts'), false);
});
test('manifest refuses case-insensitive duplicates and malformed entries', () => {
  const e = {path: 'a.md', bytes: 1, sha256: sha256('x')};
  assert.throws(() => validateEntries([]));
  assert.throws(() => validateEntries([e, {...e, path: 'A.md'}]));
  assert.throws(() => validateEntries([{...e, bytes: -1}]));
  assert.throws(() => validateEntries([{...e, sha256: 'invalid'}]));
});
test('draft verification detects tampering, missing files, manifest tampering and false freeze', async () => {
  // Keep failed-test artifacts in a uniquely created OS temporary directory.
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'prime-review-test-'));
  await fs.mkdir(path.join(folder, 'files'));
  await fs.writeFile(path.join(folder, 'files', 'a.md'), 'original');
  const entries = [{path: 'a.md', bytes: 8, sha256: sha256('original')}];
  const manifest = {schema: 'prime-working-review/1.0', frozen: false, submissionReady: false, files: entries, treeSha256: sha256(JSON.stringify(entries))};
  const save = m => fs.writeFile(path.join(folder, 'draft-manifest.json'), JSON.stringify(m));
  await save(manifest);
  assert.equal((await verifyDraft(folder)).status, 'pass');
  await fs.writeFile(path.join(folder, 'files', 'a.md'), 'modified');
  assert.equal((await verifyDraft(folder)).status, 'fail');
  const missing = [{...entries[0], path: 'missing.md'}];
  await save({...manifest, files: missing, treeSha256: sha256(JSON.stringify(missing))});
  assert.equal((await verifyDraft(folder)).status, 'fail');
  await save({...manifest, treeSha256: 'bad'}); await assert.rejects(() => verifyDraft(folder));
  await save({...manifest, frozen: true}); await assert.rejects(() => verifyDraft(folder));
  await save(manifest);
  await fs.writeFile(path.join(folder, 'files', 'a.md'), 'original');
  await fs.writeFile(path.join(folder, 'files', 'unlisted.md'), 'not-in-manifest');
  assert.ok((await verifyDraft(folder)).failures.includes('UNLISTED unlisted.md'));
  await assert.rejects(() => readContained(folder, '../secret'));
});
test('documentation-only mode cannot rewrite the release manifest', () => {
  const p = spawnSync(process.execPath, ['scripts/verify-submission.mjs', '--docs-only', '--write-manifest'], {encoding: 'utf8'});
  assert.notEqual(p.status, 0);
  assert.match(p.stderr, /separately/);
});
test('historical fixed-path evidence collector refuses accidental execution', () => {
  const p = spawnSync(process.execPath, ['scripts/collect-submission-evidence.mjs'], {encoding: 'utf8'});
  assert.notEqual(p.status, 0);
  assert.match(p.stderr, /Historical r3 collector/);
});
