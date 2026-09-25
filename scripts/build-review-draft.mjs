/** Makes a separate, unfrozen review copy. Never stages, commits, uploads or rewrites r3. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {selectWorkingFiles, readContained, sha256, verifyDraft} from './review-package-lib.mjs';
const root = process.cwd(), args = process.argv.slice(2);
if (args.length && !(args.length === 2 && args[0] === '--verify')) throw Error('Usage: node scripts/build-review-draft.mjs [--verify output/review-drafts/<folder>]');
const allowed = path.resolve(root, 'output/review-drafts');
if (args[0] === '--verify') {
  const folder = await fs.realpath(path.resolve(root, args[1]));
  const rel = path.relative(allowed, folder);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw Error('Draft must be within output/review-drafts');
  const result = await verifyDraft(folder); console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'pass') process.exitCode = 1;
} else {
  // Do not copy suspected credentials and do not print matched values.
  execFileSync(process.execPath, ['scripts/audit-submission.mjs', '--working'], {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
  const files = selectWorkingFiles(root), createdAt = new Date().toISOString();
  const folder = path.join(allowed, createdAt.replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8));
  await fs.mkdir(allowed, {recursive: true}); await fs.mkdir(folder);
  const entries = [];
  for (const file of files) {
    const bytes = await readContained(root, file), target = path.join(folder, 'files', file);
    await fs.mkdir(path.dirname(target), {recursive: true}); await fs.writeFile(target, bytes, {flag: 'wx'});
    entries.push({path: file, bytes: bytes.length, sha256: sha256(bytes)});
  }
  // Refuse a mixed copy when selected sources changed while files were being read.
  for (const entry of entries) {
    if (sha256(await readContained(root, entry.path)) !== entry.sha256) throw Error('Source changed during copying: ' + entry.path);
  }
  const manifest = {schema: 'prime-working-review/1.0', createdAt, frozen: false, submissionReady: false,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
    sourceState: 'working-tree-copy-not-a-commit', treeSha256: sha256(JSON.stringify(entries)), files: entries,
    exclusions: 'Unselected untracked files, other tracks, local outputs, media, credentials; not a publication rights clearance.',
    remaining: ['owner-review', 'final-benchmark', 'final-deck', 'video', 'clean-final-clone', 'access', 'official-submission']};
  await fs.writeFile(path.join(folder, 'draft-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'});
  await fs.writeFile(path.join(folder, 'README.md'), '# Внутренний черновой снимок — НЕ ДЛЯ ОФИЦИАЛЬНОЙ СДАЧИ\n\nНе заморожен. Содержит текущее рабочее дерево выбранных файлов, включая маркированные исторические материалы. Это не подтверждение тестов и не финальный архив. Вход: files/README.md. Изменения после копирования сюда автоматически не попадают. Не загружать в кабинет вместо согласованной итоговой версии.\n', {flag: 'wx'});
  const result = await verifyDraft(folder);
  console.log(JSON.stringify({folder: path.relative(root, folder).replaceAll('\\', '/'), ...result}, null, 2));
  if (result.status !== 'pass') process.exitCode = 1;
}
