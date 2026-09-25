import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Targeted edit of the approved eleven-slide pitch. No redesign or new slides.
const root = process.cwd();
const skill = process.env.PRESENTATIONS_SKILL_DIR;
const require = createRequire(path.resolve(process.env.RUNTIME_NODE_MODULES, '../authoring-runtime.cjs'));
const { FileBlob, PresentationFile } = await import(pathToFileURL(require.resolve('@oai/artifact-tool')).href);
const { finalizePresentation } = await import(pathToFileURL(path.join(skill, 'container_tools/artifact_tool_utils.mjs')).href);
const work = path.resolve('output/presentation/prime-pitch-20260925');
const tmp = path.join(work, 'private');
const output = path.join(work, 'deliverables');
const inputs = path.resolve('docs/planner/submission/presentation/authoring');
await fs.mkdir(tmp, { recursive: true });
await fs.mkdir(output, { recursive: true });
const source = path.join(inputs, 'approved-source.pptx');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHash = sha(await fs.readFile(source));
if (sourceHash !== '69682c9f7f0e400d2f6b3d2d6252f11447ccb6154ff7a6fd81aad3cd0717f75a')
  throw new Error('Approved source deck differs from the inspected reference.');
const evidence = JSON.parse(await fs.readFile(path.join(inputs, 'evidence.json'), 'utf8'));
const draft = process.env.DECK_DRAFT_ONLY === '1';
if (!draft && (!evidence.demo2 || !evidence.demo3)) throw new Error('Fresh Demo 2 / Demo 3 evidence is required before final export.');
for (const item of [evidence.demo2, evidence.demo3].filter(Boolean)) {
  const report = JSON.parse(await fs.readFile(path.join(inputs, item.browserEvidence), 'utf8'));
  if (!report.passed || report.exitCode !== 0 || report.result?.engineVersion !== '0.4.0'
    || report.result.errors?.length || report.result.checks.some(check => !check.pass))
    throw new Error('Fresh browser evidence did not pass.');
}
const demo1Root = path.join(inputs, 'demo1');
const solve = JSON.parse(await fs.readFile(path.join(demo1Root, 'solve-response.json'), 'utf8'));
const recording = JSON.parse(await fs.readFile(path.join(demo1Root, 'recording.json'), 'utf8'));
const archive = JSON.parse(await fs.readFile(path.join(demo1Root, 'archive-verification.json'), 'utf8'));
if (solve.engineVersion !== '0.4.0' || !recording.complete || recording.errors?.length || archive.status !== 'passes-declared-model')
  throw new Error('Demo 1 provenance checks failed.');
const fast = solve.candidates.find(c => c.id === 'makespan');
const economy = solve.candidates.find(c => c.id === 'flightTime');
if (![fast, economy].every(c => c?.status === 'feasible_model')) throw new Error('Expected two feasible Demo 1 alternatives.');
const suite = await fs.readFile(path.join(inputs, 'full-suite.log'), 'utf8');
if (!/tests 706/.test(suite) || !/pass 706/.test(suite) || !/fail 0/.test(suite)) throw new Error('706/706 test evidence not found.');
const minutes = s => (s / 60).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const demo1Provenance = `Planner 0.4.0. Источник: output/playwright/video-demo1-20260925/take-03/solve-response.json. InputHash ${solve.inputHash}. Создан ${solve.createdAt}. Быстрее закончить: ${minutes(fast.metrics.makespanSec)} мин, ${minutes(fast.metrics.flightTimeSec)} мин налёта, ${fast.metrics.vehicleCount} Gemini с PF1B. Меньше налёт: ${minutes(economy.metrics.makespanSec)} мин, ${minutes(economy.metrics.flightTimeSec)} мин налёта, ${economy.metrics.vehicleCount} Gemini с PF1B. Оба варианта одного входа. Запуск run-1790326339466-csscx завершён в симуляции. Архив проверен: passes-declared-model, flightReady=false. Все результаты модельные, налёт не является прямым измерением износа.`;
const p = await PresentationFile.importPptx(await FileBlob.load(source));
if (p.slides.items.length !== 11) throw new Error('Approved deck must contain eleven slides.');
await fs.writeFile(path.join(tmp, 'source-inspect.ndjson'), (await p.inspect({ kind: 'slide,textbox,shape,image,table,notes,layout', maxChars: 700000 })).ndjson);
function edit(id, old, next) {
  const shape = p.resolve(id);
  shape.text.replace(old, next);
}
function notes(slide, value) { p.resolve(slide).speakerNotes.textFrame.setText(value); }
async function replaceImage(id, file, alt, crop) {
  const im = p.resolve(id), frame = im.frame;
  const keep = { crop: im.crop, geometry: im.geometry, borderRadius: im.borderRadius,
    rotation: im.rotation, flipHorizontal: im.flipHorizontal, flipVertical: im.flipVertical,
    lockAspectRatio: im.lockAspectRatio };
  const bytes = await fs.readFile(path.resolve(file));
  im.replace({ blob: new Uint8Array(bytes), contentType: 'image/png', fit: 'contain', alt });
  Object.assign(im, keep);
  const actualCrop = crop ?? keep.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
  im.crop = actualCrop;
  // New captures have a different aspect ratio. Fit the cropped image inside
  // the approved image area without stretching screenshot text or map geometry.
  if (bytes.subarray(1, 4).toString() !== 'PNG') throw new Error('Expected a source PNG.');
  const ratio = bytes.readUInt32BE(16) * (1 - actualCrop.left - actualCrop.right)
    / (bytes.readUInt32BE(20) * (1 - actualCrop.top - actualCrop.bottom));
  const width = Math.min(frame.width, frame.height * ratio), height = width / ratio;
  im.frame = { left: frame.left + (frame.width - width) / 2, top: frame.top + (frame.height - height) / 2, width, height };
}

