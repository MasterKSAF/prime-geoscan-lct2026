import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { makeZip, readZip, permittedSource, permittedTarget, safeRelative, requiredPackageFiles, requiredUiArtifacts, validateEvidence, verify } from '../build-submission-package.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../build-submission-package.mjs', import.meta.url));

function completeContents() {
  const files = new Map(requiredPackageFiles.map(file => [file, Buffer.from('test fixture\n')]));
  files.set('source/docs/planner/documentation-manifest.json', json({ missionEngineVersion: '0.4.0', currentDocs: ['README.md'] }));
  files.set('evidence/engine/acceptance-summary.json', json({ status: 'pass', engineVersion: '0.4.0' }));
  files.set('evidence/ui/summary.json', json({ status: 'pass', engineVersion: '0.4.0', checks: [{ name: 'fixture', pass: true }], artifacts: requiredUiArtifacts.map(name => ({ path: 'output/playwright/acceptance-2026-09-25/ui/' + name, bytes: files.get('evidence/ui/' + name).length, sha256: hash(files.get('evidence/ui/' + name)) })) }));
  files.set('evidence/demo-1/archive-verification.json', json({ status: 'passes-declared-model', flightReady: false, checks: [{ status: 'pass' }] }));
  files.set('video/qa.json', json({ status: 'passed', durationSec: 492.2, sha256: hash(files.get('video/Planner-Demo1-PRIME-soft-voice.mp4')) }));
  files.set('evidence/engine/full-suite-706.log', Buffer.from('ℹ tests 706\nℹ pass 706\nℹ fail 0\nℹ cancelled 0\n'));
  return files;
}

