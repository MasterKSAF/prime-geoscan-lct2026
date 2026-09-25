/* eslint-disable no-unused-expressions -- Playwright CLI callback. */
async (page) => {
  const checks = [], errors = [];
  const check = (name, pass) => { checks.push({name, pass: !!pass}); if (!pass) throw Error(name); };
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { window.confirm = () => true; });
  await page.setViewportSize({width: 1440, height: 900});
  const nav = name => page.getByRole('tablist', {name: 'Разделы стенда'}).getByRole('tab', {name, exact: true});
  const openAndSolve = async id => {
    await nav('Миссии').click();
    await page.locator(`[data-scenario-id="${id}"]`).getByRole('button', {name: 'Редактировать', exact: true}).click();
    await page.getByRole('button', {name: 'Открыть в редакторе', exact: true}).click();
    const pending = page.waitForResponse(r => /\/api\/planner\/missions\/solve(?:-with-obstacles)?$/.test(r.url()) && r.request().method() === 'POST', {timeout: 30000});
    await page.getByRole('button', {name: 'Рассчитать варианты', exact: true}).click();
    const response = await pending;
    check(id + ' — расчёт HTTP 200', response.status() === 200);
    await page.getByRole('heading', {name: 'Выберите подходящий план', exact: true}).waitFor();
    return response.json();
  };
  try {
    await page.locator('.demo-mission-cards article').first().waitFor();
    const failed = await openAndSolve('demo-03-repair');
    const verdict = page.getByRole('region', {name: 'Сводка проверок плана'}).filter({visible: true});
    check('отказ — короткий и понятный итог', (await verdict.innerText()).includes('Не удалось составить маршрут для всей территории') && (await verdict.innerText()).length < 220);
    check('дубли проверок удалены из редактора', await page.locator('.mw-inspector .mw-candidate-checks, .mw-inspector .ms-safety-chips, .mw-inspector .expert-unavailable').count() === 0);
    check('отказ по-прежнему запрещает запуск', await page.getByRole('button', {name: 'Проверить и подтвердить', exact: true}).isDisabled());
    await page.screenshot({path: 'output/playwright/plain-language-failed.png'});
    await verdict.getByRole('button', {name: 'Все проверки', exact: true}).click();
    const panel = page.getByRole('tabpanel', {name: 'Анализ', exact: true});
    await panel.getByRole('heading', {name: 'Анализ плана', exact: true}).waitFor();
    check('все заголовки анализа свернуты, включая исправления', await panel.locator('details[open]').count() === 0);
    check('весь исходный список проверок доступен в анализе', await panel.locator('.mi-check-group .mw-check').count() === failed.candidates[0].checks.length);
    await page.screenshot({path: 'output/playwright/plain-language-analysis.png'});
    await panel.locator('summary').filter({hasText: /^Все проверки$/}).click();
    await panel.locator('.mi-check-group > summary').filter({hasText: /^Съёмка/}).click();
    const technical = panel.locator('.mi-check-group[open] .mi-check-original').first();
    check('полные формулы не показываются сразу', (await technical.getAttribute('open')) === null);
    await technical.locator('summary').click();
    check('исходная причина и ID доступны по раскрытию', (await technical.innerText()).includes('STRIPS') && (await technical.innerText()).includes('Сверены идентификаторы'));
    await panel.locator('summary').filter({hasText: /^Что изменить, чтобы выполнить миссию/}).click();
    check('есть действия для исправления', await panel.getByRole('button', {name: 'Проверить вариант', exact: true}).count() > 0);
    await page.getByRole('tablist', {name: 'Разделы результатов'}).getByRole('tab', {name: 'Итог', exact: true}).click();
    const row = page.locator('.demo-reports tbody tr').nth(2);
    const pendingDownload = page.waitForEvent('download');
    await row.getByRole('button', {name: /^Скачать проверки плана:/}).click();
    await (await pendingDownload).saveAs('output/playwright/plain-language-checks.json');
    const good = await openAndSolve('demo-01-survey');
    check('успешный план без лишних пояснений', (await verdict.innerText()).includes('План готов к симуляции') && (await verdict.innerText()).length < 80);
    check('расчёт остался выполнимым', good.candidates.some(c => c.status === 'feasible_model'));
    await page.getByRole('button', {name: 'Проверить и подтвердить', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Подтвердить модельный план'});
    check('подтверждение без развёрнутых технических списков', await dialog.locator('.mw-check, details[open]').count() === 0);
    check('природа симуляции указана явно', (await dialog.innerText()).includes('Это не разрешение на реальный полёт'));
    await dialog.getByRole('button', {name: 'Все проверки', exact: true}).click();
    await panel.getByRole('heading', {name: 'Анализ плана', exact: true}).waitFor();
    check('ссылка работает из подтверждения, анализ снова свернут', await page.getByRole('dialog').count() === 0 && await panel.locator('details[open]').count() === 0);
    await page.setViewportSize({width: 1024, height: 768});
    check('нет горизонтального переполнения', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path: 'output/playwright/plain-language-analysis-1024.png'});
    check('нет ошибок браузера', errors.length === 0);
  } catch (error) {
    checks.push({name: 'Unexpected error', pass: false, message: String(error)});
    await page.screenshot({path: 'output/playwright/plain-language-error.png'});
  }
  return {checks, errors};
}
