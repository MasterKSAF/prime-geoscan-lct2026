import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  canonicalMissionJson,
  parseSizedMissionDocument,
  serializeMissionJson,
} from '../lib/planner/mission-io.ts';

void test('editor has one calculate action and enters the plans view before asynchronous preparation', async () => {
  const source = await readFile(
    'components/planner/mission-workbench.tsx',
    'utf8',
  );
  assert.equal(
    source.match(/className="mw-button primary mw-calculate-action"/g)?.length,
    1,
  );
  assert.doesNotMatch(
    source,
    /Миссия готова к расчёту|>\s*Расчёт вариантов\s*</,
  );
  const calculation = source.slice(
    source.indexOf('async function calculate()'),
    source.indexOf('async function approve()'),
  );
  const firstAwait = calculation.indexOf('await ');
  for (const transition of [
    'setBusy(true)',
    "setPlanningStep('variants')",
    'setWizard(false)',
    'setResult(null)',
  ]) {
    assert.ok(
      calculation.indexOf(transition) >= 0 &&
        calculation.indexOf(transition) < firstAwait,
      transition,
    );
  }
  assert.match(calculation, /if \(busy\) return/);
});

void test('editor sections share presentation and reset independently when a mission is reopened', async () => {
  const editor = await readFile(
    'components/planner/mission-editor.tsx',
    'utf8',
  );
  const data = await readFile(
    'components/planner/mission-data-panel.tsx',
    'utf8',
  );
  const ui = await readFile('components/planner/mission-workbench.tsx', 'utf8');
  assert.match(editor, /<details className="me-works me-section">/);
  assert.match(editor, /<InfoHint label="Выполняемые работы">/);
  assert.match(editor, /<details className="me-general me-section">/);
  assert.match(data, /<details className="mission-data-panel me-section">/);
  assert.doesNotMatch(
    data.slice(data.indexOf('<summary>'), data.indexOf('</summary>')),
    /каталогов|без внешних препятствий/,
  );
  assert.match(
    ui,
    /<MissionDataPanel\s+key=\{`mission-data-\$\{editorSession\}`\}/,
  );
  assert.match(ui, /onDownloadMission=\{\(\) => exportTask\('json'\)\}/);
  assert.match(data, /Скачать данные миссии JSON/);
});

void test('full editor JSON preserves edited mission fields and obstacle layers across import', async () => {
  const document = parseSizedMissionDocument(
    JSON.parse(
      await readFile(
        'public/planner/scenarios/demo-02-expert-obstacles.mission.json',
        'utf8',
      ),
    ),
  );
  document.name = 'Редактор · несохранённые изменения';
  document.scenario.name = document.name;
  document.jobs[0].name = 'Изменённый участок';
  assert.ok(document.obstacleLayer);
  const serialized = serializeMissionJson(document);
  const imported = parseSizedMissionDocument(JSON.parse(serialized));
  assert.equal(canonicalMissionJson(imported), canonicalMissionJson(document));
  assert.equal(imported.name, document.name);
  assert.deepEqual(imported.jobs, document.jobs);
  assert.deepEqual(imported.obstacleLayer, document.obstacleLayer);
  assert.deepEqual(imported.catalogLayers, document.catalogLayers);
});
