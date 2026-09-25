import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const read = file => fs.readFile(file, 'utf8');
test('current documentation links resolve and the index matches the engine', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-submission.mjs', '--docs-only'], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'pass');
  assert.ok(report.documents >= 19);
  assert.ok(report.localLinks > 100);
});
test('current manuals separate model completion, coverage and real flights', async () => {
  const guide = await read('docs/planner/submission/INTERFACE-GUIDE.md');
  const passport = await read('docs/planner/submission/SOLUTION-PASSPORT.md');
  const demo = await read('docs/planner/submission/DEMO-SCRIPT.md');
  assert.match(guide, /100% проходов не значит покрыто 100% территории/);
  assert.match(passport, /deadline-min-flight-v1/);
  assert.match(passport, /не управляет физическими аппаратами/);
  assert.match(demo, /diagnostic-only-not-flight-approved/);
  assert.match(guide, /перезагрузки|Перезагрузка/);
});
test('evidence counts in current verification match the fresh protocol', async () => {
  const data = JSON.parse(await read('docs/planner/submission/evidence/acceptance-0.4.0.json'));
  const guide = await read('docs/planner/submission/VERIFICATION.md');
  assert.equal(data.engineVersion, '0.4.0');
  assert.equal(data.status, 'pass');
  assert.ok(data.checks.length && data.checks.every(check => check.pass));
  assert.ok(guide.includes(`**${data.build.passed}/${data.build.tests} тестов**`));
  assert.ok(guide.includes(`**${data.browser.assertions}/${data.browser.assertions}**`));
  assert.ok(guide.includes(`**${data.browser.downloads} файлов**`));
  assert.equal(data.build.failed, 0);
  assert.equal(data.flightReady, false);
});
test('active guides no longer route users to archived UI instructions', async () => {
  const files = ['README.md', 'docs/planner/README.md', 'docs/planner/submission/INTERFACE-GUIDE.md', 'docs/planner/submission/DEMO-SCRIPT.md', 'docs/planner/api-v2.md'];
  for (const file of files) {
    const content = await read(file);
    assert.doesNotMatch(content, /\]\([^)]*history\/2026-09-24\//, file);
    assert.doesNotMatch(content, /balanced-normalized-v1/, file);
  }
});
test('mission acceptance follows cards and upload instead of removed search and filters', async () => {
  const guide = await read('docs/planner/submission/ACCEPTANCE-PROCEDURE.md');
  const row = guide.split('\n').find(line => line.startsWith('| UI-02 Миссии |'));
  assert.ok(row, 'Mission screen acceptance row must exist');
  assert.match(row, /трёх карточек/);
  assert.match(row, /карточку загрузки/);
  assert.match(row, /новым ID/);
  assert.match(row, /соседние карточки сохраняются/);
  assert.doesNotMatch(row, /поиск|фильтр/i);
});
test('submission instructions keep GitHub private and require verified expert access', async () => {
  for (const name of ['SUBMIT.md', 'FORM-FIELDS.md', 'READINESS.md', 'README.md', 'RELEASE.md']) {
    const guide = await read(`docs/planner/submission/${name}`);
    assert.match(guide, /закрыт|PRIVATE/, name);
    assert.match(guide, /гостевой доступ|гостевого доступа/i, name);
    assert.match(guide, /эксперт/, name);
    assert.doesNotMatch(guide, /содержит прежний срез|после отдельного согласования|согласовать push/i, name);
  }
  const review = JSON.parse(await read('docs/planner/submission/working-review.json'));
  assert.equal(review.repositoryVersion, '0.4.0');
  assert.equal(review.repositoryAccess, 'private-expert-read-access-required-before-submission');
  assert.ok(review.notAuthorizedNow.includes('github-public-access'));
  assert.ok(review.notAuthorizedNow.includes('official-submission'));
  assert.ok(!review.notAuthorizedNow.includes('commit'));
  assert.ok(!review.notAuthorizedNow.includes('push'));
  assert.equal(review.frozen, false);
  assert.equal(review.submissionReady, false);
});