edit('sh/sf25g321', 'Planner 0.3.9', 'Planner 0.4.0');
edit('sh/yx0jiloj', 'Совместимость БВС, сенсоров и видов работ.', 'Совместимость БВС, камер и видов работ.');
notes('sl/i107q5of', 'Текущая версия ядра 0.4.0, проверка 25.09.2026. Камера связана с конкретным БВС. Каталог: 9 профилей. Источники и ограничения: docs/planner/camera-profiles-2026-09-25.md, camera-planning-0.4.0.md. Неизвестные размеры сенсора/растр 801 и Riebo, объектив ZV-E10 не подставляются по догадке. Pollux/NIR не является тепловизором. Интервал 1 с и выдержка 1/1000 с — модельные допущения. Продуктовая ценность является гипотезой: измеренная экономия, клиенты и договорённости о пилоте не заявляются. Пилот и интеграции являются планами.');
edit('sh/u1gz6xkn', 'Работы и участки, парк БВС, базы, срок, ограничения и слои.', 'Работы и участки, БВС с камерами, базы, срок, ограничения и слои.');
edit('sh/l8ne98j6', 'Полосы покрытия, переходы между участками, обход препятствий.', 'GSD и полосы по камере, переходы и обход препятствий.');
edit('sh/bi5w3e1o', 'Покрытие, заряд на возврат, ветер, высоты зон и разнесение.', 'GSD, смаз, частота кадров, покрытие, заряд, ветер и разнесение.');
notes('sl/x8f69ofe', 'Planner 0.4.0. Источники: lib/planner/camera-profile.ts, quality.ts, mission-engine.ts, mission-validation.ts и docs/planner/camera-planning-0.4.0.md. Оптика назначенного БВС определяет высоту по GSD, полосу и шаг кадров. Проверяются модельный интервал и поступательный смаз. Одна работа в раскладке использует один оптический профиль; группа состоит из БВС с эквивалентной активной оптикой. Разные профили сравниваются как альтернативы. Поиск ограничен вычислительным бюджетом; глобальная оптимальность не доказана. Реальные калибровка, рельеф, выдержка и частота сохранения требуют проверки.');
await replaceImage('im/to36lwve', path.join(inputs, 'demo1-plans.png'), 'Демо 1, Planner 0.4.0: 11,2/28,6/3 и 17,4/16,4/1, один вход', { left: 0, top: 0.213, right: 0, bottom: 0.04 });
notes('sl/gnmp4jqx', demo1Provenance + ' Фактический кадр frames/10-plans.png, внешняя область интерфейса обрезана без удаления карточек критериев. Источник ZIP: downloads/demo-01-survey.evidence.zip; SHA-256 ' + evidence.demo1.archiveSha256 + '. ТЗ §2 и §4.');

