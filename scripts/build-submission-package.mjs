/** Local, allowlisted review package. No Git operations, publication, or deletion. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseName = 'PRIME-Planner-0.4.0';
const outputRoot = path.join(root, 'output/submission');
const runtimeDirs = ['app', 'components', 'lib', 'hooks', 'public', 'tests'];
// The shared workspace also contains tests for a different hackathon track.
// Planner's runtime and test fixtures are retained byte-for-byte; those unrelated
// directories are never copied into the delivery or accepted by its verifier.
const foreignTrackPath = /(?:^|\/)(?:vehicle_diagnostics|vehicle-diagnostics)(?:\/|$)/i;
// Retain the original screenshots locally for history, never ship the obsolete
// help gallery as current UI documentation.
const obsoleteHelpAsset = /^public\/planner\/help\/dispatcher-(?:missions|editor|execution)\.png$/;
const rootFiles = ['package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts',
  'vite.config.ts', 'next-env.d.ts', 'components.json', 'Dockerfile.planner',
  'compose.planner.yaml', '.dockerignore', '.gitignore', '.gitattributes',
  '.oxfmtrc.json', '.oxlintrc.json', '.openai/hosting.json', 'README.md'];
const scriptFiles = ['start-planner.mjs', 'benchmark-missions.ts', 'verify_planner.ts',
  'verify-missions.ts', 'verify-mission-evidence.ts', 'verify-mission-archive.ts',
  'verify-mission-run-report.ts', 'verify-mission-robustness.ts',
  'verify-mission-contingency.ts', 'create-geometry-overflow-fixtures.ts',
  'export-mission-contract.ts', 'check-obstacle-archive-interop.py',
  'build-formular-pdf-20260924.py',
  'presentation/render-native.ps1', 'collect-submission-evidence.mjs',
  'verify-submission.mjs', 'audit-submission.mjs', 'review-package-lib.mjs',
  'build-review-draft.mjs', 'build-submission-package.mjs'];
const freshEvidence = 'output/playwright/acceptance-2026-09-25';
const runtimeBaseline = process.env.PLANNER_VERIFIED_SOURCE || 'output/submission-validation-20260925/verified-source';
const buildInputs = new Set(['package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts', 'vite.config.ts', 'next-env.d.ts', 'Dockerfile.planner', 'compose.planner.yaml', '.dockerignore', '.openai/hosting.json']);
export const finalAssets = [
  { source: 'output/pdf/prime-planner-formular-0.4.0.pdf', target: 'docs/Planner-passport.pdf', role: 'passport' },
  { source: 'docs/planner/submission/presentation/prime-planner-0.4.0-pitch-20260925.pptx', target: 'presentation/Planner-PRIME.pptx', role: 'presentation' },
  { source: 'docs/planner/submission/presentation/prime-planner-0.4.0-pitch-20260925.pdf', target: 'presentation/Planner-PRIME.pdf', role: 'presentation' },
  ...Array.from({ length: 11 }, (_, index) => {
    const name = String(index + 1).padStart(2, '0') + '.png';
    return { source: 'docs/planner/submission/presentation/slides-0.4.0/' + name, target: 'presentation/slides/' + name, role: 'presentation-preview' };
  }),
  { source: 'output/playwright/video-demo1-20260925/Planner-Demo1-PRIME-soft-voice.mp4', target: 'video/Planner-Demo1-PRIME-soft-voice.mp4', role: 'video' },
  { source: 'output/playwright/video-demo1-20260925/soft-voice/qa.json', target: 'video/qa.json', role: 'video-qa' },
  { source: 'output/playwright/acceptance-2026-09-25/engine/full-suite-706.log', target: 'evidence/engine/full-suite-706.log', role: 'tests' },
  { source: 'output/playwright/video-demo1-20260925/take-03/archive-verification.json', target: 'evidence/demo-1/archive-verification.json', role: 'verification' },
  ...['demo-01-survey.evidence.zip', 'demo-01-survey.report.html', 'demo-01-survey.checks.json', 'demo-01-survey.routes-geojson.zip', 'demo-01-survey.routes-kml.zip'].map(name => ({
    source: 'output/playwright/video-demo1-20260925/take-03/downloads/' + name,
    target: 'evidence/demo-1/' + name, role: 'demo-1-evidence',
  })),
];
export const requiredUiArtifacts = [
  'demo2.completed.evidence.zip', 'demo2.routes-kml.zip', 'demo2.routes-geojson.zip', 'demo2.checks.json',
  'demo3.refused.evidence.zip', 'demo3.repaired.evidence.zip', 'demo3.repaired.routes-kml.zip', 'demo3.repaired.routes-geojson.zip', 'demo3.repaired.checks.json',
  'dense.completed.evidence.zip', 'dense.routes-kml.zip', 'dense.routes-geojson.zip', 'camera.replanned.evidence.zip',
];
export const requiredPackageFiles = [
  'README.md', 'docs/README.md', 'evidence/README.md', 'presentation/README.md', 'video/README.md',
  'source/README.md', 'source/package.json', 'source/package-lock.json',
  'source/Dockerfile.planner', 'source/compose.planner.yaml', 'source/scripts/build-submission-package.mjs',
  'source/docs/planner/documentation-manifest.json', 'source/docs/planner/submission/FORMULAR-GOST.md',
  'source/docs/planner/submission/ACCEPTANCE-PROCEDURE.md',
  'source/docs/planner/submission/working-review.json',
  'evidence/engine/acceptance-summary.json', 'evidence/ui/summary.json',
  ...requiredUiArtifacts.map(file => 'evidence/ui/' + file),
  ...finalAssets.map(asset => asset.target),
];
const sha = value => createHash('sha256').update(value).digest('hex');
const slash = value => value.replaceAll('\\', '/');
const json = value => JSON.stringify(value, null, 2) + '\n';
const textExtensions = /\.(?:md|json|geojson|kml|ya?ml|[cm]?js|tsx?|css|html|txt|log|xml|py|ps1)$/i;
const forbiddenPath = /(?:^|\/)(?:node_modules|\.git|\.env(?:\.[^/]*)?|__pycache__|\.playwright-cli|\.playwright-mcp|\.venv[^/]*|id_rsa|id_ed25519)(?:\/|$)|\.(?:pem|key|pfx|p12|session|session-journal|exe|mp3|mp4|webm|mov)$/i;
const sensitiveContent = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp|github_pat)_[A-Za-z0-9_]{30,}|\bxox[baprs]-[A-Za-z0-9-]{20,}|\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}/;
const linkPattern = /!?\[[^\]]*\]\((?:<)?([^)>\s]+)(?:>)?(?:\s+"[^"]*")?\)/g;

export function safeRelative(value) {
  if (!value || typeof value !== 'string' || value.includes('\\') || value.includes(':') ||
      /[<>"|?*\u0000-\u001f]/.test(value) || path.posix.isAbsolute(value) ||
      value.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw Error('Unsafe relative path');
  return value;
}
function contained(base, file) {
  safeRelative(file);
  const result = path.resolve(base, file), relative = path.relative(base, result);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Path escapes package root');
  return result;
}
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function readRegular(base, file) {
  const target = contained(base, file), real = await fs.realpath(target);
  const relative = path.relative(await fs.realpath(base), real);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Symlink escapes root: ' + file);
  const stat = await fs.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Not a regular file: ' + file);
  const bytes = await fs.readFile(target);
  if (textExtensions.test(file) && sensitiveContent.test(bytes.toString('utf8'))) throw Error('Potential credential in selected text: ' + file);
  return bytes;
}
async function walk(base, prefix = '') {
  const files = [];
  for (const item of await fs.readdir(path.join(base, prefix), { withFileTypes: true })) {
    const relative = prefix + item.name;
    if (item.isSymbolicLink()) throw Error('Symlinks are not packaged: ' + relative);
    if (item.isDirectory()) files.push(...await walk(base, relative + '/'));
    else if (item.isFile()) files.push(safeRelative(relative));
    else throw Error('Unsupported filesystem entry: ' + relative);
  }
  return files.sort();
}
export function permittedSource(file) {
  try { safeRelative(file); } catch { return false; }
  if (obsoleteHelpAsset.test(file)) return false;
  if (file.startsWith('docs/planner/submission/presentation/') && /\.(?:pdf|pptx)$/i.test(file) && !file.startsWith('docs/planner/submission/presentation/authoring/') && !finalAssets.some(asset => asset.source === file)) return false;
  if (finalAssets.some(asset => asset.source === file)) return true;
  if (forbiddenPath.test(file) || foreignTrackPath.test(file)) return false;
  if (rootFiles.includes(file) || runtimeDirs.some(dir => file.startsWith(dir + '/'))) return true;
  if (scriptFiles.some(name => file === 'scripts/' + name)) return true;
  if (/^scripts\/checks\/[^/]+\.(?:mjs|js|ts)$/.test(file)) return true;
  if (/^scripts\/presentation\/(?:build-acceptance-20260924|build-expert-deck|build-template37)\.mjs$/.test(file)) return true;
  if (file === 'docs/references/lct2026-presentation-template.pptx') return true;
  if (/^docs\/(?:planner|geoscan-md)\//.test(file)) return true;
  if (/^scripts\/presentation\/.*\.(?:mjs|ps1|py)$/.test(file)) return true;
  if (/^output\/camera-regression-2026-09-25\/[a-zA-Z0-9_.-]+\.(?:json|md|log)$/.test(file)) return true;
  if (/^output\/presentation\/prime-pitch-20260925\/(?:[a-zA-Z0-9_.-]+\.(?:json|md)|private\/(?:[a-zA-Z0-9_.-]+\.(?:json|md)|final-slides\/\d{2}\.png))$/.test(file)) return true;
  if (file.startsWith(freshEvidence + '/')) return permittedTarget('evidence/' + file.slice(freshEvidence.length + 1));
  return false;
}
export function permittedTarget(file) {
  try { safeRelative(file); } catch { return false; }
  if (finalAssets.some(asset => asset.target === file)) return true;
  if (forbiddenPath.test(file)) return false;
  if (['README.md', 'MANIFEST.json', 'SHA256SUMS', 'MANIFEST.sha256',
    'docs/README.md', 'evidence/README.md', 'presentation/README.md', 'video/README.md'].includes(file)) return true;
  if (file.startsWith('source/')) return permittedSource(file.slice(7));
  if (/^presentation\/slides\/\d{2}\.png$/.test(file)) return true;
  return /^evidence\/(?:ui|engine|downloads)\/.+\.(?:json|jsonl|log|txt|xml|md|png|jpe?g|zip|kml|geojson|html|ya?ml|[cm]?js|ts)$/i.test(file);
}
export function markdownLinks(file, content) {
  const refs = [];
  for (const match of content.matchAll(linkPattern)) {
    let ref;
    try { ref = decodeURIComponent(match[1].split('#')[0]); } catch { continue; }
    if (!ref || /^[a-z][a-z0-9+.-]*:/i.test(ref)) continue;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), ref));
    refs.push({ ref, target });
  }
  return refs;
}

// ZIP32 with UTF-8 names and deflate. Archives are independently read back below.
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
export function makeZip(files) {
  const local = [], central = []; let offset = 0;
  const seen = new Set();
  for (const [file, bytes] of files) {
    safeRelative(file);
    if (seen.has(file.toLowerCase())) throw Error('Case-colliding ZIP entry');
    seen.add(file.toLowerCase());
    const name = Buffer.from(file), compressed = deflateRawSync(bytes), crc = crc32(bytes);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8); header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, compressed);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x800, 8); entry.writeUInt16LE(8, 10); entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(compressed.length, 20); entry.writeUInt32LE(bytes.length, 24);
    entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42); central.push(entry, name);
    offset += header.length + name.length + compressed.length;
  }
  const centralBytes = Buffer.concat(central), end = Buffer.alloc(22);
  if (files.size >= 65535 || offset + centralBytes.length >= 0xffffffff) throw Error('ZIP32 size exceeded');
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}
export function readZip(bytes) {
  if (bytes.length < 22 || bytes.readUInt32LE(bytes.length - 22) !== 0x06054b50) throw Error('Invalid ZIP footer');
  const end = bytes.length - 22, count = bytes.readUInt16LE(end + 10), results = new Map();
  const centralStart = bytes.readUInt32LE(end + 16), centralSize = bytes.readUInt32LE(end + 12);
  if (bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0 || bytes.readUInt16LE(end + 8) !== count || bytes.readUInt16LE(end + 20) !== 0 || centralStart + centralSize !== end) throw Error('Invalid ZIP directory bounds');
  let offset = centralStart, localEnd = 0, totalInflated = 0;
  const seen = new Set();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end) throw Error('Truncated ZIP directory');
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw Error('Invalid ZIP directory');
    const nameLen = bytes.readUInt16LE(offset + 28), extraLen = bytes.readUInt16LE(offset + 30), commentLen = bytes.readUInt16LE(offset + 32);
    if (offset + 46 + nameLen + extraLen + commentLen > end) throw Error('Truncated ZIP name');
    const name = bytes.subarray(offset + 46, offset + 46 + nameLen).toString('utf8'); safeRelative(name);
    if (seen.has(name.toLowerCase())) throw Error('Duplicate ZIP name');
    seen.add(name.toLowerCase());
    const local = bytes.readUInt32LE(offset + 42), length = bytes.readUInt32LE(offset + 20);
    const inflatedLength = bytes.readUInt32LE(offset + 24);
    totalInflated += inflatedLength;
    if (inflatedLength > 256 * 1024 * 1024 || totalInflated > 2 * 1024 * 1024 * 1024) throw Error('ZIP expansion limit exceeded');
    if (local !== localEnd || local + 30 > centralStart || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(offset + 10) !== 8 || bytes.readUInt16LE(offset + 8) !== 0x800 || bytes.readUInt16LE(local + 6) !== 0x800 || bytes.readUInt16LE(local + 8) !== 8) throw Error('Invalid ZIP entry');
    const localNameLen = bytes.readUInt16LE(local + 26), localExtraLen = bytes.readUInt16LE(local + 28);
    const start = local + 30 + localNameLen + localExtraLen;
    if (start + length > centralStart || localNameLen !== nameLen || !bytes.subarray(local + 30, local + 30 + localNameLen).equals(bytes.subarray(offset + 46, offset + 46 + nameLen)) || bytes.readUInt32LE(local + 18) !== length || bytes.readUInt32LE(local + 22) !== inflatedLength || bytes.readUInt32LE(local + 14) !== bytes.readUInt32LE(offset + 16)) throw Error('ZIP local and central headers disagree');
    const data = inflateRawSync(bytes.subarray(start, start + length), { maxOutputLength: Math.max(1, inflatedLength) });
    if (data.length !== bytes.readUInt32LE(offset + 24) || crc32(data) !== bytes.readUInt32LE(offset + 16)) throw Error('ZIP entry checksum failed');
    results.set(name, data); offset += 46 + nameLen + extraLen + commentLen;
    localEnd = start + length;
  }
  if (offset !== end || localEnd !== centralStart) throw Error('ZIP contains unaccounted records');
  return results;
}

// These gates concern recorded model checks and package completeness, never
// certification or truth of physical telemetry. Missing evidence cannot pass.
export function validateEvidence(contents) {
  const failures = [];
  for (const file of requiredPackageFiles) if (!contents.has(file) || contents.get(file).length === 0) failures.push('REQUIRED ' + file);
  const parse = file => {
    try { return JSON.parse(contents.get(file)?.toString('utf8')); }
    catch { failures.push('INVALID_JSON ' + file); return null; }
  };
  const engine = parse('evidence/engine/acceptance-summary.json');
  if (engine?.status !== 'pass' || engine?.engineVersion !== '0.4.0') failures.push('ENGINE_ACCEPTANCE');
  const ui = parse('evidence/ui/summary.json');
  if (ui?.status !== 'pass' || ui?.engineVersion !== '0.4.0' || !Array.isArray(ui?.checks) || ui.checks.length === 0 || !ui.checks.every(check => check.pass === true && typeof check.name === 'string' && check.name.trim())) failures.push('UI_ACCEPTANCE');
  if (!Array.isArray(ui?.artifacts) || ui.artifacts.length === 0) failures.push('UI_ARTIFACT_INDEX');
  else {
    const indexed = new Set();
    for (const artifact of ui.artifacts) {
      if (typeof artifact.path !== 'string' || !artifact.path.startsWith(freshEvidence + '/ui/')) { failures.push('UI_ARTIFACT_PATH'); continue; }
      const target = 'evidence/' + artifact.path.slice(freshEvidence.length + 1);
      if (!permittedTarget(target) || indexed.has(target)) { failures.push('UI_ARTIFACT_PATH'); continue; }
      indexed.add(target);
      const bytes = contents.get(target);
      if (!bytes || !Number.isSafeInteger(artifact.bytes) || bytes.length !== artifact.bytes || sha(bytes) !== artifact.sha256) failures.push('UI_ARTIFACT_HASH ' + target);
    }
    for (const name of requiredUiArtifacts) if (!indexed.has('evidence/ui/' + name)) failures.push('UI_ARTIFACT_NOT_INDEXED ' + name);
  }
  const archive = parse('evidence/demo-1/archive-verification.json');
  if (archive?.status !== 'passes-declared-model' || archive?.flightReady !== false || !Array.isArray(archive?.checks) || archive.checks.length === 0 || archive.checks.some(check => check.status === 'fail')) failures.push('DEMO1_ARCHIVE_VERIFICATION');
  const video = parse('video/qa.json');
  const videoBytes = contents.get('video/Planner-Demo1-PRIME-soft-voice.mp4');
  if (video?.status !== 'passed' || !videoBytes || video.sha256 !== sha(videoBytes) || !(video.durationSec > 0 && video.durationSec <= 600)) failures.push('VIDEO_QA');
  const testLog = contents.get('evidence/engine/full-suite-706.log')?.toString('utf8') ?? '';
  const testCount = Number(testLog.match(/^(?:#|ℹ) tests (\d+)\s*$/m)?.[1]);
  const passCount = Number(testLog.match(/^(?:#|ℹ) pass (\d+)\s*$/m)?.[1]);
  const failed = Number(testLog.match(/^(?:#|ℹ) fail (\d+)\s*$/m)?.[1]);
  const cancelled = Number(testLog.match(/^(?:#|ℹ) cancelled (\d+)\s*$/m)?.[1]);
  if (!(testCount >= 706 && passCount === testCount && failed === 0 && cancelled === 0)) failures.push('FULL_TEST_SUITE');
  return [...new Set(failures)];
}

async function writeSourceCandidate(selected, transformedFiles, unresolved, pending) {
  const createdAt = new Date().toISOString();
  const folder = path.join(outputRoot, baseName + '-source-check-' + createdAt.replace(/[:.]/g, '-'));
  await fs.mkdir(folder, { recursive: true });
  const files = [];
  for (const [file, row] of selected) {
    const relative = 'source/' + file, target = contained(folder, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, row.bytes, { flag: 'wx' });
    files.push({ path: relative, bytes: row.bytes.length, sha256: sha(row.bytes), role: row.role });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const changedDuringCopy = [];
  for (const [file, row] of selected) {
    if (sha(await readRegular(root, file)) !== (row.originalHash ?? sha(row.bytes))) changedDuringCopy.push(file);
  }
  const copyFailures = [];
  for (const file of files) {
    const bytes = await readRegular(folder, file.path);
    if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) copyFailures.push(file.path);
  }
  const manifest = {
    schema: 'prime-acceptance-source-candidate/1', createdAt, engineVersion: '0.4.0',
    purpose: 'Isolated source copy for Docker verification only; not a final delivery ZIP.',
    frozen: false, officialSubmission: false, sourceState: 'local-working-tree-copy-without-git',
    transformedFiles, pending, unresolvedReferences: unresolved, changedDuringCopy, copyFailures,
    status: changedDuringCopy.length || copyFailures.length ? 'fail' : 'pass',
    treeSha256: sha(json(files)), files,
  };
  await fs.writeFile(path.join(folder, 'SOURCE-CANDIDATE.json'), json(manifest), { flag: 'wx' });
  console.log(json({ folder, source: path.join(folder, 'source'), status: manifest.status,
    files: files.length, changedDuringCopy, copyFailures, archiveCreated: false,
    manifest: path.join(folder, 'SOURCE-CANDIDATE.json'), frozen: false, officialSubmission: false }));
  if (manifest.status !== 'pass') process.exitCode = 1;
}

async function compareRuntime(selected) {
  const folder = path.resolve(root, runtimeBaseline);
  const reference = JSON.parse((await readRegular(folder, 'SOURCE-CANDIDATE.json')).toString('utf8'));
  if (reference.status !== 'pass' || sha(json(reference.files)) !== reference.treeSha256) throw Error('Invalid source reference');
  const rows = reference.files.filter(row => (row.role === 'runtime' && !row.path.startsWith('source/tests/')) || buildInputs.has(row.path.slice(7)));
  const scope = new Set(rows.map(row => row.path.slice(7))), differences = [];
  for (const row of rows) {
    const file = row.path.slice(7), bytes = await readRegular(folder, row.path);
    if (sha(bytes) !== row.sha256) throw Error('Verified source copy has changed: ' + file);
    const current = selected.get(file)?.bytes;
    if (!current || sha(current) !== row.sha256) differences.push('CHANGED ' + file);
  }
  for (const [file, row] of selected) {
    if (((row.role === 'runtime' && !file.startsWith('tests/')) || buildInputs.has(file)) && !scope.has(file)) differences.push('ADDED ' + file);
  }
  return { status: differences.length ? 'fail' : 'pass', reference: runtimeBaseline,
    sourceManifestSha256: sha(await readRegular(folder, 'SOURCE-CANDIDATE.json')),
    comparedFiles: rows.length, differences,
    scope: 'app/components/lib/hooks/public plus package/lock/build configuration; docs, verification scripts and tests excluded. Both copies contain the documented app/page redirect.' };
}

async function build(sourceOnly = false) {
  process.stderr.write('Selecting Planner runtime, documents and explicit references...\n');
  const selected = new Map(), unresolved = [], historical = [], pending = [], transformedFiles = [];
  const select = async (file, role = 'source') => {
    safeRelative(file);
    if (!permittedSource(file)) throw Error('Source outside allowlist: ' + file);
    if (!selected.has(file)) selected.set(file, { bytes: await readRegular(root, file), role });
  };
  for (const dir of runtimeDirs) for (const file of await walk(path.join(root, dir))) {
    const relative = dir + '/' + file;
    if (foreignTrackPath.test(relative) || obsoleteHelpAsset.test(relative)) continue;
    await select(relative, 'runtime');
  }
  for (const file of rootFiles) if (await exists(path.join(root, file))) await select(file);
  for (const file of scriptFiles) await select('scripts/' + file, 'tool');
  for (const file of await walk(path.join(root, 'scripts/checks'))) if (/\.(?:mjs|js|ts)$/.test(file)) await select('scripts/checks/' + file, 'tool');
  const presentationBuilder = 'scripts/presentation/build-prime-pitch-20260925.mjs';
  if (await exists(path.join(root, presentationBuilder))) await select(presentationBuilder, 'tool');
  for (const name of ['publish-prime-pitch-20260925.mjs', 'check-native-bounds.mjs', 'verify-native-layout.mjs']) {
    await select('scripts/presentation/' + name, 'tool');
  }
  await select('docs/references/lct2026-presentation-template.pptx', 'provided-template');
  const presentationInput = 'docs/planner/submission/presentation/acceptance-data-0.4.0.json';
  if (await exists(path.join(root, presentationInput))) {
    await select(presentationInput, 'presentation-authoring-input');
    const input = JSON.parse(selected.get(presentationInput).bytes.toString('utf8'));
    if (input.status !== 'verified') pending.push('verified presentation/acceptance-data.json');
    // Preserve the exact reviewed screenshots at their source-relative paths so
    // the authoring recipe does not depend on the author's temporary directory.
    for (const key of ['demo1', 'demo2', 'demo3', 'export']) {
      const image = input[key]?.image;
      const isReviewedScreenshot = typeof image === 'string' &&
        (image.startsWith(freshEvidence + '/ui/') || image.startsWith('docs/planner/submission/presentation/assets/')) &&
        /\.png$/i.test(image);
      if (!isReviewedScreenshot) {
        pending.push('current presentation screenshot: ' + key);
      } else await select(image, 'presentation-authoring-input');
    }
  } // Optional authoring input; verified final PPTX/PDF are required below.
  const docsManifest = JSON.parse(await fs.readFile(path.join(root, 'docs/planner/documentation-manifest.json'), 'utf8'));
  await select('docs/planner/documentation-manifest.json', 'current-documentation');
  await select('docs/planner/submission/working-review.json', 'current-documentation');
  for (const doc of docsManifest.currentDocs) await select(doc, 'current-documentation');
  for (const doc of ['docs/planner/submission/RELEASE.md', 'docs/planner/submission/RELEASE-NOTES.md', 'docs/planner/submission/presentation/SPEAKER-NOTES.md']) await select(doc, 'current-documentation');
  for (const date of ['2026-09-22', '2026-09-23']) {
    const prefix = `docs/planner/expert-materials/${date}/originals`;
    for (const file of await walk(path.join(root, prefix))) if (/\.(?:kml|docx)$/i.test(file)) await select(prefix + '/' + file, 'provided-source');
  }
  // Follow concrete Markdown references, retaining original bytes and paths. Dated
  // references remain historical sources, never placed in the fresh evidence area.
  const visited = new Set();
  while (true) {
    const next = [...selected.keys()].find(file => file.endsWith('.md') && !visited.has(file));
    if (!next) break;
    visited.add(next);
    for (const { ref, target } of markdownLinks(next, selected.get(next).bytes.toString('utf8'))) {
      if (selected.has(target)) continue;
      if (!permittedSource(target) || !await exists(path.join(root, target))) {
        unresolved.push({ document: next, reference: ref, reason: permittedSource(target) ? 'source-not-present' : 'outside-delivery-allowlist' }); continue;
      }
      const stat = await fs.lstat(path.join(root, target));
      if (stat.isDirectory()) {
        const readme = path.posix.join(target, 'README.md');
        if (permittedSource(readme) && await exists(path.join(root, readme))) await select(readme, 'reference');
        continue;
      }
      if (stat.size > 32 * 1024 * 1024) { unresolved.push({ document: next, reference: ref, reason: 'reference-over-32-MiB' }); continue; }
      await select(target, 'reference');
      const freshReference = target.startsWith(freshEvidence + '/');
      if (!freshReference && /evidence|verification|history|\/tmp\/|^tmp\/|^output\//i.test(target)) historical.push(target);
    }
  }
  const originalLanding = selected.get('app/page.tsx');
  if (originalLanding) {
    originalLanding.originalHash = sha(originalLanding.bytes);
    originalLanding.bytes = Buffer.from("import { redirect } from 'next/navigation';\n\nexport default function Home() { redirect('/planner'); }\n");
    transformedFiles.push({ path: 'source/app/page.tsx', reason: 'The workspace landing page lists unrelated tracks; the isolated package opens Planner.', originalSha256: originalLanding.originalHash, packagedSha256: sha(originalLanding.bytes) });
  }
  if (sourceOnly) {
    await writeSourceCandidate(selected, transformedFiles, unresolved, pending);
    return;
  }
  const runtimeComparison = await compareRuntime(selected);
  if (runtimeComparison.status !== 'pass') throw Error('Runtime changed since verified Docker copy: ' + runtimeComparison.differences.join(', '));
  const contents = new Map([...selected.entries()].map(([file, row]) => ['source/' + file, row.bytes]));
  const assets = [];
  for (const asset of finalAssets) {
    if (await exists(path.join(root, asset.source))) {
      const bytes = await readRegular(root, asset.source); contents.set(asset.target, bytes);
      assets.push({ ...asset, sha256: sha(bytes) });
      if (asset.source.startsWith('docs/')) contents.set('source/' + asset.source, bytes);
    } else pending.push(asset.source);
  }
  for (const group of ['ui', 'engine']) {
    const prefix = freshEvidence + '/' + group;
    if (await exists(path.join(root, prefix))) {
      for (const file of await walk(path.join(root, prefix))) {
        const target = 'evidence/' + group + '/' + file;
        if (!permittedTarget(target)) throw Error('Unexpected fresh evidence extension: ' + target);
        contents.set(target, await readRegular(root, prefix + '/' + file));
      }
    } else pending.push(prefix);
  }
  const artifactTransformations = [];
  for (const [file, bytes] of contents) {
    if (!file.startsWith('evidence/') || !file.endsWith('.md')) continue;
    const originalPath = freshEvidence + file.slice('evidence'.length);
    const relocated = bytes.toString('utf8').replace(linkPattern, (whole, raw) => {
      const ref = raw.split('#')[0];
      if (!ref || /^[a-z][a-z0-9+.-]*:/i.test(ref)) return whole;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(originalPath), decodeURIComponent(ref)));
      const target = resolved.startsWith(freshEvidence + '/') ? 'evidence/' + resolved.slice(freshEvidence.length + 1) : 'source/' + resolved;
      if (!contents.has(target)) return whole.replace(/\]\([^)]*\)/, '] (исходный путь: `' + raw + '`, вне комплекта)');
      const relative = path.posix.relative(path.posix.dirname(file), target) + (raw.includes('#') ? '#' + raw.split('#').slice(1).join('#') : '');
      return whole.replace(raw, relative);
    });
    const result = Buffer.from(relocated);
    if (!result.equals(bytes)) {
      contents.set(file, result);
      artifactTransformations.push({ path: file, source: originalPath, originalSha256: sha(bytes), packagedSha256: sha(result), reason: 'Relocated Markdown links only; original evidence remains unchanged in the workspace.' });
    }
  }
  const uniqueUnresolved = [...new Map(unresolved.map(row => [row.document + '\0' + row.reference, row])).values()];
  const currentDocsSet = new Set(docsManifest.currentDocs);
  const currentDocumentLinkFailures = uniqueUnresolved.filter(row => currentDocsSet.has(row.document));
  if (pending.length) throw Error('Required final assets are not ready: ' + [...new Set(pending)].join(', '));
  if (currentDocumentLinkFailures.length) throw Error('Broken current document links: ' + json(currentDocumentLinkFailures));
  const createdAt = new Date().toISOString();
  contents.set('README.md', Buffer.from("# ПРАЙМ · Planner 0.4.0\n\nНачните с этого файла. Команда: Сергей Калеев (капитан, разработчик, @sergeikaleev), Револь Миняев (разработчик, +7 903 306 25 73). Казань.\n\n## Что где\n\n| Что нужно | Файл |\n| --- | --- |\n| Быстро посмотреть решение | [Видео 8:12](video/Planner-Demo1-PRIME-soft-voice.mp4) |\n| Презентация | [PDF](presentation/Planner-PRIME.pdf), [PowerPoint](presentation/Planner-PRIME.pptx) |\n| Паспорт программы | [PDF](docs/Planner-passport.pdf) |\n| Запуск и исходный код | [source/README.md](source/README.md) |\n| Работа с интерфейсом | [Руководство](source/docs/planner/submission/INTERFACE-GUIDE.md) |\n| Три приёмочных сценария | [Порядок проверки](source/docs/planner/submission/DEMO-SCRIPT.md) |\n| Доказательства и повторная проверка | [Указатель](evidence/README.md) |\n| Куда загружать при сдаче | [Инструкция](source/docs/planner/submission/SUBMIT.md) |\n\n## Запуск из ZIP\n\nРаспакуйте весь архив. Нужен Docker Desktop в режиме Linux-контейнеров. Первый запуск скачивает зависимости.\n\n```powershell\ncd source\ndocker compose -f compose.planner.yaml up -d --build\n```\n\nОткройте [Planner](http://127.0.0.1:3016/planner). Если порт занят прежней версией, штатно остановите её перед запуском. GitHub для запуска из ZIP не нужен. Карта использует внешнюю подложку.\n\n## Проверка целостности\n\nNode.js 24, npm-зависимости не нужны. Выполните до сборки и изменения файлов из корня распакованного комплекта:\n\n```powershell\nnode source/scripts/build-submission-package.mjs --verify .\n```\n\nРядом с каталогом должны лежать одноимённый ZIP и .zip.sha256. Манифест перечисляет содержимое и происхождение; контрольные суммы не являются электронной подписью.\n\nПоложительные проверки относятся к модели. БВС, погода и результаты съёмки в демо симулируются, не выдаются за физические испытания. Локальный комплект не означает отправку формы, публикацию или фиксацию сданной Git-ветки.\n"));
  contents.set('docs/README.md', Buffer.from('# Документация\n\n[Паспорт PDF](Planner-passport.pdf), [указатель руководств](../source/docs/planner/submission/README.md), [инструкция сдачи](../source/docs/planner/submission/SUBMIT.md). Документация и её относительные ссылки сохранены в source/docs.\n'));
  contents.set('presentation/README.md', Buffer.from('# Презентация ПРАЙМ\n\n[PDF](Planner-PRIME.pdf) · [PPTX](Planner-PRIME.pptx). Актуальная пара 0.4.0, 11 слайдов. [Источники и проверка](../source/docs/planner/submission/presentation/QA.md).\n'));
  contents.set('video/README.md', Buffer.from('# Видеодемонстрация\n\n[Смотреть MP4](Planner-Demo1-PRIME-soft-voice.mp4), 8 минут 12 секунд. Демо 1, выбор плана, полное модельное выполнение ×10, выгрузка и открытие файлов. Мужской голос без музыки и субтитров, заключительное спасибо. Техническая проверка: qa.json. Запись относится к неизменённому ядру 0.4.0; это не съёмка реального полёта.\n'));
  contents.set('evidence/README.md', Buffer.from('# Проверяемые доказательства\n\n[Фактические результаты](../source/docs/planner/submission/VERIFICATION.md), [что значит каждый файл](../source/docs/planner/submission/EXPERT-FILES.md).\n\n- demo-1/: завершённая миссия текущего ядра и независимая проверка ZIP.\n- ui/: свежие приёмочные сценарии Демо 2/3, камеры, карта и скачанные файлы. Отказ исходного Демо 3 ожидаем и отделён от исправленного входа.\n- engine/: протоколы расчётных проверок и сборки.\n\nУ каждой миссии: вход, план, проверки и отчёт. У допустимого плана — индивидуальные KML/GeoJSON. У завершённого запуска — журнал. Диагностический ZIP не содержит выдуманных успешных маршрутов. Точные имена и факты см. в протоколе, не суммируйте независимые прогоны.\n'));
  const evidenceFailures = validateEvidence(contents);
  if (evidenceFailures.length) throw Error('Acceptance evidence is incomplete: ' + evidenceFailures.join(', '));
  for (const [file] of contents) if (!permittedTarget(file)) throw Error('Output outside allowlist: ' + file);
  // Detect concurrent edits before committing this local copy. The one documented
  // landing transformation is checked against its original source hash.
  for (const [file, row] of selected) {
    if (sha(await readRegular(root, file)) !== (row.originalHash ?? sha(row.bytes))) throw Error('Source changed during packaging; rerun: ' + file);
  }
  const files = [...contents].sort(([a], [b]) => a.localeCompare(b)).map(([file, bytes]) => ({ path: file, bytes: bytes.length, sha256: sha(bytes) }));
  const manifest = { schema: 'prime-acceptance-package/1', createdAt, engineVersion: '0.4.0',
    frozen: false, officialSubmission: false, sourceState: 'local-working-tree-copy-without-git',
    scope: 'Planner runtime, current documentation with explicitly linked references, supplied expert data, explicitly dated acceptance evidence and current assets.',
    transformedFiles, artifactTransformations, runtimeComparison, assets, pending, currentDocumentLinkFailures,
    unresolvedReferences: uniqueUnresolved,
    historicalReferences: [...new Set(historical)].sort(),
    sourceFiles: [...selected].map(([file, row]) => ({ path: file, role: row.role, sha256: row.originalHash ?? sha(row.bytes) })),
    treeSha256: sha(json(files)), files,
    exclusions: ['other tracks and root track-ranking content', 'Git', 'node_modules', 'credentials', 'raw user/browser dumps', 'raw meeting media', 'unselected historical output'],
    claimBoundary: 'Byte identity and explicit scope only; not test success, flight certification, signed acceptance, publication, or an official freeze.' };
  contents.set('MANIFEST.json', Buffer.from(json(manifest)));
  contents.set('MANIFEST.sha256', Buffer.from(sha(contents.get('MANIFEST.json')) + '  MANIFEST.json\n'));
  contents.set('SHA256SUMS', Buffer.from([...contents].sort(([a], [b]) => a.localeCompare(b)).map(([file, bytes]) => `${sha(bytes)}  ${file}`).join('\n') + '\n'));
  await fs.mkdir(outputRoot, { recursive: true });
  let folder = path.join(outputRoot, baseName);
  if (await exists(folder) || await exists(folder + '.zip')) folder += '-' + createdAt.replace(/[:.]/g, '-');
  await fs.mkdir(folder);
  process.stderr.write('Writing package: ' + folder + '\n');
  for (const [file, bytes] of contents) { const target = contained(folder, file); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes, { flag: 'wx' }); }
  const archive = makeZip(new Map([...contents].sort(([a], [b]) => a.localeCompare(b))));
  await fs.writeFile(folder + '.zip', archive, { flag: 'wx' });
  await fs.writeFile(folder + '.zip.sha256', sha(archive) + '  ' + path.basename(folder) + '.zip\n', { flag: 'wx' });
  process.stderr.write('Verifying all files, current documentation links and ZIP contents...\n');
  const result = await verify(folder);
  console.log(json({ folder, source: path.join(folder, 'source'), archive: folder + '.zip', ...result }));
  if (result.status !== 'pass') process.exitCode = 1;
}

export async function verify(folder) {
  const actual = await fs.realpath(folder);
  const manifestBytes = await readRegular(actual, 'MANIFEST.json'), manifest = JSON.parse(manifestBytes);
  const failures = [], expected = new Set(['MANIFEST.json', 'MANIFEST.sha256', 'SHA256SUMS']);
  if (manifest.schema !== 'prime-acceptance-package/1' || manifest.frozen !== false || manifest.officialSubmission !== false || manifest.engineVersion !== '0.4.0') failures.push('INVALID_PACKAGE_IDENTITY');
  if (!Array.isArray(manifest.files) || manifest.files.length === 0 || manifest.files.length > 20000 || sha(json(manifest.files)) !== manifest.treeSha256) throw Error('Invalid file manifest');
  if (!Array.isArray(manifest.pending) || manifest.pending.length) failures.push('PENDING_ASSETS');
  if (!Array.isArray(manifest.currentDocumentLinkFailures) || manifest.currentDocumentLinkFailures.length) failures.push('DECLARED_DOCUMENT_FAILURES');
  if (!Array.isArray(manifest.unresolvedReferences) || !Array.isArray(manifest.historicalReferences)) failures.push('INVALID_REFERENCE_INDEX');
  if (manifest.runtimeComparison?.status !== 'pass' || !(manifest.runtimeComparison?.comparedFiles > 0) || !/^[a-f0-9]{64}$/.test(manifest.runtimeComparison?.sourceManifestSha256 ?? '') || !Array.isArray(manifest.runtimeComparison?.differences) || manifest.runtimeComparison.differences.length) failures.push('RUNTIME_COMPARISON');
  const seen = new Set();
  const evidenceContents = new Map();
  for (const entry of manifest.files) {
    safeRelative(entry.path);
    if (expected.has(entry.path) || seen.has(entry.path.toLowerCase()) || !permittedTarget(entry.path) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > 256 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('Invalid manifest entry');
    seen.add(entry.path.toLowerCase()); expected.add(entry.path);
    try {
      const bytes = await readRegular(actual, entry.path);
      if (bytes.length !== entry.bytes || sha(bytes) !== entry.sha256) failures.push('HASH ' + entry.path);
      if (requiredPackageFiles.includes(entry.path) || entry.path.startsWith('evidence/ui/')) evidenceContents.set(entry.path, bytes);
    }
    catch { failures.push('MISSING_OR_UNSAFE ' + entry.path); }
  }
  failures.push(...validateEvidence(evidenceContents));
  const diskFiles = await walk(actual);
  for (const file of diskFiles) if (!expected.has(file) || !permittedTarget(file)) failures.push('UNEXPECTED ' + file);
  const documentation = JSON.parse((await readRegular(actual, 'source/docs/planner/documentation-manifest.json')).toString('utf8'));
  if (documentation.missionEngineVersion !== '0.4.0' || !Array.isArray(documentation.currentDocs) || documentation.currentDocs.length === 0) throw Error('Invalid current documentation index');
  for (const file of documentation.currentDocs) {
    safeRelative(file);
    const bytes = await readRegular(actual, 'source/' + file);
    for (const { target } of markdownLinks(file, bytes.toString('utf8'))) {
      try { if (!await exists(contained(path.join(actual, 'source'), target))) failures.push('CURRENT_DOC_LINK ' + file + ' -> ' + target); }
      catch { failures.push('CURRENT_DOC_LINK ' + file + ' -> ' + target); }
    }
  }
  for (const file of ['README.md', 'docs/README.md', 'presentation/README.md', 'video/README.md', 'evidence/README.md']) {
    const bytes = await readRegular(actual, file);
    for (const { target } of markdownLinks(file, bytes.toString('utf8'))) {
      try { if (!await exists(contained(actual, target))) failures.push('PACKAGE_DOC_LINK ' + file + ' -> ' + target); }
      catch { failures.push('PACKAGE_DOC_LINK ' + file + ' -> ' + target); }
    }
  }
  const checksum = (await readRegular(actual, 'MANIFEST.sha256')).toString('utf8');
  if (checksum !== sha(manifestBytes) + '  MANIFEST.json\n') failures.push('MANIFEST_CHECKSUM');
  const sums = diskFiles.filter(file => file !== 'SHA256SUMS').sort((a, b) => a.localeCompare(b));
  const expectedSums = (await Promise.all(sums.map(async file => `${sha(await readRegular(actual, file))}  ${file}`))).join('\n') + '\n';
  if ((await readRegular(actual, 'SHA256SUMS')).toString('utf8') !== expectedSums) failures.push('SHA256SUMS');
  const archivePath = actual + '.zip';
  if (!await exists(archivePath)) failures.push('ZIP_MISSING');
  else {
    const bytes = await fs.readFile(archivePath), entries = readZip(bytes);
    if (entries.size !== diskFiles.length) failures.push('ZIP_FILE_COUNT');
    for (const file of diskFiles) if (!entries.has(file) || sha(entries.get(file)) !== sha(await readRegular(actual, file))) failures.push('ZIP_CONTENT ' + file);
    try {
      const sumFile = (await fs.readFile(archivePath + '.sha256', 'utf8')).trim();
      if (sumFile !== sha(bytes) + '  ' + path.basename(archivePath)) failures.push('ZIP_CHECKSUM');
    } catch { failures.push('ZIP_CHECKSUM_MISSING'); }
  }
  return { status: failures.length ? 'fail' : 'pass', files: manifest.files.length, failures,
    pending: manifest.pending, unresolvedHistoricalOrExternalReferences: manifest.unresolvedReferences?.length ?? null,
    currentDocumentLinkFailures: failures.filter(value => value.startsWith('CURRENT_DOC_LINK ')),
    historicalReferences: manifest.historicalReferences?.length ?? null, frozen: false, officialSubmission: false,
    claimBoundary: manifest.claimBoundary };
}

export async function main(args = process.argv.slice(2)) {
  if (!args.length) await build();
  else if (args.length === 1 && args[0] === '--source-only') await build(true);
  else if (args.length === 2 && args[0] === '--verify') { const result = await verify(path.resolve(process.cwd(), args[1])); console.log(json(result)); if (result.status !== 'pass') process.exitCode = 1; }
  else throw Error('Usage: node scripts/build-submission-package.mjs [--source-only | --verify output/submission/PRIME-Planner-0.4.0...]');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