async function fixture(t, { editContents, editManifest } = {}) {
  const tempBase = await fs.realpath(os.tmpdir());
  const temporary = await fs.mkdtemp(path.join(tempBase, 'planner-package-test-'));
  t.after(async () => {
    const resolved = await fs.realpath(temporary);
    assert.equal(path.dirname(resolved).toLowerCase(), tempBase.toLowerCase());
    assert.match(path.basename(resolved), /^planner-package-test-/);
    await fs.rm(resolved, { recursive: true });
  });
  const folder = path.join(temporary, 'PRIME-Planner-0.4.0');
  const contents = completeContents();
  editContents?.(contents);
  const files = [...contents].sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => ({ path: name, bytes: bytes.length, sha256: hash(bytes) }));
  const manifest = {
    schema: 'prime-acceptance-package/1', engineVersion: '0.4.0', frozen: false, officialSubmission: false,
    pending: [], currentDocumentLinkFailures: [], unresolvedReferences: [], historicalReferences: [],
    runtimeComparison: { status: 'pass', comparedFiles: 1, sourceManifestSha256: hash('fixture'), differences: [] },
    files, treeSha256: hash(json(files)),
  };
  editManifest?.(manifest);
  contents.set('MANIFEST.json', json(manifest));
  contents.set('MANIFEST.sha256', Buffer.from(hash(contents.get('MANIFEST.json')) + '  MANIFEST.json\n'));
  contents.set('SHA256SUMS', Buffer.from([...contents].sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => `${hash(bytes)}  ${name}`).join('\n') + '\n'));
  for (const [name, bytes] of contents) {
    const target = path.join(folder, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
  const archive = makeZip(new Map([...contents].sort(([a], [b]) => a.localeCompare(b))));
  await fs.writeFile(folder + '.zip', archive);
  await fs.writeFile(folder + '.zip.sha256', hash(archive) + '  ' + path.basename(folder) + '.zip\n');
  return { folder, contents, archive };
}

test('import is side-effect free and unsafe relative paths are rejected', () => {
  for (const name of ['', '../x', 'source/../x', '/x', 'C:/x', 'source\\x', 'source//x', 'source/x.', 'source/x ', 'source/CON.txt', 'source/file:stream', 'source/x\0']) assert.throws(() => safeRelative(name));
  assert.equal(safeRelative('source/docs/Паспорт.md'), 'source/docs/Паспорт.md');
});

test('allowlist excludes secrets, other track and dated/private outputs', () => {
  for (const name of ['missions', 'editor', 'execution']) {
    const obsolete = `public/planner/help/dispatcher-${name}.png`;
    assert.equal(permittedSource(obsolete), false);
    assert.equal(permittedTarget('source/' + obsolete), false);
  }
  for (const file of ['.env', '.git/config', 'node_modules/x.js', 'vehicle/model.bin', 'app/vehicle_diagnostics/page.tsx', 'tmp/geoscan-plan/gemini-specs.pdf', 'output/cleanup-20260925/recovery.json', 'output/playwright/video-demo2-20260924/Planner-Demo2-PRIME.mp4', 'output/playwright/acceptance-2026-09-24/ui/run.mp4', 'docs/planner/submission/presentation/prime-geoscan-lct2026.pptx', 'output/presentation/prime-pitch-20260925/private/account.json.bak']) assert.equal(permittedSource(file), false, file);
  for (const file of ['source/.env', '../escape', 'evidence/ui/key.pem', 'video/old.mp4', 'MANIFEST/../source/app/x.ts']) assert.equal(permittedTarget(file), false, file);
  assert.equal(permittedTarget('MANIFEST.json'), true);
  assert.equal(permittedTarget('PACKAGE-MANIFEST.json'), false);
  assert.equal(permittedSource('docs/planner/references/standards/gost-r-59328-2021.pdf'), true);
  assert.equal(permittedSource('docs/planner/submission/presentation/prime-planner-0.4.0-pitch-20260925.pptx'), true);
  assert.equal(permittedTarget('video/Planner-Demo1-PRIME-soft-voice.mp4'), true);
});

test('ZIP round trip includes Unicode and empty files', () => {
  const files = new Map([['README.md', Buffer.from('test')], ['source/файл.txt', Buffer.from('Привет')], ['source/empty.txt', Buffer.alloc(0)]]);
  const decoded = readZip(makeZip(files));
  assert.deepEqual([...decoded], [...files]);
});

test('ZIP writer rejects traversal and case-colliding files', () => {
  assert.throws(() => makeZip(new Map([['../escape', Buffer.from('bad')]])));
  assert.throws(() => makeZip(new Map([['source/A.ts', Buffer.from('a')], ['source/a.ts', Buffer.from('b')]])));
});

test('ZIP reader rejects truncation, inconsistent local filename and CRC', () => {
  const original = makeZip(new Map([['README.md', Buffer.from('hello')]]));
  assert.throws(() => readZip(original.subarray(0, original.length - 1)));
  const changedName = Buffer.from(original); changedName[30] ^= 1;
  assert.throws(() => readZip(changedName), /headers disagree/);
  const changedCrc = Buffer.from(original); changedCrc[14] ^= 1;
  assert.throws(() => readZip(changedCrc));
});

test('ZIP reader rejects undeclared records and oversized expansion', () => {
  const original = makeZip(new Map([['README.md', Buffer.from('hello')]]));
  const end = original.length - 22;
  const central = original.readUInt32LE(end + 16);
  const changedCount = Buffer.from(original); changedCount.writeUInt16LE(0, end + 10);
  assert.throws(() => readZip(changedCount));
  const changedSize = Buffer.from(original); changedSize.writeUInt32LE(300 * 1024 * 1024, central + 24);
  assert.throws(() => readZip(changedSize), /expansion limit/);
});

test('completeness includes actual unit log, UI acceptance, video SHA and model boundary', () => {
  const contents = completeContents();
  assert.deepEqual(validateEvidence(contents), []);
  contents.set('video/Planner-Demo1-PRIME-soft-voice.mp4', Buffer.from('other video'));
  assert.ok(validateEvidence(contents).includes('VIDEO_QA'));
  contents.set('evidence/engine/full-suite-706.log', Buffer.from('706 tests passed, trust me'));
  assert.ok(validateEvidence(contents).includes('FULL_TEST_SUITE'));
  contents.set('evidence/ui/summary.json', json({ status: 'pass', engineVersion: '0.4.0', checks: [] }));
  assert.ok(validateEvidence(contents).includes('UI_ACCEPTANCE'));
});

test('complete synthetic package passes independent folder and ZIP checks', async t => {
  const { folder } = await fixture(t);
  const result = await verify(folder);
  assert.equal(result.status, 'pass');
  assert.deepEqual(result.failures, []);
});

test('portable CLI --verify . resolves the current package directory', async t => {
  const { folder } = await fixture(t);
  const { stdout } = await exec(process.execPath, [cli, '--verify', '.'], { cwd: folder });
  assert.equal(JSON.parse(stdout).status, 'pass');
});

test('missing final PDF fails even if all hashes are regenerated consistently', async t => {
  const { folder } = await fixture(t, { editContents: files => files.delete('presentation/Planner-PRIME.pdf') });
  const result = await verify(folder);
  assert.equal(result.status, 'fail');
  assert.ok(result.failures.includes('REQUIRED presentation/Planner-PRIME.pdf'));
});

test('pending assets and changed runtime cannot be disguised by valid checksums', async t => {
  const { folder } = await fixture(t, { editManifest: manifest => { manifest.pending.push('missing'); manifest.runtimeComparison.differences.push('CHANGED lib/core.ts'); } });
  const result = await verify(folder);
  assert.ok(result.failures.includes('PENDING_ASSETS'));
  assert.ok(result.failures.includes('RUNTIME_COMPARISON'));
});

test('failed UI check fails even when summary status claims pass', async t => {
  const { folder } = await fixture(t, { editContents: files => files.set('evidence/ui/summary.json', json({ status: 'pass', engineVersion: '0.4.0', checks: [{ name: 'demo2', pass: false }] })) });
  assert.ok((await verify(folder)).failures.includes('UI_ACCEPTANCE'));
});

test('old engine evidence is not current evidence', async t => {
  const { folder } = await fixture(t, { editContents: files => files.set('evidence/engine/acceptance-summary.json', json({ status: 'pass', engineVersion: '0.3.9' })) });
  assert.ok((await verify(folder)).failures.includes('ENGINE_ACCEPTANCE'));
});

test('missing or substituted UI downloads cannot pass by updating the package hashes', async t => {
  const { folder } = await fixture(t, { editContents: files => files.set('evidence/ui/demo2.completed.evidence.zip', Buffer.from('substitution')) });
  assert.ok((await verify(folder)).failures.includes('UI_ARTIFACT_HASH evidence/ui/demo2.completed.evidence.zip'));
});

test('tampered file and ZIP checksum are detected', async t => {
  const { folder } = await fixture(t);
  await fs.appendFile(path.join(folder, 'source/README.md'), 'tampered');
  await fs.writeFile(folder + '.zip.sha256', 'bad hash');
  const result = await verify(folder);
  assert.ok(result.failures.includes('HASH source/README.md'));
  assert.ok(result.failures.includes('ZIP_CONTENT source/README.md'));
  assert.ok(result.failures.includes('ZIP_CHECKSUM'));
});

test('unexpected files are detected rather than ignored', async t => {
  const { folder } = await fixture(t);
  await fs.writeFile(path.join(folder, 'accidental.json'), '{}');
  assert.ok((await verify(folder)).failures.includes('UNEXPECTED accidental.json'));
});

test('current and top-level Markdown links must exist inside package', async t => {
  const { folder } = await fixture(t, { editContents: files => {
    files.set('source/README.md', Buffer.from('[broken](docs/missing.md)'));
    files.set('README.md', Buffer.from('[outside](../outside.md)'));
  } });
  const result = await verify(folder);
  assert.ok(result.failures.some(value => value.startsWith('CURRENT_DOC_LINK ')));
  assert.ok(result.failures.some(value => value.startsWith('PACKAGE_DOC_LINK ')));
});

test('manifest path traversal is rejected before filesystem access', async t => {
  const { folder } = await fixture(t, { editManifest: manifest => {
    manifest.files.push({ path: '../escape.txt', bytes: 1, sha256: hash('a') });
    manifest.treeSha256 = hash(json(manifest.files));
  } });
  await assert.rejects(verify(folder), /Unsafe relative path/);
});

test('missing ZIP checksum cannot pass', async t => {
  const { folder } = await fixture(t);
  await fs.unlink(folder + '.zip.sha256');
  assert.ok((await verify(folder)).failures.includes('ZIP_CHECKSUM_MISSING'));
});
