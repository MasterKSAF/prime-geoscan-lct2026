// Run only in a separate playwright-cli session, e.g. fleet-models.
// UI interactions and downloads only: no mocked APIs, storage writes or React state changes.
async (page) => {
  const out = 'output/playwright/fleet-models';
  const checks = [], errors = [], downloads = [];
  const check = (name, pass, detail = '') => {
    checks.push({ name, pass: !!pass, detail });
    if (!pass) throw Error(`${name}: ${detail}`);
  };
  const nav = (name) => page.getByRole('tablist', { name: 'Разделы стенда' }).getByRole('tab', { name, exact: true });
  const editor = page.locator('.mw-simple-editor');
  const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
  const download = async (name, action) => {
    const pending = page.waitForEvent('download');
    await action();
    const file = await pending;
    await file.saveAs(`${out}/${name}`);
    check(`download ${name}`, (await file.failure()) === null);
    let text = '';
    for await (const chunk of await file.createReadStream()) text += chunk.toString();
    downloads.push({ name, path: `${out}/${name}` });
    return JSON.parse(text);
  };
  const exportMission = async (name) => {
    await page.getByRole('button', { name: 'Действия с этой миссией', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const value = await download(name, () => dialog.getByRole('button', { name: 'Скачать задание JSON', exact: true }).click());
    await dialog.getByRole('button', { name: 'Закрыть окно', exact: true }).click();
    return value;
  };
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { if (dialog.type() === 'beforeunload') void dialog.accept(); });
  let original = null, changed = null;
  try {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto('http://127.0.0.1:3016/planner?v=fleet-models-check', { waitUntil: 'domcontentloaded' });
    await nav('Миссии').waitFor();
    await page.getByLabel('Файл задания миссии', { exact: true }).setInputFiles('public/planner/scenarios/demo-01-survey.mission.json');
    await page.getByRole('button', { name: 'Заменить текущее задание', exact: true }).click();
    check('import enters editor without launching', await nav('Редактор').getAttribute('aria-selected') === 'true');
    original = await exportMission('before.mission.json');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await editor.getByRole('button', { name: 'Парк', exact: true }).click();
    await editor.locator('summary').filter({ hasText: /^Добавить БВС · Gemini, 801, 201/ }).click();
    const catalog = editor.getByRole('region', { name: 'Каталог моделей из ТЗ', exact: true });
    check('catalogue is visible in the editor', await catalog.isVisible());
    for (const name of ['Геоскан Gemini', 'Геоскан 801', 'Геоскан 201']) {
      check(`${name}: one obvious add button`, await catalog.getByRole('button', { name: `Добавить ${name}`, exact: true }).count() === 1 && await catalog.getByRole('button', { name: `Добавить ${name}`, exact: true }).isEnabled());
    }
    const originalFleet = await download('before.fleet.json', () => editor.getByRole('button', { name: 'Экспорт флота', exact: true }).click());
    check('opening catalogue did not insert aircraft', same(originalFleet.vehicles, original.scenario.vehicles) && same(originalFleet.batteries, original.batteries));
    await catalog.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/01-catalog.png`, fullPage: true });

    await catalog.getByRole('button', { name: 'Добавить Геоскан 201', exact: true }).click();
    const addedToast = page.locator('.mw-notification-card').filter({ hasText: 'Геоскан 201 добавлен в задание.' });
    await addedToast.waitFor({ state: 'visible' });
    const toastBox = await addedToast.boundingBox();
    check('fleet notification is a compact card at the upper right', toastBox && toastBox.width <= 400 && toastBox.x >= 1000 && toastBox.y < 400, JSON.stringify(toastBox));
    await addedToast.getByRole('button', { name: 'Закрыть уведомление: Миссия', exact: true }).click();
    check('fleet notification closes without blocking the editor', await addedToast.count() === 0 && await catalog.getByRole('button', { name: 'Добавить Геоскан 801', exact: true }).isEnabled());
    const withWing = await download('with-201.fleet.json', () => editor.getByRole('button', { name: 'Экспорт флота', exact: true }).click());
    const wing = withWing.vehicles.at(-1);
    check('new 201 is enabled with the complete moving-flight profile', wing.model === '201' && wing.kind === 'fixedWing' && wing.enabled === true && wing.fixedWingProfile?.version === 'geoscan201-dubins-v1' && wing.fixedWingProfile.parachuteReleaseAltitudeM === 70 && wing.maxAirspeedMps >= wing.airspeedMps);
    check('new 201 needs no hidden second activation', await editor.getByRole('button', { name: 'Применить расчётный профиль 201', exact: true }).count() === 0);
    check('new 201 does not retain obsolete unsupported assumptions', !wing.assumptions.some(text => /Отключён|не реализован/.test(text)));
    check('new 201 has one current battery without predicted recharge', withWing.batteries.filter(battery => battery.vehicleId === wing.id).length === 1 && withWing.batteries.find(battery => battery.vehicleId === wing.id).rechargeSec === null);
    check('adding 201 did not change existing aircraft or batteries', originalFleet.vehicles.every(vehicle => same(withWing.vehicles.find(item => item.id === vehicle.id), vehicle)) && originalFleet.batteries.every(battery => same(withWing.batteries.find(item => item.id === battery.id), battery)));

    const wingSummary = editor.locator('summary').filter({ hasText: /^Параметры БВС · Геоскан 201/ });
    await wingSummary.click();
    const wingCard = editor.locator('.mw-card').filter({ has: page.locator('summary').filter({ hasText: /^Параметры БВС · Геоскан 201/ }) }).last();
    check('201 parameters report the connected model', /Самолётная модель\s*· подключена/.test(await wingCard.innerText()));
    await wingCard.getByLabel('Название БВС', { exact: true }).fill('QA · самолёт');
    check('renamed aircraft still exposes its manufacturer model', (await editor.getByRole('list', { name: 'БВС для расчёта', exact: true }).innerText()).includes('Геоскан 201'));
    await wingCard.locator('summary').filter({ hasText: /^Параметры БВС/ }).click();

    await catalog.getByRole('button', { name: 'Добавить Геоскан 801', exact: true }).click();
    await catalog.getByRole('button', { name: 'Добавить Геоскан Gemini', exact: true }).click();
    const after = await download('all-models.fleet.json', () => editor.getByRole('button', { name: 'Экспорт флота', exact: true }).click());
    check('dismissed notification is not resurrected by subsequent fleet edits', await addedToast.count() === 0);
    check('all three manufacturer models are in the mission fleet', ['201', '801', 'Gemini'].every(model => after.vehicles.some(vehicle => vehicle.model === model && vehicle.enabled)));
    check('801 has documented RGB and thermal jobs only', same(after.vehicles.find(vehicle => vehicle.model === '801').jobs, ['RGB', 'IR']));
    check('default Gemini adds only the selected RGB camera configuration', same(after.vehicles.find(vehicle => vehicle.model === 'Gemini').jobs, ['RGB']));
    check('adding profiles does not manufacture LiDAR or geophysics support', after.vehicles.filter(vehicle => vehicle.model !== 'Custom').every(vehicle => !vehicle.jobs.includes('LiDAR') && !vehicle.jobs.includes('Geophysics')));
    check('all aircraft and battery identifiers remain unique', new Set(after.vehicles.map(vehicle => vehicle.id)).size === after.vehicles.length && new Set(after.batteries.map(battery => battery.id)).size === after.batteries.length);
    const listText = await editor.getByRole('list', { name: 'БВС для расчёта', exact: true }).innerText();
    check('editor overview names all models', ['Геоскан Gemini', 'Геоскан 801', 'Геоскан 201'].every(model => listText.includes(model)));
    await editor.getByRole('list', { name: 'БВС для расчёта', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/02-all-models.png`, fullPage: true });
    changed = await exportMission('after.mission.json');
    check('adding aircraft preserved original work, area, rules and time window', same(changed.jobs, original.jobs) && same(changed.window, original.window) && same(changed.restrictions, original.restrictions) && same(changed.scenario.airspace, original.scenario.airspace) && same(changed.scenario.area, original.scenario.area));
    check('UI rename changed only new aircraft stored name, not original records', changed.scenario.vehicles.find(vehicle => vehicle.id === wing.id).name === 'QA · самолёт' && original.scenario.vehicles.every(vehicle => same(changed.scenario.vehicles.find(item => item.id === vehicle.id), vehicle)));

    await page.getByRole('button', { name: 'Настройки и справка', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Состояние парка', exact: true }).click();
    const fleetDialog = page.getByRole('dialog', { name: 'Парк БВС', exact: true });
    await fleetDialog.getByRole('button', { name: 'Модели и состав задания', exact: true }).click();
    check('shared fleet dialog also offers all three models', await fleetDialog.getByRole('button', { name: /^Добавить Геоскан (Gemini|801|201)$/ }).count() === 3);
    await fleetDialog.getByRole('button', { name: 'Текущее состояние', exact: true }).click();
    check('state panel distinguishes aircraft model from operator name', (await fleetDialog.locator('.mw-fleet-state-list').innerText()).includes('Геоскан 201 · QA · самолёт'));
    check('catalogue edits did not register fake live telemetry', await fleetDialog.locator('.mw-fleet-state-list').getByText('Начальный профиль', { exact: false }).count() === after.vehicles.length);
    await page.screenshot({ path: `${out}/03-fleet-state.png`, fullPage: true });
    await fleetDialog.getByRole('button', { name: 'Закрыть окно', exact: true }).click();

    // Reload the previously saved original through the UI. Unsaved additions must
    // not have silently rewritten it in the local library.
    await nav('Миссии').click();
    const home = page.getByRole('region', { name: 'Задания и выполнения' });
    await home.getByRole('tab', { name: /^Задания/ }).click();
    await home.getByRole('button', { name: 'Открыть задание', exact: true }).click();
    await page.getByRole('button', { name: 'Заменить текущее задание', exact: true }).click();
    const reloaded = await exportMission('saved-original-reloaded.mission.json');
    check('saved original mission was not silently overwritten', same(reloaded, original));
    check('no unhandled browser errors', errors.length === 0, errors.join('\n'));
  } catch (error) {
    checks.push({ name: 'fatal', pass: false, detail: String(error) });
    await page.screenshot({ path: `${out}/failure.png`, fullPage: true });
  }
  const report = { at: new Date().toISOString(), modelOnly: true, checks, errors, downloads, status: checks.every(item => item.pass) ? 'pass' : 'fail' };
  await download('browser-report.json', () => page.evaluate(value => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'browser-report.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, report));
  return report;
}
