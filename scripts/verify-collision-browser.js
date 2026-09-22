async (page) => {
  const kind = /safety-case=(wind|crash)/.exec(page.url())?.[1] || 'obstacle';
  const out = `output/playwright/collision-safety/${kind}`;
  const checks = [], errors = [];
  const check = (name, pass, detail = '') => { checks.push({ name, pass: !!pass, detail }); if (!pass) throw Error(`${name}: ${detail}`); };
  const shot = async (name) => { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `${out}/${name}.png` }); };
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => void d.accept());
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('input[type=file][accept=".json,.yaml,.yml"]').setInputFiles('public/planner/scenarios/area-with-hole.mission.json');
    await page.getByRole('button', { name: 'Заменить текущее задание', exact: true }).click();
    const pending = page.waitForResponse(r => r.url().endsWith('/api/planner/missions/solve') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Рассчитать варианты', exact: true }).click();
    const response = await pending, result = await response.json();
    check('new safety policy active in actual API response', response.ok() && result.document.planning.safetyPolicy === 'continuous-occupancy-v1');
    check('positive scenario fully validated', result.candidates[0].status === 'feasible_model' && result.candidates[0].checks.every(c => c.status !== 'fail'));
    check('ground occupancy checked', result.candidates[0].checks.some(c => c.id === 'GROUND_SEPARATION' && c.status === 'pass'));
    await page.locator('.mission-map[data-map-ready=true]').waitFor();
    await page.getByRole('button', { name: 'Проверить и подтвердить', exact: true }).click();
    await page.getByRole('dialog').getByRole('checkbox').check();
    await page.getByRole('dialog').getByRole('button', { name: /Подтвердить/ }).click();
    await page.getByRole('button', { name: 'К выполнению', exact: true }).click();
    await page.getByRole('combobox', { name: 'Скорость симуляции' }).selectOption('100');
    await page.locator('.mw-playback').getByRole('button', { name: 'Начать симуляцию', exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.mw-flight-card small')].some(el => el.textContent === 'Работа сенсора'));
    await page.getByRole('combobox', { name: 'Скорость симуляции' }).selectOption('1');
    check('aircraft animation visible', await page.locator('.mw-drone-button.moving').count() > 0);
    const box = await page.locator('.mission-map-canvas').boundingBox();
    check('map visible near top during execution', box && box.width > 300 && box.height > 200 && box.y < 400, JSON.stringify(box));
    await shot('in-flight');
    await page.locator('.mw-safety-console summary').first().click();
    await page.getByRole('combobox', { name: 'Событие', exact: true }).selectOption(kind);
    if (kind === 'wind') await page.getByRole('spinbutton', { name: 'Ветер события' }).fill('30');
    await page.getByRole('button', { name: 'Внести событие', exact: true }).click();
    await page.locator('.mw-safety-heading').waitFor();
    check('ordinary toast cannot obscure an incident', !await page.locator('.mw-toast').isVisible());
    check('incident locks original playback', !await page.locator('.mw-playback-controls').isVisible());
    await shot('incident');
    if (kind === 'obstacle') {
      check('obstacle offers a checked return', await page.getByRole('button', { name: /Вернуться на свои базы/ }).isEnabled());
      await page.getByRole('button', { name: /Вернуться на свои базы/ }).click();
      await page.getByRole('button', { name: 'Пауза возврата', exact: true }).click();
      await page.getByRole('button', { name: 'Продолжить возврат', exact: true }).waitFor();
      check('manual pause stops checked recovery without auto-start', await page.getByRole('button', { name: 'Пауза возврата', exact: true }).count() === 0);
      await page.getByRole('combobox', { name: 'Скорость возврата', exact: true }).selectOption('300');
      await page.getByRole('button', { name: 'Продолжить возврат', exact: true }).click();
      await page.getByRole('button', { name: 'Закрыть выполнение', exact: true }).waitFor({ timeout: 20000 });
      check('checked return reaches landing', (await page.locator('.mw-safety-heading').innerText()).includes('Возврат завершён'));
      await shot('landed');
      await page.getByRole('button', { name: 'Закрыть выполнение', exact: true }).click();
      await page.getByRole('tab', { name: /^Миссии/ }).click();
      await page.locator('.mo-stats button[data-status=cancelled]').click();
      await page.locator('.mo-list').getByText('Остановлено', { exact: true }).waitFor();
      check('interrupted mission is not falsely completed', (await page.locator('.mo-list').innerText()).includes('Остановлено'));
    } else {
      const title = await page.locator('.mw-safety-heading').innerText();
      check('unsafe return blocked', kind === 'wind' ? title.includes('Возврат не подтверждён') : title.includes('Аппарат выведен'), title);
      check('no fake return option', await page.getByRole('button', { name: /Вернуться на свои базы/ }).count() === 0);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    check('no horizontal overflow on mobile', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await shot('mobile');
    check('no unhandled browser errors', errors.length === 0, errors.join('\n'));
  } catch (e) { checks.push({ name: 'fatal', pass: false, detail: String(e) }); await shot('failure'); }
  const report = { at: new Date().toISOString(), kind, browser: await page.evaluate(() => navigator.userAgent), checks, errors };
  page.__collisionReport = report;
  const reportDownload = page.waitForEvent('download');
  await page.evaluate((value) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'browser-report.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, report);
  await (await reportDownload).saveAs(`${out}/browser-report.json`);
  return report;
}