if (evidence.demo2) {
  await replaceImage('im/yp0vih8j', path.join(inputs, evidence.demo2.image), 'Planner 0.4.0: свежая проверка Демо 2 с препятствиями', evidence.demo2.crop);
  for (const [id, old, next] of evidence.demo2.edits ?? []) edit(id, old, next);
  notes('sl/fu1gfa1s', evidence.demo2.notes);
}
if (evidence.demo3) {
  await replaceImage('im/25o7q9cj', path.join(inputs, evidence.demo3.image), 'Planner 0.4.0: проверка замены батареи после ожидаемого отказа Демо 3', evidence.demo3.crop);
  for (const [id, old, next] of evidence.demo3.edits ?? []) edit(id, old, next);
  notes('sl/udsvah03', evidence.demo3.notes);
}
await replaceImage('im/4vu5cvmt', path.join(inputs, 'demo1-download.png'), 'Planner 0.4.0: фактическая выгрузка завершённого Демо 1', { left: 0.07, top: 0.145, right: 0.075, bottom: 0.437 });
notes('sl/m90b6t0r', demo1Provenance + ' На слайде показана строка Демо 1, а не сводка нескольких сценариев. Источник кадра: frames/16-download.png. Реально скачаны ZIP доказательств, KML/GeoJSON маршрутов, отчёт HTML, проверки JSON и MP4 модельной записи; список находится в recording.json. ТЗ §4 требует индивидуальные маршруты. Проверка архива: archive-verification.json. SHA-256 подтверждает целостность, не является электронной подписью. Новые выгрузки не объединяются с прежними версиями. Команда проверки: node --experimental-transform-types scripts/verify-mission-archive.ts <archive.zip>.');
const table = p.resolve('tb/s3ad0re5');
table.cells.set(1, 1, '706 / 706 тестов,\nсборка пройдена');
table.cells.set(2, 0, 'Камерные профили и расчёт качества');
table.cells.set(2, 1, '9 профилей камер,\nGSD, интервал, смаз');
table.cells.set(3, 0, 'Повторная проверка выгрузки Демо 1');
table.cells.set(3, 1, 'ZIP прошёл проверку\nв рамках модели');
notes('sl/jetc3ut0', `Срез 25.09.2026, ядро 0.4.0. ${evidence.testLog}: 706 tests, 706 pass, 0 fail/skipped/cancelled/todo. Production build и typecheck: ${evidence.releaseEvidence}; образ ${evidence.productionImage}. Прежние количественные результаты браузерной приёмки сюда не перенесены. Каталог камер: lib/planner/camera-catalog.ts, 9 записей; наличие записи не подтверждает полноту геометрии или реальную установку. Свежий архив Демо 1: output/playwright/video-demo1-20260925/take-03/archive-verification.json, passes-declared-model, 52 pass / 0 fail / 10 unknown, flightReady=false. Ограничения камеры, реального рельефа и энергетики требуют проверки. Изготовление презентации не является новым прогоном приложения.`);

const candidate = path.join(tmp, 'pitch-candidate.pptx');
await (await PresentationFile.exportPptx(p)).save(candidate);
await fs.writeFile(path.join(tmp, 'pitch-inspect.ndjson'), (await p.inspect({ kind: 'slide,textbox,shape,image,table,notes,layout', maxChars: 700000 })).ndjson);
await fs.writeFile(path.join(tmp, 'build-provenance.json'), JSON.stringify({ engineVersion: solve.engineVersion, slides: 11, source, sourceHash, inputHash: solve.inputHash, fast: fast.metrics, economy: economy.metrics, evidence, draft }, null, 2));
if (draft) console.log(JSON.stringify({ candidate, slides: 11, draft: true, freshDemo2: !!evidence.demo2, freshDemo3: !!evidence.demo3 }));
else {
  const finalPath = path.join(output, process.env.DECK_FILENAME ?? 'prime-planner-0.4.0-pitch-20260925.pptx');
  const result = await finalizePresentation({
    workspaceDir: root, candidatePath: candidate, finalPath, explicitTotalSlideCount: 11,
    // The requested edit retains all eleven approved source slides. This is
    // structural coverage, complemented by the required full visual review.
    sourceTemplatePath: source, requiredTemplateReferenceSlides: Array.from({ length: 11 }, (_, i) => i + 1), minimumTemplateCoverageRatio: 1, requireExactTemplateDimensions: true,
    pythonExecutable: process.env.RUNTIME_PYTHON,
    integrityValidatorPath: path.join(skill, 'container_tools/inspect_presentation_package_integrity.py'),
    layoutValidatorPath: path.join(skill, 'container_tools/inspect_presentation_layout_geometry.py'),
    layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-bullet-geometry', '--validate-heading-fit', '--require-native-table-slide', '11'],
    fontPolicy: { basis: 'reference', families: ['Montserrat'], referencePath: source, referenceSha256: sourceHash },
    requiredNativeTableOwnerSlides: [11], requiredNativeChartOwnerSlides: [], verifyArtifactToolImport: true,
    receiptPath: path.join(tmp, path.basename(finalPath) + '.validation.json'),
  });
  console.log(JSON.stringify(result));
}
