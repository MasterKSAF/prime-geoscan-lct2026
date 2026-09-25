import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Publish only a successfully finalized, natively rendered eleven-slide deck.
const work = path.resolve('output/presentation/prime-pitch-20260925');
const destination = path.resolve('docs/planner/submission/presentation');
const stem = 'prime-planner-0.4.0-pitch-20260925';
const images = path.join(work, 'private/final-slides');
const native = JSON.parse(await fs.readFile(path.join(images, 'native-layout.json'), 'utf8'));
if (native.slides.length !== 11) throw new Error('Expected eleven natively rendered slides.');
await fs.access(path.join(work, 'private', stem + '.pptx.validation.json'));
await fs.mkdir(path.join(destination, 'slides-0.4.0'), { recursive: true });
const files = [];
for (const ext of ['pptx', 'pdf']) {
  const name = `${stem}.${ext}`, bytes = await fs.readFile(path.join(work, 'deliverables', name));
  await fs.copyFile(path.join(work, 'deliverables', name), path.join(destination, name));
  files.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
for (let i = 1; i <= 11; i++) {
  const name = `${String(i).padStart(2, '0')}.png`;
  await fs.copyFile(path.join(images, name), path.join(destination, 'slides-0.4.0', name));
}
const pages = Array.from({ length: 11 }, (_, i) => `<figure><img src="slides-0.4.0/${String(i + 1).padStart(2, '0')}.png" alt="Слайд ${i + 1} из 11" loading="lazy"><figcaption>${i + 1} / 11</figcaption></figure>`).join('\n');
await fs.writeFile(path.join(destination, 'index.html'), `<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ПРАЙМ — Planner 0.4.0</title>
<style>body{margin:0;background:#171225;color:#fff;font:16px system-ui}main{max-width:1280px;margin:auto;padding:24px}a{color:#8ad4ff}figure{margin:24px 0}img{width:100%;height:auto;display:block}figcaption{text-align:right;margin-top:5px;color:#c4becd}nav{display:flex;gap:24px;flex-wrap:wrap}</style>
<main><h1>ПРАЙМ — Planner 0.4.0</h1><p>Разные БВС. Один понятный план. 11 слайдов; проверенный срез 25.09.2026.</p><nav><a href="${stem}.pdf">PDF</a><a href="${stem}.pptx">PowerPoint</a><a href="README.md">Источники и ограничения</a><a href="QA.md">Контроль качества</a></nav>${pages}</main></html>\n`);
await fs.writeFile(path.join(work, 'private/published-files.json'), JSON.stringify({ version: '0.4.0', slides: 11, files }, null, 2));
console.log(JSON.stringify({ destination, files }, null, 2));
