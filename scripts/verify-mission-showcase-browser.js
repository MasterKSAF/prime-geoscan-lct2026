// Playwright CLI evaluates this raw arrow function; do not add a trailing semicolon.
// eslint-disable-next-line no-unused-expressions -- Playwright CLI invokes this function with page.
async (page) => {
  // Separate real-browser session showcase-features-030. No routes, mocks,
  // direct storage writes, React-state changes or solver calls outside the UI.
  // Run from the checkout root. Keep the dated 0.3.0 evidence immutable.
  const root = '.';
  const out = `${root}/output/playwright/recheck-showcase`;
  const base = 'http://127.0.0.1:3016';
  const run = Date.now();
  const checks = [], groups = [], downloads = [], solves = [], pageErrors = [];
  const onError = (error) => pageErrors.push(error.message);
  const onDialog = async (dialog) => {
    if (dialog.type() === 'beforeunload') await dialog.accept();
  };
  const stable = (value) => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
    return value;
  };
  const assert = (name, pass, detail = '') => {
    checks.push({ name, pass: !!pass, detail });
    if (!pass) throw new Error(`${name}: ${detail}`);
  };
  const group = async (name, work) => {
    const record = { name, status: 'running', startedAt: new Date().toISOString() };
    groups.push(record);
    await work();
    record.status = 'pass';
  };
  const screenshot = (name) => page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const close = () => page.getByRole('button', { name: 'Закрыть окно', exact: true }).click();
  const download = async (button, name) => {
    const pending = page.waitForEvent('download');
    await button.click();
    const file = await pending;
    await file.saveAs(`${out}/${name}`);
    assert(`download ${name}`, (await file.failure()) === null);
    let text = '';
    const stream = await file.createReadStream();
    for await (const chunk of stream) text += chunk.toString();
    downloads.push({ path: `${out}/${name}`, suggestedFilename: file.suggestedFilename() });
    return text;
  };
  const exported = async (name) => JSON.parse(await download(page.getByRole('button', { name: 'JSON', exact: true }), name));
  const calculate = async (name) => {
    const pending = page.waitForResponse((r) => r.url() === `${base}/api/planner/missions/solve` && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Рассчитать варианты', exact: true }).click();
    const response = await pending;
    assert(`${name}: actual HTTP 200`, response.status() === 200, `HTTP ${response.status()}`);
    const result = await response.json();
    const input = response.request().postDataJSON();
    await page.getByRole('button', { name: 'Сравнить и объяснить варианты', exact: true }).waitFor();
    solves.push({ name, input, result });
    return { input, result };
  };
  const importMission = async (id) => {
    await page.getByLabel('Файл задания миссии', { exact: true }).setInputFiles(`${root}/public/planner/scenarios/${id}.mission.json`);
    const preview = page.getByRole('dialog', { name: 'Проверка перед загрузкой', exact: true });
    await preview.waitFor();
    await preview.getByRole('button', { name: 'Заменить текущее задание', exact: true }).click();
    await preview.waitFor({ state: 'hidden' });
  };
  const saveAs = async (id, name) => {
    await page.getByRole('button', { name: 'Сохранить как', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Сохранить миссию под новым ID', exact: true });
    await dialog.getByLabel('Новый номер / ID миссии', { exact: true }).fill(id);
    await dialog.getByLabel('Название новой миссии', { exact: true }).fill(name);
    await dialog.getByRole('button', { name: 'Создать новую миссию', exact: true }).click();
    return dialog;
  };
  page.on('pageerror', onError);
  page.on('dialog', onDialog);
  let failure = null, health = null;
  try {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`${base}/planner`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Рассчитать варианты', exact: true }).waitFor();
    await group('1. Gallery: nine scenarios, preview and unchanged draft', async () => {
      const response = await page.request.get(`${base}/api/planner/health`);
      health = await response.json();
      assert('engine 0.3.0', response.status() === 200 && health.missionEngineVersion === '0.3.0', JSON.stringify(health));
      const originalTitle = await page.locator('.mw-titlebar h1').innerText();
      await page.getByRole('button', { name: 'Сценарии', exact: true }).click();
      const gallery = page.getByRole('dialog', { name: 'Демонстрационные сценарии', exact: true });
      assert('nine gallery cards', await gallery.locator('.ms-scenario').count() === 9);
      assert('tradeoff first card', (await gallery.locator('.ms-scenario').first().innerText()).includes('Автовыбор БВС'));
      assert('synthetic disclaimer', (await gallery.innerText()).includes('не официальные входные данные'));
      await screenshot('01-gallery-desktop');
      await gallery.getByRole('button', { name: 'Открыть сценарий 1', exact: true }).click();
      const preview = page.getByRole('dialog', { name: 'Проверка перед загрузкой', exact: true });
      await preview.waitFor();
      assert('preview does not replace draft', await page.locator('.mw-titlebar h1').innerText() === originalTitle);
      const text = await preview.innerText();
      assert('preview passport shows automatic group and weather', text.includes('3 БВС') && text.includes('Автоматический выбор совместимых БВС') && text.includes('нижняя граница 250 м'));
      await screenshot('02-gallery-preview-passport');
      await preview.getByRole('button', { name: 'Заменить текущее задание', exact: true }).click();
    });
    await group('2. Passport and Save As collision preserve original', async () => {
      await page.getByRole('button', { name: 'Паспорт миссии', exact: true }).click();
      const passport = page.getByRole('dialog', { name: 'Паспорт миссии', exact: true });
      assert('passport datum and resource data visible', (await passport.innerText()).includes('общий локальный уровень') && (await passport.innerText()).includes('9 АКБ'));
      await download(passport.getByRole('button', { name: 'Скачать описание MD', exact: true }), 'passport.md');
      await close();
      const originId = `qa-origin-${run}`, copyId = `qa-copy-${run}`;
      await (await saveAs(originId, 'QA — исходная миссия')).waitFor({ state: 'hidden' });
      const original = await exported('saveas-original.mission.json');
      await (await saveAs(copyId, 'QA — копия миссии')).waitFor({ state: 'hidden' });
      const copy = await exported('saveas-copy.mission.json');
      const physical = (d) => ({ ...d, id: '', name: '', scenario: { ...d.scenario, name: '' } });
      assert('saveas changes only identity/name', copy.id === copyId && JSON.stringify(physical(copy)) === JSON.stringify(physical(original)));
      const collision = await saveAs(originId, 'НЕ ДОЛЖНО ПЕРЕЗАПИСАТЬ');
      await collision.getByRole('alert').waitFor();
      assert('occupied ID rejected', (await collision.innerText()).includes('уже сохранена'));
      await screenshot('03-saveas-collision');
      await close();
      await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
      const library = page.getByRole('dialog', { name: 'Локальная библиотека миссий', exact: true });
      const backup = JSON.parse(await download(library.getByRole('button', { name: 'Резервная копия', exact: true }), 'library-after-collision.json'));
      const saved = backup.entries.find((entry) => entry.id === originId);
      assert('original content and revision untouched', saved?.revision === 1 && JSON.stringify(stable(saved.document)) === JSON.stringify(stable(original)));
      assert('copy remains separate', backup.entries.some((entry) => entry.id === copyId && entry.revision === 1));
      await close();
    });
    await group('3. Three actual API plans, balanced selection, approval and export', async () => {
      const { result } = await calculate('tradeoff');
      const [fast, economical] = result.candidates, balanced = result.recommendation?.candidate;
      assert('legacy pair plus actual balanced', result.candidates.length === 2 && balanced?.status === 'feasible_model' && result.recommendation.samePlanAs.length === 0);
      assert('strict genuine metric tradeoff', fast.metrics.makespanSec < balanced.metrics.makespanSec && balanced.metrics.makespanSec < economical.metrics.makespanSec && economical.metrics.flightTimeSec < balanced.metrics.flightTimeSec && balanced.metrics.flightTimeSec < fast.metrics.flightTimeSec);
      assert('three distinct physical sorties', new Set([fast, economical, balanced].map((c) => JSON.stringify(c.sorties))).size === 3);
      await page.getByRole('button', { name: 'Сравнить и объяснить варианты', exact: true }).click();
      const comparison = page.getByRole('dialog', { name: 'Сравнение вариантов миссии', exact: true });
      assert('three comparison rows', await comparison.locator('table').first().locator('tbody tr').count() === 3);
      assert('formula and proxy explanation rendered', (await comparison.innerText()).includes('50/50') && (await comparison.innerText()).includes('не физический износ'));
      await comparison.getByRole('button', { name: 'Баланс', exact: true }).click();
      await screenshot('04-three-plans-balanced');
      await close();
      await page.getByRole('button', { name: 'Проверить и подтвердить', exact: true }).click();
      const approval = page.getByRole('dialog', { name: 'Подтвердить модельный план', exact: true });
      const confirm = approval.getByRole('button', { name: 'Подтвердить для симуляции', exact: true });
      assert('acknowledgement mandatory', await confirm.isDisabled());
      await approval.getByRole('checkbox').check();
      await confirm.click();
      await page.getByRole('button', { name: 'План подтверждён', exact: true }).waitFor();
      const evidence = JSON.parse(await download(page.getByRole('button', { name: 'Доказательства', exact: true }), 'balanced.evidence.json'));
      assert('balanced exact approval binding and formula exported', evidence.candidate.id === 'balanced' && evidence.approval.candidateId === 'balanced' && evidence.approval.planHash === evidence.planHash && evidence.candidate.assumptions.some((s) => s.includes('50/50') && s.includes('не физический износ')) && evidence.flightReady === false);
      await download(page.getByRole('button', { name: 'План JSON', exact: true }), 'balanced.plan.json');
      await download(page.getByRole('button', { name: 'GeoJSON', exact: true }), 'balanced.geojson');
      await screenshot('05-balanced-approved');
    });
    await group('4. Custom fleet add/edit, group assignment and removal', async () => {
      await page.getByRole('button', { name: 'Изменить задание', exact: true }).click();
      await page.getByRole('button', { name: '4. Ресурсы', exact: true }).click();
      await page.getByRole('combobox', { name: 'Добавить профиль', exact: true }).selectOption('Custom');
      await page.getByRole('button', { name: 'Добавить БВС', exact: true }).click();
      await page.getByText('Параметры БВС · Свой БВС', { exact: true }).click();
      const custom = page.locator('.mw-card').filter({ has: page.getByLabel('Название БВС', { exact: true }) }).last();
      await custom.getByLabel('Название БВС', { exact: true }).fill('QA Custom');
      await custom.getByLabel('Воздушная скорость, м/с', { exact: true }).fill('7.5');
      await custom.getByLabel('Ресурс полёта при 100% АКБ, мин', { exact: true }).fill('31');
      await page.getByRole('checkbox', { name: 'RGB · автоматический выбор совместимого БВС: QA Custom', exact: true }).check();
      await page.getByRole('checkbox', { name: 'RGB · автоматический выбор совместимого БВС: RGB-B · ближняя база', exact: true }).check();
      const changed = await exported('fleet-custom-group.mission.json');
      const vehicle = changed.scenario.vehicles.find((v) => v.name === 'QA Custom');
      assert('custom profile and group persisted', vehicle?.model === 'Custom' && vehicle.airspeedMps === 7.5 && vehicle.effectiveEnduranceMin === 31 && changed.jobs[0].assignedVehicleIds.length === 2 && changed.jobs[0].assignedVehicleIds.includes(vehicle.id));
      assert('fleet edit invalidates prior approval', await page.getByRole('button', { name: 'Начать симуляцию', exact: true }).isDisabled());
      await screenshot('06-custom-fleet-group');
      await page.getByRole('button', { name: 'Удалить БВС QA Custom', exact: true }).click();
      await page.getByRole('button', { name: 'Подтвердить удаление БВС', exact: true }).click();
      const removed = await exported('fleet-after-removal.mission.json');
      assert('remove cleans batteries and only its assignment', removed.scenario.vehicles.length === 3 && !removed.batteries.some((b) => b.vehicleId === vehicle.id) && JSON.stringify(removed.jobs[0].assignedVehicleIds) === JSON.stringify(['rgb-near']));
      await page.getByRole('button', { name: 'Назначать автоматически', exact: true }).click();
    });
    await group('5. Fleet import preview rejects collisions and applies valid bundle', async () => {
      await page.getByLabel('Файл профилей БВС', { exact: true }).setInputFiles(`${root}/public/planner/scenarios/automatic-tradeoff.fleet.json`);
      const preview = page.getByRole('region', { name: 'Предпросмотр импорта флота', exact: true });
      await preview.waitFor();
      assert('collision blocks full fleet import', await preview.getByRole('button', { name: 'Подтвердить добавление флота', exact: true }).isDisabled() && await preview.getByRole('alert').count() === 1);
      await screenshot('07-fleet-import-collision');
      await preview.getByRole('button', { name: 'Отмена импорта', exact: true }).click();
      await page.getByLabel('Файл профилей БВС', { exact: true }).setInputFiles(`${root}/public/planner/scenarios/mixed-fleet.fleet.json`);
      await preview.waitFor();
      assert('valid fleet preview does not mutate current fleet', (await page.getByText(/БВС 3\/10 · АКБ 9\/100/).count()) === 1);
      await preview.getByRole('button', { name: 'Подтвердить добавление флота', exact: true }).click();
      const imported = await exported('fleet-imported.mission.json');
      assert('valid fleet adds all profiles and batteries', imported.scenario.vehicles.length === 6 && imported.batteries.length === 27 && imported.scenario.vehicles.some((v) => v.id === 'ms-1') && imported.jobs[0].assignedVehicleIds.length === 0);
    });
    await group('6. Coordinate layer becomes explicit 40 m obstacle', async () => {
      await importMission('automatic-tradeoff');
      await page.getByLabel('Файл координатного слоя', { exact: true }).setInputFiles(`${root}/public/planner/scenarios/area-with-hole.area.geojson`);
      const preview = page.getByRole('dialog', { name: 'Импорт координатного слоя', exact: true });
      await preview.waitFor();
      await preview.getByRole('combobox', { name: 'Назначение', exact: true }).selectOption('obstacle');
      await preview.getByLabel('Верхняя высота препятствий, м', { exact: true }).fill('40');
      assert('height import retains interior ring', (await preview.innerText()).includes('2 контуров'));
      await screenshot('08-obstacle-height-preview');
      await preview.getByRole('button', { name: 'Применить весь слой', exact: true }).click();
      const document = await exported('height-obstacle.mission.json');
      assert('height and hole exported without flattening', document.restrictions.length === 1 && document.restrictions[0].kind === 'obstacle' && document.restrictions[0].minAltitudeM === 0 && document.restrictions[0].maxAltitudeM === 40 && document.restrictions[0].geometry.coordinates.length === 2 && document.scenario.exclusions.length === 0);
    });
    await group('7. Import 4D volumes, exact interval/height and actual calculation', async () => {
      await page.getByLabel('Файл объёмных ограничений', { exact: true }).setInputFiles(`${root}/public/planner/scenarios/timed-airspace.restrictions.json`);
      const preview = page.getByRole('dialog', { name: 'Слои карты и объёмные ограничения', exact: true });
      await preview.waitFor();
      assert('4D preview displays declared height/time', (await preview.innerText()).includes('200') && (await preview.innerText()).includes('09:15'));
      await preview.getByRole('button', { name: 'Добавить проверенные объёмы', exact: true }).click();
      const { input, result } = await calculate('height-and-4d');
      const zone = input.restrictions.find((r) => r.id === 'temporary-zone');
      assert('API receives exact interval and both volumes', input.restrictions.length === 2 && zone.maxAltitudeM === 200 && zone.startAt === '2026-06-15T09:00:00Z' && zone.endAt === '2026-06-15T09:15:00.000Z');
      assert('overflight plus temporary zone remains feasible', result.candidates.every((c) => c.status === 'feasible_model' && !c.checks.some((check) => check.status === 'fail')));
      await download(page.getByRole('button', { name: 'Доказательства', exact: true }), 'height-and-4d.evidence.json');
      await screenshot('09-volumes-calculated');
    });
    await group('8. Weather cloud ceiling blocks confirmation through actual API', async () => {
      await importMission('automatic-tradeoff');
      await page.getByRole('button', { name: '5. Правила', exact: true }).click();
      await page.getByText('Облачность и видимость', { exact: true }).click();
      await page.getByLabel('Нижняя граница облаков, м', { exact: true }).fill('80');
      const { input, result } = await calculate('cloud-ceiling-rejection');
      assert('weather value reaches API', input.environment.cloudBaseM === 80 && input.environment.cloudClearanceM === 50);
      assert('cloud fail is not promoted', result.candidates.every((c) => c.status !== 'feasible_model' && c.checks.some((check) => check.id === 'CLOUD_CEILING' && check.status === 'fail')) && !result.recommendation);
      assert('cloud rejection disables approval', await page.getByRole('button', { name: 'Проверить и подтвердить', exact: true }).isDisabled());
      await screenshot('10-cloud-rejected');
    });
    await group('9. Explicit weather disable recovers a feasible model', async () => {
      await page.getByRole('button', { name: 'Изменить задание', exact: true }).click();
      await page.getByRole('button', { name: '5. Правила', exact: true }).click();
      await page.getByText('Облачность и видимость', { exact: true }).click();
      await page.getByRole('checkbox', { name: 'Учитывать облачность и видимость', exact: true }).uncheck();
      const { input, result } = await calculate('weather-disabled-recovery');
      assert('disable removes optional weather constraints', !('environment' in input));
      assert('recovery confirmed by actual solver', result.candidates.every((c) => c.status === 'feasible_model') && !!result.recommendation && await page.getByRole('button', { name: 'Проверить и подтвердить', exact: true }).isEnabled());
      await screenshot('11-weather-disabled-recovery');
    });
    await group('10. Desktop/mobile layout and mobile dialog', async () => {
      const desktop = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert('desktop no horizontal overflow', desktop.scrollWidth <= desktop.width, JSON.stringify(desktop));
      await page.setViewportSize({ width: 390, height: 844 });
      const mobile = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert('mobile no horizontal overflow', mobile.scrollWidth <= mobile.width, JSON.stringify(mobile));
      await screenshot('12-mobile-workbench');
      await page.getByRole('button', { name: 'Паспорт миссии', exact: true }).click();
      const passport = page.getByRole('dialog', { name: 'Паспорт миссии', exact: true });
      const box = await passport.boundingBox();
      assert('mobile passport fits centered', !!box && box.width <= 390 && Math.abs(box.x + box.width / 2 - 195) < 2 && Math.abs(box.y + box.height / 2 - 422) < 2, JSON.stringify(box));
      await screenshot('13-mobile-passport');
      await close();
      await page.setViewportSize({ width: 1440, height: 960 });
      assert('zero page errors', pageErrors.length === 0, JSON.stringify(pageErrors));
    });
    await group('11. Oversized geometry merge is rejected atomically', async () => {
      await page.getByLabel('Файл задания миссии', { exact: true }).setInputFiles(`${out}/overflow-base.mission.json`);
      const missionPreview = page.getByRole('dialog', { name: 'Проверка перед загрузкой', exact: true });
      await missionPreview.waitFor();
      await missionPreview.getByRole('button', { name: 'Заменить текущее задание', exact: true }).click();
      await missionPreview.waitFor({ state: 'hidden' });
      const before = await exported('overflow-before.mission.json');
      await page.getByLabel('Файл координатного слоя', { exact: true }).setInputFiles(`${out}/overflow-areas.geojson`);
      const geometry = page.getByRole('dialog', { name: 'Импорт координатного слоя', exact: true });
      await geometry.waitFor();
      await geometry.getByRole('combobox', { name: 'Назначение', exact: true }).selectOption('area');
      await geometry.getByRole('button', { name: 'Применить весь слой', exact: true }).click();
      await geometry.getByRole('alert').waitFor();
      assert('oversized merge leaves dialog open with limit error', await geometry.isVisible() && (await geometry.innerText()).includes('200 КиБ'));
      await screenshot('14-oversized-merge-rejected');
      await close();
      const after = await exported('overflow-after.mission.json');
      assert('oversized merge preserves complete original input', JSON.stringify(stable(before)) === JSON.stringify(stable(after)));
      assert('zero page errors after all groups', pageErrors.length === 0, JSON.stringify(pageErrors));
    });
  } catch (error) {
    failure = error.message;
    if (groups.at(-1)?.status === 'running') groups.at(-1).status = 'fail';
    await screenshot('failure');
  } finally {
    page.off('pageerror', onError);
    page.off('dialog', onDialog);
  }
  return { checkedAt: new Date().toISOString(), base, session: 'showcase-features-030', status: failure ? 'fail' : 'pass', health, groups, checks, failure, pageErrors, downloads, solves, limitations: ['Synthetic model-only examples; no real flight or physical wear proof.', 'Sequential functional UI checks, not stress/runtime stability certification.', 'Only this QA browser library was changed; the original/copy records are retained.'] };
}
