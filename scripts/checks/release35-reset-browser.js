/* eslint-disable no-unused-expressions -- Playwright CLI regression callback. */
async (page) => {
  const checks = [], errors = [];
  const check = (name, pass, detail) => {
    checks.push({ name, pass: !!pass, detail });
    if (!pass) throw Error(name + ': ' + (detail ?? ''));
  };
  page.on('pageerror', (e) => errors.push(e.message));
  const nav = (name) => page.getByRole('tablist', { name: 'Разделы стенда' }).getByRole('tab', { name, exact: true });
  const open = async (id) => {
    await nav('Миссии').click();
    await page.locator(`[data-scenario-id="${id}"]`).getByRole('button', { name: 'Редактировать', exact: true }).click();
    await page.getByRole('button', { name: 'Открыть в редакторе', exact: true }).click();
  };
  const response = () => page.waitForResponse((r) => /\/missions\/solve(?:-with-obstacles)?$/.test(r.url()) && r.request().method() === 'POST', { timeout: 60000 });
  const solve = async () => {
    const pending = response();
    await page.getByRole('button', { name: 'Рассчитать варианты', exact: true }).click();
    const r = await pending;
    check('HTTP расчёта исправления 200', r.status() === 200);
    await page.getByRole('heading', { name: 'Выберите подходящий план' }).waitFor();
    return r.json();
  };
  const reset = async () => {
    await page.getByRole('button', { name: 'Настройки и справка', exact: true }).click();
    await page.evaluate(() => { window.confirm = () => true; });
    await page.getByRole('button', { name: 'Начать с нуля', exact: true }).click();
    await page.locator('.demo-mission-cards article').first().waitFor();
  };
  try {
    await reset();
    await open('demo-01-survey');
    await page.getByRole('button', { name: 'Виды работ', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Мультиспектр', exact: true }).check();
    await page.getByRole('button', { name: 'Готово', exact: true }).click();
    await nav('Парк БВС').click();
    await page.getByRole('row').filter({ has: page.getByRole('heading', { name: 'Геоскан Gemini', exact: true }) }).getByRole('button', { name: 'Доступность', exact: true }).click();
    for (const id of ['north-gemini-ms-1', 'north-gemini-ms-2']) {
      await page.getByRole('checkbox', { name: `Доступен: ${id}`, exact: true }).click();
      await page.waitForFunction((key) => { const e = document.querySelector(`input[aria-label="Доступен: ${key}"]`); return e && !e.disabled && !e.checked; }, id);
    }
    await page.getByRole('button', { name: 'Закрыть парк', exact: true }).click();
    await nav('Редактор').click();
    const blocked = await solve();
    check('Выключенные Pollux действительно исключены', blocked.candidates.every((c) => c.status !== 'feasible_model'));
    await page.getByRole('button', { name: 'Все проверки', exact: true }).click();
    check('Отказ объясняет как активировать подходящие аппараты', (await page.locator('.mission-failure-advice').innerText()).includes('Парк БВС → Доступность'));
    check('Отказ подсвечен и детали видны сразу', await page.locator('.mission-failures.has-failures').isVisible() && await page.locator('.mission-failure-detail:visible').count() > 0);
    const activate = page.locator('.mi-cards > article').filter({ has: page.getByRole('heading', { name: 'Активировать подходящие БВС', exact: true }) });
    const pending = response();
    await activate.getByRole('button', { name: 'Проверить вариант', exact: true }).click();
    const repaired = await (await pending).json();
    check('Вариант включения даёт полный проверенный план', repaired.candidates.every((c) => c.status === 'feasible_model'));
    await activate.getByRole('button', { name: 'Открыть исправленную миссию', exact: true }).click();
    await page.getByRole('button', { name: 'Открыть в редакторе', exact: true }).click();
    const applied = await solve();
    check('Исправление действительно применяется в следующем расчёте', applied.candidates.every((c) => c.status === 'feasible_model') && applied.document.scenario.vehicles.filter((v) => v.jobs.includes('MS')).every((v) => v.enabled));
    await page.getByRole('button', { name: 'Проверить и подтвердить', exact: true }).click();
    await page.getByRole('dialog', { name: 'Подтвердить модельный план' }).getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Подтвердить для симуляции', exact: true }).click();
    await page.getByRole('button', { name: 'К выполнению', exact: true }).click();
    await page.getByRole('combobox', { name: 'Скорость симуляции', exact: true }).selectOption('1');
    await page.getByRole('button', { name: 'Выполнить миссию', exact: true }).click();
    await page.getByRole('button', { name: 'Пауза', exact: true }).waitFor();
    check('Миссия действительно запущена перед сбросом', true);
    const oldDb = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).filter((n) => n.startsWith('prime-demo-session-')));
    await reset();
    check('Сброс работающей миссии возвращает три чистые карточки', await page.locator('.demo-mission-cards article').count() === 3 && await nav('Выполнение').isDisabled());
    await page.waitForFunction(async (oldNames) => !(await indexedDB.databases()).some((d) => oldNames.includes(d.name)), oldDb, { timeout: 15000 });
    check('Старая база с журналом сессии действительно удалена', true);
    await nav('Отчёт').click();
    check('После сброса нет расчётов, журналов и видео', await page.locator('.demo-reports tbody').getByText('Нет расчёта', { exact: true }).count() === 3 && await page.locator('.demo-reports tbody button:enabled').count() === 0);
    await open('demo-03-repair');
    await solve();
    await page.getByRole('button', { name: 'Все проверки', exact: true }).click();
    check('Третьей миссии предложен автовыбор вместо заряда 26%', (await page.locator('.mission-failure-advice').innerText()).includes('26%'));
    const auto = page.locator('.mi-cards > article').filter({ has: page.getByRole('heading', { name: 'Проверить автовыбор', exact: true }) });
    const autoResponse = response();
    await auto.getByRole('button', { name: 'Проверить вариант', exact: true }).click();
    const autoResult = await (await autoResponse).json();
    check('Автовыбор устраняет отказ третьей миссии без подмены заряда', autoResult.candidates.every((c) => c.status === 'feasible_model') && autoResult.document.scenario.vehicles.find((v) => v.id === 'demo-07').batteryPct === 26);
    const battery = page.locator('.mi-cards > article').filter({ has: page.getByRole('heading', { name: /^Заменить батарею:/ }) }).first();
    const batteryResponse = response();
    await battery.getByRole('button', { name: 'Проверить вариант', exact: true }).click();
    const batteryResult = await (await batteryResponse).json();
    check('Модельная замена батареи тоже проверяется расчётом', batteryResult.candidates.every((c) => c.status === 'feasible_model'));
    await battery.getByRole('checkbox').check();
    await battery.getByRole('button', { name: 'Открыть исправленную миссию', exact: true }).click();
    await page.getByRole('button', { name: 'Открыть в редакторе', exact: true }).click();
    const final = await solve();
    check('Исправление сохраняет ID третьей миссии', final.document.id === 'demo-03-repair');
    check('Явно подтверждённая замена сохраняется при опросе модели', final.candidates.every((c) => c.status === 'feasible_model') && final.document.scenario.vehicles.find((v) => v.id === 'demo-07').batteryPct === 100);
    await page.getByRole('button', { name: 'Настройки и справка', exact: true }).click();
    await page.getByRole('combobox', { name: 'Тема интерфейса', exact: true }).selectOption('dark');
    await page.screenshot({ path: 'output/playwright/0.3.5-reset-settings-dark.png' });
    await page.getByRole('dialog', { name: 'Настройки и справка' }).getByRole('button', { name: 'Закрыть окно', exact: true }).click();
    await nav('Отчёт').click();
    await page.screenshot({ path: 'output/playwright/0.3.5-report-dark.png' });
    check('Ошибок браузера нет', errors.length === 0, errors);
  } catch (e) {
    checks.push({ name: 'Unexpected', pass: false, detail: String(e) });
    await page.screenshot({ path: 'output/playwright/0.3.5-reset-error.png' });
  }
  return { checks, errors };
}
