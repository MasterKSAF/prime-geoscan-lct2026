import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const help = await readFile(
  new URL('../components/planner/mission-program-help.tsx', import.meta.url),
  'utf8',
);
const normalized = help.replace(/\s+/g, ' ');

void test('program help no longer embeds the retired dispatcher screenshots or gallery tab', () => {
  assert.doesNotMatch(
    help,
    /next\/image|dispatcher-(?:missions|editor|execution)/,
  );
  assert.doesNotMatch(help, /help-screens|value="screens"|tab === 'screens'/);
  assert.match(help, /value="start"/);
  assert.match(help, /value="terms"/);
});

void test('program help follows the current mission cards and direct report downloads', () => {
  const navigation = help.slice(
    help.indexOf('const navigation = ['),
    help.indexOf('] as const;'),
  );
  const labels = [...navigation.matchAll(/\[\s*'([^']+)',/g)].map(
    ([, label]) => label,
  );
  assert.deepEqual(labels, [
    'Миссии',
    'Редактор',
    'Выполнение',
    'Отчёт',
    'Парк БВС',
  ]);
  for (const label of [
    'трёх демонстрационных карточек',
    'Загрузить миссию',
    'Открыть в редакторе',
    'Рассчитать варианты',
    'Все проверки',
    'доказательства ZIP',
    'запись MP4',
    'Период и правила всей миссии',
  ]) {
    assert.ok(
      normalized.includes(label),
      `Missing current help entry: ${label}`,
    );
  }
  assert.doesNotMatch(
    normalized,
    /Поиск, фильтры|Миссии → Отчёт →|в «Файлы»|Скорость ×40/,
  );
  assert.match(normalized, /модельные/);
  assert.match(normalized, /После обновления страницы начинается новая сессия/);
  assert.match(help, /MISSION_EVIDENCE_GUIDE/);
});
