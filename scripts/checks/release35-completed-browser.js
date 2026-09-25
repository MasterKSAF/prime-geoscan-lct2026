/* eslint-disable no-unused-expressions -- Playwright CLI regression callback. */
async (page) => {
  const checks = [], errors = [];
  const check = (name, pass, detail) => { checks.push({ name, pass: !!pass, detail }); if (!pass) throw Error(name); };
  page.on('pageerror', (e) => errors.push(e.message));
  const nav = (name) => page.getByRole('tablist', { name: 'Разделы стенда' }).getByRole('tab', { name, exact: true });
  try {
    await nav('Миссии').click();
    await page.locator('[data-scenario-id="demo-02-expert-obstacles"]').getByRole('button', { name: 'Редактировать', exact: true }).click();
    await page.getByRole('button', { name: 'Открыть в редакторе', exact: true }).click();
    const pending = page.waitForResponse((r) => /\/missions\/solve-with-obstacles$/.test(r.url()) && r.request().method() === 'POST', { timeout: 60000 });
    await page.getByRole('button', { name: 'Рассчитать варианты', exact: true }).click();
    const response = await pending;
    const result = await response.json();
    check('Демо 2 в Docker: 0.3.5, оба плана допустимы', response.ok() && result.engineVersion === '0.3.5' && result.candidates.every((c) => c.status === 'feasible_model'));
    await page.getByRole('button', { name: /Меньше налёт Выбрать вариант/ }).click();
    await page.getByRole('button', { name: 'Проверить и подтвердить', exact: true }).click();
    await page.getByRole('dialog', { name: 'Подтвердить модельный план' }).getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Подтвердить для симуляции', exact: true }).click();
    await page.getByRole('button', { name: 'К выполнению', exact: true }).click();
    await page.getByRole('combobox', { name: 'Скорость симуляции', exact: true }).selectOption('100');
    await page.getByRole('button', { name: 'Выполнить миссию', exact: true }).click();
    await page.getByRole('region', { name: 'Модельная симуляция' }).getByText('Миссия завершена', { exact: true }).waitFor({ timeout: 60000 });
    check('Миссия с официальными препятствиями завершилась', true);
    await page.screenshot({ path: 'output/playwright/0.3.5-demo2-completed.png' });
    await nav('Отчёт').click();
    const row = page.locator('.demo-reports tbody tr').nth(1);
    check('Отчёт показывает завершение на 100%', (await row.innerText()).includes('100%'));
    for (const [name, file] of [
      ['Скачать доказательства:', 'output/playwright/0.3.5-demo2-evidence.zip'],
      ['Скачать проверки плана:', 'output/playwright/0.3.5-demo2-checks.json'],
      ['Скачать видео MP4:', 'output/playwright/0.3.5-demo2.mp4'],
    ]) {
      const download = page.waitForEvent('download', { timeout: 60000 });
      await row.getByRole('button', { name: new RegExp('^' + name) }).click({ timeout: 60000 });
      await (await download).saveAs(file);
      check('Скачано: ' + file, true);
    }
    await row.getByRole('button', { name: /^Все проверки:/ }).click();
    check('Завершённый запуск открывает свои проверки', await page.getByRole('heading', { name: 'Все обязательные проверки пройдены', exact: true }).isVisible());
    await page.screenshot({ path: 'output/playwright/0.3.5-demo2-completed-checks.png' });
    check('Браузер без ошибок', errors.length === 0, errors);
  } catch (e) {
    checks.push({ name: 'Unexpected', pass: false, detail: String(e) });
    await page.screenshot({ path: 'output/playwright/0.3.5-completed-error.png' });
  }
  return { checks, errors };
}
