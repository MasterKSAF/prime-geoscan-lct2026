import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

void test('planner uses the supplied raster wordmark and keeps accessible home navigation', async () => {
  const ui = await readFile('components/planner/mission-workbench.tsx', 'utf8');
  const png = await readFile('public/planner/branding/planner-brush.png');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 2048);
  assert.equal(png.readUInt32BE(20), 768);
  assert.match(ui, /aria-label="Планер — список миссий"/);
  assert.match(ui, /src="\/planner\/branding\/planner-brush\.png"/);
  assert.match(ui, /alt="Planner"/);
});

void test('back navigation is below the app bar with unchanged navigation behavior', async () => {
  const ui = await readFile('components/planner/mission-workbench.tsx', 'utf8');
  const css = await readFile('app/planner/mission-expert.css', 'utf8');
  const header = ui.slice(
    ui.indexOf('<header className="mw-appbar">'),
    ui.indexOf('</header>'),
  );
  assert.doesNotMatch(header, /aria-label="Назад"/);
  assert.match(ui, /<\/header>\s*<nav\s+className="mw-navigation-row"/);
  assert.equal(ui.match(/aria-label="Назад"/g)?.length, 1);
  assert.match(ui, /else if \(navigation\.canBack\) navigation\.back\(\)/);
  assert.match(css, /\.mw-brand-image\s*\{[^}]*filter: brightness\(1\.6\)/);
  assert.match(
    css,
    /\.mw-brand\s*\{[^}]*border: 0;[^}]*background: transparent/,
  );
  assert.match(
    css,
    /\.mw-navigation-row \.mw-back\s*\{[^}]*background: transparent/,
  );
});
