/* eslint-disable no-unused-expressions -- Playwright CLI callback, not application code. */
async (page) => {
  const checks = [], errors = [], results = [];
  const prefix = page.url().includes(':3016/') ? 'release038-prod' : 'release038';
  const check = (name, pass, detail) => {
    checks.push({ name, pass: !!pass, detail });
    if (!pass) throw Error(name);
  };
  page.on('pageerror', e => errors.push(e.message));
  const nav = name => page.getByRole('tablist', { name: 'Разделы стенда' }).getByRole('tab', { name, exact: true });
  const save = async (button, file) => {
    const pending = page.waitForEvent('download', { timeout: 60000 });
    await button.click({ timeout: 60000 });
    await (await pending).saveAs(`output/playwright/${prefix}-${file}`);
    check(`Download ${file}`, true);
  };
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(page.url());
    await page.getByRole('region', { name: 'Три сценария проверки' }).waitFor();
    for (let i = 0; i < 3; i++) {
      await nav('Миссии').click();
      await page.getByRole('region', { name: 'Три сценария проверки' }).getByRole('button', { name: 'Редактировать', exact: true }).nth(i).click();
      const preview = page.getByRole('dialog', { name: 'Проверка перед загрузкой' });
      check(`Demo ${i + 1}: compact preview`, await preview.locator('.mw-modal-body').evaluate(e => e.scrollHeight <= e.clientHeight + 1));
      check(`Demo ${i + 1}: no raw JSON panel`, !(await preview.innerText()).includes('Полное содержимое файла'));
      await preview.locator('summary').filter({ hasText: 'Скачать миссию' }).click();
      await save(preview.getByRole('button', { name: /JSON/ }), `demo${i + 1}.mission.json`);
      if (i === 0) await save(preview.getByRole('button', { name: /HTML/ }), 'demo1.mission.html');
      await page.screenshot({ path: `output/playwright/${prefix}-preview-${i + 1}.png` });
      await preview.getByRole('button', { name: 'Открыть в редакторе', exact: true }).click();
      const pending = page.waitForResponse(r => r.url().includes('/missions/solve') && r.request().method() === 'POST', { timeout: 60000 });
      await page.getByRole('button', { name: 'Рассчитать варианты', exact: true }).click();
      const response = await pending, result = await response.json();
      results.push({ demo: i + 1, http: response.status(), engine: result.engineVersion, candidates: result.candidates?.map(c => ({ objective: c.objective, status: c.status, metrics: c.metrics })) });
      check(`Demo ${i + 1}: current engine`, response.ok() && result.engineVersion === '0.3.8', results.at(-1));
      const approve = page.getByRole('button', { name: 'Проверить и подтвердить', exact: true });
      await approve.waitFor();
      check(`Demo ${i + 1}: correct feasibility`, result.candidates.every(c => i < 2 ? c.status === 'feasible_model' : c.status !== 'feasible_model'));
      if (i === 2) {
        check('Rejected plan cannot launch', await approve.isDisabled());
        await page.screenshot({ path: `output/playwright/${prefix}-demo3-rejected.png` });
        await nav('Отчёт').click();
        const row = page.locator('.demo-reports tbody tr').nth(i);
        await save(row.getByRole('button', { name: /^Скачать доказательства:/ }), 'demo3-diagnostic.zip');
        continue;
      }
      await approve.click();
      await page.getByRole('dialog', { name: 'Подтвердить модельный план' }).getByRole('checkbox').check();
      await page.getByRole('button', { name: 'Подтвердить для симуляции', exact: true }).click();
      await page.getByRole('button', { name: 'К выполнению', exact: true }).click();
      check(`Demo ${i + 1}: status help visible`, await page.getByRole('button', { name: 'Пояснение: Выполнение симуляции', exact: true }).isVisible());
      const alignment = await page.evaluate(() => ({ launch: document.querySelector('.mw-playback-controls > .primary').getBoundingClientRect().y, speed: document.querySelector('.playback-rate').getBoundingClientRect().y }));
      check(`Demo ${i + 1}: speed beside launch`, Math.abs(alignment.launch - alignment.speed) < 14, alignment);
      check(`Demo ${i + 1}: summary has no aircraft cards`, await page.locator('.mw-flight-panel:visible').count() === 0 && await page.locator('.mw-sidebar-schedule:visible').count() === 0);
      await page.getByRole('combobox', { name: 'Скорость симуляции', exact: true }).selectOption('100');
      await page.getByRole('button', { name: 'Выполнить миссию', exact: true }).click();
      await page.getByRole('button', { name: 'Пауза', exact: true }).waitFor({ timeout: 60000 });
      const initial = await page.locator('.mw-drone-marker').first().getAttribute('style');
      await page.waitForFunction(style => document.querySelector('.mw-drone-marker')?.getAttribute('style') !== style, initial, { timeout: 15000 });
      const motion = await page.evaluate(async () => {
        const node = document.querySelector('.mw-drone-marker'), canvas = document.querySelector('.leaflet-overlay-pane canvas');
        let updates = 0;
        const observer = new MutationObserver(rows => { updates += rows.filter(r => r.type === 'attributes' && r.attributeName === 'style').length; });
        observer.observe(node, { attributes: true, attributeFilter: ['style'] });
        await new Promise(resolve => setTimeout(resolve, 1000));
        observer.disconnect();
        return { updates, sameMarker: node === document.querySelector('.mw-drone-marker'), sameCanvas: canvas === document.querySelector('.leaflet-overlay-pane canvas') };
      });
      check(`Demo ${i + 1}: continuous marker frames`, motion.updates > 12 && motion.sameMarker && motion.sameCanvas, motion);
      await page.screenshot({ path: `output/playwright/${prefix}-running-${i + 1}.png` });
      await page.getByRole('region', { name: 'Модельная симуляция' }).getByText('Миссия завершена', { exact: true }).waitFor({ timeout: 60000 });
      check(`Demo ${i + 1}: completed with visible info`, await page.getByRole('button', { name: 'Пояснение: Выполнение симуляции', exact: true }).isVisible());
      await save(page.getByRole('button', { name: 'Скачать миссию', exact: true }), `demo${i + 1}-run.mission.json`);
      await page.getByRole('button', { name: 'БВС', exact: true }).click();
      check(`Demo ${i + 1}: aircraft and schedule in UAV tab`, await page.locator('.mw-flight-panel:visible').count() > 0 && await page.locator('.mw-sidebar-schedule:visible').count() > 0);
      await page.screenshot({ path: `output/playwright/${prefix}-vehicles-${i + 1}.png` });
      await page.getByRole('button', { name: 'Сводка', exact: true }).click();
      await page.getByRole('button', { name: 'Отчёт миссии', exact: true }).click();
      check('Report navigation', await nav('Отчёт').getAttribute('aria-selected') === 'true');
      const row = page.locator('.demo-reports tbody tr').nth(i);
      check(`Demo ${i + 1}: completed report 100%`, (await row.innerText()).includes('100%'));
      await save(row.getByRole('button', { name: /^Скачать доказательства:/ }), `demo${i + 1}.evidence.zip`);
      await save(row.getByRole('button', { name: /^Скачать проверки плана:/ }), `demo${i + 1}.checks.json`);
      await save(row.getByRole('button', { name: /^Скачать видео MP4:/ }), `demo${i + 1}.mp4`);
    }
    check('No browser JS errors', errors.length === 0, errors);
  } catch (e) {
    checks.push({ name: 'Unexpected', pass: false, detail: String(e) });
    await page.screenshot({ path: `output/playwright/${prefix}-error.png` });
  }
  return { checkedAt: new Date().toISOString(), checks, errors, results };
}
