// Diagnostic only. Does not relax safety checks or modify source/app state.
import { readFileSync, writeFileSync } from 'node:fs';
import { importGeometryText } from '../lib/planner/mission-io.ts';

const root = new URL('../docs/planner/expert-materials/2026-09-22/', import.meta.url);
const full = readFileSync(new URL('originals/primorsky-obstacles.kml', root), 'utf8');
const isolated = readFileSync(new URL('first-obstacle-isolated.kml', root), 'utf8');
const noExtrude = isolated.replace(/<extrude>1<\/extrude>/g, '<extrude>0</extrude>');
const clamp = noExtrude.replace(/<altitudeMode>relativeToGround<\/altitudeMode>/g, '<altitudeMode>clampToGround</altitudeMode>');
const line = readFileSync(new URL('first-line-obstacle-isolated.kml', root), 'utf8');
const absolute = readFileSync(new URL('first-absolute-obstacle-isolated.kml', root), 'utf8').replace(/<extrude>1<\/extrude>/g, '<extrude>0</extrude>');
const cases = [
  { name: 'original-complete-file', source: full, expected: 'Размер файла превышает 200 КиБ.' },
  { name: 'first-placemark-isolated-source-values-preserved', source: isolated, expected: 'KML: объёмная экструзия пока не поддержана.' },
  { name: 'diagnostic-only-extrude-disabled-still-relative-height', source: noExtrude, expected: 'KML: поддержан только clampToGround; абсолютные/относительные высоты требуют отдельного адаптера.' },
  { name: 'diagnostic-only-mode-changed-height-still-preserved', source: clamp, expected: 'KML: ненулевые высоты не поддержаны в 2D-импорте; высота не будет молча отброшена.' },
  { name: 'original-first-linestring-isolated', source: line, expected: 'KML: LineString не поддержан; внешние ресурсы и неподдержанные геометрии не загружаются.' },
  { name: 'diagnostic-only-first-absolute-extrude-disabled', source: absolute, expected: 'KML: поддержан только clampToGround; абсолютные/относительные высоты требуют отдельного адаптера.' },
];
const results = cases.map(({ name, source, expected }) => {
  try {
    importGeometryText(source, 'kml', 'obstacle');
    return { name, importAccepted: true, expectedRejectionConfirmed: false, error: null };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { name, importAccepted: false, expectedRejectionConfirmed: error === expected, error };
  }
});
const report = {
  executedAt: new Date().toISOString(),
  purpose: 'Confirm incompatibility; passing rejection assertions does NOT mean successful support of expert data.',
  originalModified: false,
  appCodeModified: false,
  importer: 'lib/planner/mission-io.ts importGeometryText',
  results,
};
writeFileSync(new URL('import-compatibility.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (results.some((r) => !r.expectedRejectionConfirmed)) process.exitCode = 1;
