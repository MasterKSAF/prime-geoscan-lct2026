/** One-time, recoverable documentation housekeeping; no runtime or Git writes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root = process.cwd();
const archive = 'docs/planner/history/2026-09-24';
const backup = 'output/documentation-cleanup-20260924-originals';
const names = [
  'demo-session-2026-09-23.md', 'dispatcher-interface-2026-09-21.md',
  'editor-refinement-2026-09-22.md', 'editor-simplification-2026-09-24.md',
  'expert-interface-2026-09-23.md', 'fleet-journal-notifications-2026-09-20.md',
  'help-actions-execution-2026-09-20.md', 'interface-guide-2026-09-20.md',
  'notifications-2026-09-20.md', 'plain-language-interface-2026-09-23.md',
  'simple-interface-2026-09-20.md', 'territory-editor-2026-09-20.md',
  'ux-guide-2026-09-19.md', 'weather-and-workspaces-2026-09-19.md',
  'EXPERT-REVIEW-READINESS-2026-09-24.md', 'UI-SIMPLIFICATION-AUDIT-2026-09-24.md',
  'PENDING-UI-CHANGES.md', 'remaining-work-draft-2026-09-20.md',
  'obstacle-layer-implementation-plan-2026-09-22.md',
];
const resolve = p => {
  const result = path.resolve(root, p);
  if (!result.startsWith(root + path.sep)) throw Error('Path outside workspace');
  return result;
};
const sha256 = b => createHash('sha256').update(b).digest('hex');
const moves = new Map(names.map(name => [resolve('docs/planner/' + name), resolve(archive + '/' + name)]));
const docs = [resolve('README.md')];
async function walk(dir) {
  for (const entry of await fs.readdir(dir, {withFileTypes: true})) {
    if (entry.isSymbolicLink()) throw Error('Unexpected symlink: ' + entry.name);
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.name.endsWith('.md')) docs.push(file);
  }
}
await walk(resolve('docs/planner'));
for (const [source, target] of moves) {
  if (!(await fs.stat(source)).isFile()) throw Error('Not a file: ' + source);
  try { await fs.access(target); throw Error('Archive already exists: ' + target); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
// Snapshot all affected Markdown, not just moved files. Exclusive destination prevents overwrite.
await fs.mkdir(resolve(backup));
const originals = new Map();
const entries = [];
for (const file of docs) {
  const bytes = await fs.readFile(file), relative = path.relative(root, file).replaceAll('\\', '/');
  const saved = resolve(backup + '/' + relative);
  await fs.mkdir(path.dirname(saved), {recursive: true});
  await fs.copyFile(file, saved, 1);
  if (sha256(await fs.readFile(saved)) !== sha256(bytes)) throw Error('Backup mismatch');
  originals.set(file, bytes.toString('utf8'));
  entries.push({path: relative, bytes: bytes.length, sha256: sha256(bytes)});
}
const rewritten = [];
for (const [source, original] of originals) {
  const target = moves.get(source) ?? source;
  // Mechanical relocation of relative Markdown links. Source documents and evidence bytes stay intact.
  let content = original.replace(/(!?\[[^\]]*\]\()(<)?([^\s)>]+)(>)?([^)]*\))/g, (all, prefix, open, url, close, suffix) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('#')) return all;
    const [pathname, ...fragment] = url.split('#');
    const before = path.resolve(path.dirname(source), decodeURIComponent(pathname));
    const after = moves.get(before) ?? before;
    if (target === source && before === after) return all;
    const ref = path.relative(path.dirname(target), after).replaceAll('\\', '/') + (fragment.length ? '#' + fragment.join('#') : '');
    return prefix + (open ?? '') + ref + (close ?? '') + suffix;
  });
  if (target !== source) content = '> Историческая инструкция. Текущее руководство: [работа со стендом](../../submission/INTERFACE-GUIDE.md). Не использовать прежние кнопки и цифры как описание текущей версии.\n\n' + content;
  if (content !== original || target !== source) {
    await fs.mkdir(path.dirname(target), {recursive: true});
    await fs.writeFile(target, content);
    rewritten.push(path.relative(root, target).replaceAll('\\', '/'));
  }
}
// Only these validated individual Markdown files are removed; each has both an archive and a verified backup.
for (const [source, target] of moves) {
  if (!source.startsWith(resolve('docs/planner') + path.sep) || path.extname(source) !== '.md') throw Error('Unsafe removal');
  if (!(await fs.stat(target)).isFile()) throw Error('Missing archived copy');
  await fs.unlink(source);
}
const report = {date: '2026-09-24',backup, moved: [...moves].map(([a,b]) => ({from:path.relative(root,a).replaceAll('\\','/'),to:path.relative(root,b).replaceAll('\\','/')})), rewritten, originals:entries};
await fs.writeFile(resolve(backup + '/backup-manifest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({moved: report.moved.length, backedUp: entries.length, rewritten: rewritten.length, backup}, null, 2));
